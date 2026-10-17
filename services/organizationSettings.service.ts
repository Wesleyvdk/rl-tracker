import { EditorInputError } from "./editorErrors.service";
import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import {
  defaultEditorTheme,
  editorCardTheme,
  validateEditorTheme,
  type EditorTheme,
} from "./editorTheme.service";
import type { CardTheme } from "./themeRegistry.service";
export const LINK_TTL = 24 * 3600000;
export const hashSecret = (v: string) =>
  createHash("sha256").update(v).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
const snowflake = /^\d{17,20}$/;
export type PermissionScope = "settings" | "themes";
export interface GuildActor {
  id: string;
  manage: boolean;
  roles: string[];
}
export interface EditorLink {
  token_hash: string;
  guild_id: string;
  user_id: string;
  expires_at: number;
  revoked: number;
}
export class OrganizationSettings {
  constructor(
    readonly db: Database,
    readonly now = () => Date.now(),
  ) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS bot_guild_settings(guild_id TEXT PRIMARY KEY,editor_enabled INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS bot_setting_roles(guild_id TEXT NOT NULL,scope TEXT NOT NULL,role_id TEXT NOT NULL,PRIMARY KEY(guild_id,scope,role_id));
      CREATE TABLE IF NOT EXISTS organization_access(guild_id TEXT PRIMARY KEY,name TEXT NOT NULL,website TEXT NOT NULL,requested_by TEXT NOT NULL,status TEXT NOT NULL,updated_at INTEGER NOT NULL,reviewed_by TEXT);
      CREATE TABLE IF NOT EXISTS theme_editor_links(token_hash TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS theme_editor_links_guild ON theme_editor_links(guild_id,created_at);
      CREATE TABLE IF NOT EXISTS theme_editor_auth(secret_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,link_hash TEXT NOT NULL REFERENCES theme_editor_links(token_hash) ON DELETE CASCADE,browser_hash TEXT NOT NULL,user_id TEXT,csrf TEXT,expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS theme_editor_auth_expiry ON theme_editor_auth(expires_at);
      CREATE TABLE IF NOT EXISTS organization_theme_drafts(guild_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS organization_theme_revisions(theme_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,created_by TEXT NOT NULL,created_at INTEGER NOT NULL,UNIQUE(guild_id,revision));
      CREATE TABLE IF NOT EXISTS bot_settings_audit(id INTEGER PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL);
    `);
  }
  private guild(id: string) {
    if (!snowflake.test(id))
      throw new EditorInputError("Use this command in a server.");
  }
  audit(guild: string, user: string, action: string) {
    this.db
      .query(
        "INSERT INTO bot_settings_audit(guild_id,user_id,action,at) VALUES (?,?,?,?)",
      )
      .run(guild, user, action, this.now());
    this.db
      .query(
        "DELETE FROM bot_settings_audit WHERE guild_id=? AND id NOT IN (SELECT id FROM bot_settings_audit WHERE guild_id=? ORDER BY id DESC LIMIT 500)",
      )
      .run(guild, guild);
  }
  approved(guild: string) {
    return (
      (
        this.db
          .query("SELECT status FROM organization_access WHERE guild_id=?")
          .get(guild) as any
      )?.status === "approved"
    );
  }
  application(guild: string) {
    return this.db
      .query(
        "SELECT guild_id,name,website,requested_by,status,updated_at FROM organization_access WHERE guild_id=?",
      )
      .get(guild);
  }
  applications() {
    return this.db
      .query(
        "SELECT guild_id,name,status FROM organization_access WHERE status='pending' ORDER BY updated_at LIMIT 20",
      )
      .all();
  }
  apply(guild: string, user: string, name: string, website: string) {
    this.guild(guild);
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 80 ||
      /[\p{Cc}\p{Cf}<>]/u.test(name)
    )
      throw new EditorInputError(
        "Use an organization name up to 80 characters.",
      );
    let u: URL;
    try {
      u = new URL(website);
    } catch {
      throw new EditorInputError("Use an https organization website.");
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      website.length > 200
    )
      throw new EditorInputError("Use an https organization website.");
    const current = this.application(guild) as any;
    if (current?.status === "approved")
      throw new EditorInputError(
        "This server already has organization access.",
      );
    if (current?.updated_at > this.now() - LINK_TTL)
      throw new EditorInputError(
        "An application was already submitted today. Use /organization status.",
      );
    this.db
      .query(
        "INSERT INTO organization_access(guild_id,name,website,requested_by,status,updated_at) VALUES (?,?,?,?,'pending',?) ON CONFLICT(guild_id) DO UPDATE SET name=excluded.name,website=excluded.website,requested_by=excluded.requested_by,status='pending',updated_at=excluded.updated_at,reviewed_by=NULL",
      )
      .run(guild, name.trim(), website, user, this.now());
    this.audit(guild, user, "organization.apply");
  }
  review(
    guild: string,
    user: string,
    status: "approved" | "denied" | "revoked",
  ) {
    this.guild(guild);
    this.db.transaction(() => {
      const result = this.db
        .query(
          "UPDATE organization_access SET status=?,reviewed_by=?,updated_at=? WHERE guild_id=?",
        )
        .run(status, user, this.now(), guild);
      if (!result.changes)
        throw new EditorInputError("No application exists for that server.");
      if (status !== "approved") this.revokeLinks(guild, user);
      this.audit(guild, user, `organization.${status}`);
    })();
  }
  settings(guild: string) {
    return {
      enabled:
        (
          this.db
            .query(
              "SELECT editor_enabled FROM bot_guild_settings WHERE guild_id=?",
            )
            .get(guild) as any
        )?.editor_enabled !== 0,
      roles: this.db
        .query(
          "SELECT scope,role_id FROM bot_setting_roles WHERE guild_id=? ORDER BY scope,role_id",
        )
        .all(guild) as { scope: PermissionScope; role_id: string }[],
    };
  }
  can(guild: string, actor: GuildActor, scope: PermissionScope) {
    return (
      actor.manage ||
      this.settings(guild).roles.some(
        (r) => r.scope === scope && actor.roles.includes(r.role_id),
      )
    );
  }
  setEnabled(guild: string, user: string, enabled: boolean) {
    this.guild(guild);
    this.db.transaction(() => {
      this.db
        .query(
          "INSERT INTO bot_guild_settings(guild_id,editor_enabled) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET editor_enabled=excluded.editor_enabled",
        )
        .run(guild, enabled ? 1 : 0);
      if (!enabled) this.revokeLinks(guild, user);
      this.audit(guild, user, `editor.${enabled ? "enabled" : "disabled"}`);
    })();
  }
  setRole(
    guild: string,
    user: string,
    scope: PermissionScope,
    role: string,
    add: boolean,
  ) {
    this.guild(guild);
    if (
      !snowflake.test(role) ||
      role === guild ||
      !["themes", "settings"].includes(scope)
    )
      throw new EditorInputError("Choose a server role other than @everyone.");
    if (add && this.settings(guild).roles.length >= 40)
      throw new EditorInputError("This server already has 40 delegated roles.");
    if (add)
      this.db
        .query(
          "INSERT OR IGNORE INTO bot_setting_roles(guild_id,scope,role_id) VALUES (?,?,?)",
        )
        .run(guild, scope, role);
    else
      this.db
        .query(
          "DELETE FROM bot_setting_roles WHERE guild_id=? AND scope=? AND role_id=?",
        )
        .run(guild, scope, role);
    this.audit(guild, user, `role.${scope}.${add ? "add" : "remove"}:${role}`);
  }
  ensureEditor(guild: string) {
    if (!this.approved(guild))
      throw new EditorInputError(
        "Organization access is required. Use /organization apply.",
      );
    if (!this.settings(guild).enabled)
      throw new EditorInputError(
        "The theme editor is disabled for this server.",
      );
  }
  cleanup() {
    this.db
      .query("DELETE FROM theme_editor_auth WHERE expires_at<=?")
      .run(this.now());
    // Keep a week of expired invitation digests; raw URL tokens are never persisted.
    this.db
      .query("DELETE FROM theme_editor_links WHERE expires_at<?")
      .run(this.now() - 7 * LINK_TTL);
  }
  issueLink(guild: string, user: string) {
    this.guild(guild);
    this.ensureEditor(guild);
    this.cleanup();
    const recent = this.db
      .query(
        "SELECT COUNT(*) AS n FROM theme_editor_links WHERE guild_id=? AND created_at>?",
      )
      .get(guild, this.now() - 3600000) as any;
    if (recent.n >= 20)
      throw new EditorInputError(
        "Too many editor links this hour. Try again later.",
      );
    for (let i = 0; i < 3; i++) {
      const token = newSecret(),
        digest = hashSecret(token),
        expiresAt = this.now() + LINK_TTL;
      const r = this.db
        .query(
          "INSERT OR IGNORE INTO theme_editor_links(token_hash,guild_id,user_id,expires_at,created_at) VALUES (?,?,?,?,?)",
        )
        .run(digest, guild, user, expiresAt, this.now());
      if (r.changes) {
        this.audit(guild, user, "editor.link");
        return { token, expiresAt };
      }
    }
    throw new EditorInputError("Couldn't reserve an editor URL. Try again.");
  }
  linkHash(digest: string): EditorLink {
    const row = this.db
      .query("SELECT * FROM theme_editor_links WHERE token_hash=?")
      .get(digest) as EditorLink | null;
    if (!row || row.revoked || row.expires_at <= this.now())
      throw new EditorInputError(
        "This editor link has expired or was revoked. Request a new one in Discord.",
      );
    this.ensureEditor(row.guild_id);
    return row;
  }
  link(token: string) {
    if (!/^[\w-]{43}$/.test(token))
      throw new EditorInputError("Invalid editor link.");
    return this.linkHash(hashSecret(token));
  }
  revokeLinks(guild: string, user: string) {
    this.db
      .query("UPDATE theme_editor_links SET revoked=1 WHERE guild_id=?")
      .run(guild);
    this.db
      .query(
        "DELETE FROM theme_editor_auth WHERE link_hash IN (SELECT token_hash FROM theme_editor_links WHERE guild_id=?)",
      )
      .run(guild);
    this.audit(guild, user, "editor.revoke");
  }
  draft(guild: string) {
    const d = this.db
      .query(
        "SELECT revision,data FROM organization_theme_drafts WHERE guild_id=?",
      )
      .get(guild) as any;
    return {
      revision: d?.revision ?? 0,
      theme: d ? validateEditorTheme(JSON.parse(d.data)) : defaultEditorTheme(),
    };
  }
  save(guild: string, user: string, expected: number, theme: unknown) {
    this.ensureEditor(guild);
    const valid = validateEditorTheme(theme);
    return this.db.transaction(() => {
      const current = this.draft(guild);
      if (!Number.isSafeInteger(expected) || expected !== current.revision)
        throw new EditorInputError(
          "This draft changed in another editor. Reload before saving.",
        );
      const revision = current.revision + 1;
      this.db
        .query(
          "INSERT INTO organization_theme_drafts(guild_id,revision,data,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
        )
        .run(guild, revision, JSON.stringify(valid), user, this.now());
      return { revision, theme: valid };
    })();
  }
  publish(guild: string, user: string, expected: number) {
    this.ensureEditor(guild);
    return this.db.transaction(() => {
      const d = this.draft(guild);
      if (
        !Number.isSafeInteger(expected) ||
        !expected ||
        d.revision !== expected
      )
        throw new EditorInputError("Save the latest draft before applying.");
      const recent = this.db
        .query(
          "SELECT COUNT(*) AS n FROM organization_theme_revisions WHERE guild_id=? AND created_at>?",
        )
        .get(guild, this.now() - 3600000) as any;
      const count = this.db
        .query(
          "SELECT COUNT(*) AS n FROM organization_theme_revisions WHERE guild_id=?",
        )
        .get(guild) as any;
      if (recent.n >= 10 || count.n >= 1000)
        throw new EditorInputError(
          "Theme publish limit reached. Existing themes remain available.",
        );
      const id = `custom-${guild}-${d.revision}`;
      if (this.get(id))
        throw new EditorInputError(
          "This revision is already applied. Save a new draft to make changes.",
        );
      this.db
        .query(
          "INSERT INTO organization_theme_revisions(theme_id,guild_id,revision,data,created_by,created_at) VALUES (?,?,?,?,?,?)",
        )
        .run(id, guild, d.revision, JSON.stringify(d.theme), user, this.now());
      this.db
        .query(
          "INSERT INTO guild_themes(guild_id,theme_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET theme_id=excluded.theme_id",
        )
        .run(guild, id);
      this.audit(guild, user, `theme.publish:${d.revision}`);
      return id;
    })();
  }
  get(id: string): Readonly<CardTheme> | undefined {
    if (!/^custom-\d{17,20}-[1-9]\d{0,9}$/.test(id)) return undefined;
    const r = this.db
      .query("SELECT data FROM organization_theme_revisions WHERE theme_id=?")
      .get(id) as any;
    return r ? editorCardTheme(JSON.parse(r.data), id) : undefined;
  }
  allowed(id: string, guild?: string | null) {
    if (
      !guild ||
      !this.approved(guild) ||
      !/^custom-\d{17,20}-[1-9]\d{0,9}$/.test(id)
    )
      return false;
    return !!this.db
      .query(
        "SELECT theme_id FROM organization_theme_revisions WHERE theme_id=? AND guild_id=?",
      )
      .get(id, guild);
  }
  available(guild?: string | null): Readonly<CardTheme>[] {
    if (!guild || !this.approved(guild)) return [];
    const r = this.db
      .query(
        "SELECT theme_id FROM organization_theme_revisions WHERE guild_id=? ORDER BY revision DESC LIMIT 1",
      )
      .get(guild) as any;
    const theme = r ? this.get(r.theme_id) : undefined;
    return theme ? [theme] : [];
  }
}
