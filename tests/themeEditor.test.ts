import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OrganizationSettings,
  LINK_TTL,
  hashSecret,
} from "../services/organizationSettings.service";
import {
  defaultEditorTheme,
  editorCardTheme,
  validateEditorTheme,
} from "../services/editorTheme.service";
import { createThemeEditorHandler } from "../services/themeEditorWeb.service";
import { ThemeRegistry } from "../services/themeRegistry.service";
import { ThemePreferences } from "../services/themePreferences.service";
import { createCardStyle, contrast } from "../services/cardTheme.service";
import { rankAppearance } from "../services/rankCardModel.service";
const guild = "123456789012345678",
  other = "223456789012345678",
  user = "323456789012345678",
  outsider = "423456789012345678",
  role = "523456789012345678",
  origin = "https://tracker.example.test";
function fixture(file = ":memory:") {
  const db = new Database(file);
  db.exec(
    "PRAGMA foreign_keys=ON;CREATE TABLE IF NOT EXISTS users(discord_id TEXT PRIMARY KEY);INSERT OR IGNORE INTO users VALUES ('323456789012345678')",
  );
  const registry = new ThemeRegistry(
    JSON.parse(
      readFileSync(new URL("../themes/catalog.json", import.meta.url), "utf8"),
    ),
  );
  const prefs = new ThemePreferences(db, registry);
  let now = Date.now();
  const store = new OrganizationSettings(db, () => now);
  registry.attachCustom(store);
  store.apply(guild, user, "Example organization", "https://example.org");
  store.review(guild, user, "approved");
  return { db, store, registry, prefs, advance: (ms: number) => (now += ms) };
}
test("only approved servers can issue editors; applications remain isolated and rate bounded", () => {
  const { db, store } = fixture();
  try {
    expect(() => store.issueLink(other, user)).toThrow("Organization access");
    store.apply(other, user, "Other", "https://example.net");
    expect(store.approved(other)).toBe(false);
    expect(() =>
      store.apply(other, user, "Other", "https://example.net"),
    ).toThrow("today");
    for (let n = 0; n < 20; n++) store.issueLink(guild, user);
    expect(() => store.issueLink(guild, user)).toThrow("Too many");
    expect(() =>
      store.apply("bad", user, "Other", "https://example.net"),
    ).toThrow();
  } finally {
    db.close();
  }
});
test("invitations use unique digests, persist expiry and revocation, and never store raw tokens", () => {
  const dir = mkdtempSync(join(tmpdir(), "rl-editor-")),
    file = join(dir, "db.sqlite");
  try {
    const f = fixture(file),
      a = f.store.issueLink(guild, user),
      b = f.store.issueLink(guild, user);
    expect(a.token).not.toBe(b.token);
    const rows = f.db.query("SELECT * FROM theme_editor_links").all();
    expect(JSON.stringify(rows)).not.toContain(a.token);
    expect(JSON.stringify(rows)).toContain(hashSecret(a.token));
    f.db.close();
    const db = new Database(file),
      store = new OrganizationSettings(db, () => a.expiresAt - 1);
    expect(store.link(a.token).guild_id).toBe(guild);
    store.revokeLinks(guild, user);
    expect(() => store.link(a.token)).toThrow("revoked");
    db.close();
    const r = fixture();
    const link = r.store.issueLink(guild, user);
    r.advance(LINK_TTL);
    expect(() => r.store.link(link.token)).toThrow("expired");
    r.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("settings and theme roles are distinct; disabling/revoking admission closes sessions", () => {
  const { db, store } = fixture();
  try {
    const actor = { id: user, manage: false, roles: [role] };
    expect(store.can(guild, actor, "themes")).toBe(false);
    store.setRole(guild, user, "themes", role, true);
    expect(store.can(guild, actor, "themes")).toBe(true);
    expect(store.can(guild, actor, "settings")).toBe(false);
    expect(store.can(other, actor, "themes")).toBe(false);
    expect(() => store.setRole(guild, user, "themes", guild, true)).toThrow();
    const a = store.issueLink(guild, user);
    store.setEnabled(guild, user, false);
    expect(() => store.link(a.token)).toThrow();
    expect(() => store.issueLink(guild, user)).toThrow("disabled");
    store.setEnabled(guild, user, true);
    const b = store.issueLink(guild, user);
    store.review(guild, user, "revoked");
    expect(() => store.link(b.token)).toThrow();
    store.review(guild, user, "approved");
    expect(() => store.link(b.token)).toThrow("revoked");
  } finally {
    db.close();
  }
});
test("draft CAS and immutable published IDs preserve old cards and cross-guild ownership", () => {
  const { db, store, registry, prefs } = fixture();
  try {
    expect(prefs.resolve(user, guild)).toBe("rose");
    const d = store.save(guild, user, 0, defaultEditorTheme());
    expect(() => store.save(guild, user, 0, d.theme)).toThrow("another editor");
    const id = store.publish(guild, user, d.revision);
    expect(prefs.guildTheme(guild)).toBe(id);
    expect(registry.allowed(id, guild)).toBe(true);
    expect(registry.allowed(id, other)).toBe(false);
    expect(registry.allowed(id)).toBe(false);
    prefs.setUser(user, id, guild);
    expect(prefs.resolve(user, other)).toBe("rose");
    const original = registry.get(id);
    const next = store.save(guild, user, 1, { ...d.theme, brand: "NEW BRAND" });
    const second = store.publish(guild, user, next.revision);
    expect(id).not.toBe(second);
    expect(registry.get(id)).toEqual(original);
    expect(registry.get(second)?.brand).toBe("NEW BRAND");
    expect(prefs.guildTheme(guild)).toBe(second);
    expect(() => store.publish(guild, user, next.revision)).toThrow(
      "already applied",
    );
    store.review(guild, user, "revoked");
    expect(prefs.guildTheme(guild)).toBe("rose");
    expect(prefs.resolve(user, guild)).toBe("rose");
    expect(registry.get(id)).toEqual(original);
  } finally {
    db.close();
  }
});
test("design tokens reject code/URLs, bad bounds and unreadable palettes", () => {
  expect(validateEditorTheme(defaultEditorTheme()).base).toBe("rose");
  for (const mutate of [
    (v: any) => (v.brand = "<script>"),
    (v: any) => (v.logo = "https://example.org/a.png"),
    (v: any) => (v.background.style = "url(foo)"),
    (v: any) => (v.background.end = "red"),
    (v: any) => (v.radius = 100),
    (v: any) => (v.colors.text = v.colors.surface),
    (v: any) => (v.colors.accent = "javascript:x"),
    (v: any) => (v.name = "a\nname"),
  ]) {
    const v = defaultEditorTheme();
    mutate(v);
    expect(() => validateEditorTheme(v)).toThrow();
  }
  expect(Object.isFrozen(editorCardTheme(defaultEditorTheme()).colors)).toBe(
    true,
  );
});
test("rank color follows rank in Rose and Slate with readable subdued colors", () => {
  const rose = createCardStyle("rose"),
    slate = createCardStyle("slate");
  const values = [
    "Bronze I",
    "Silver I",
    "Gold I",
    "Platinum I",
    "Diamond I",
    "Champion I",
    "Grand Champion I",
    "Supersonic Legend",
  ].map((rank) => {
    const source = rankAppearance(rank).color;
    const a = rose.rankColor(source),
      b = slate.rankColor(source);
    expect(a).toBe(b);
    expect(contrast(a, rose.colors.surface)).toBeGreaterThanOrEqual(4.5);
    return a;
  });
  expect(new Set(values).size).toBe(8);
});
async function webFixture() {
  const f = fixture();
  let identity = user,
    manage = true,
    roles: string[] = [],
    lookupFails = false,
    exchanges = 0;
  const handler = createThemeEditorHandler({
    baseUrl: origin,
    clientId: "1324382848979042414",
    clientSecret: "test-only",
    store: f.store,
    authorize: async (_g, u) => {
      if (lookupFails) throw new Error("unavailable");
      return { id: u, manage, roles };
    },
    exchangeCode: async () => {
      exchanges++;
      return identity;
    },
  });
  const request = (path: string, options: RequestInit = {}) =>
    handler(new Request(origin + path, options));
  const link = f.store.issueLink(guild, user);
  async function login(which = link.token, browserOverride?: string) {
    const start = await request("/auth/start/" + which),
      u = new URL(start.headers.get("location")!),
      flow = start.headers.get("set-cookie")!.split(";")[0];
    const r = await request(
      "/oauth/callback?code=fake&state=" + u.searchParams.get("state"),
      { headers: { cookie: browserOverride ?? flow } },
    );
    return {
      r,
      state: u.searchParams.get("state"),
      flow,
      cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
    };
  }
  const signed = await login();
  expect(signed.r.status).toBe(302);
  const headers = {
    cookie: signed.cookie,
    origin,
    "Content-Type": "application/json",
  };
  const initial = await request("/api/theme", { headers });
  const state = (await initial.json()) as any;
  const csrf = state.csrf;
  const post = (
    path: string,
    data: unknown,
    extra: Record<string, string> = {},
  ) =>
    request(path, {
      method: "POST",
      headers: { ...headers, "X-CSRF-Token": csrf, ...extra },
      body: JSON.stringify(data),
    });
  return {
    ...f,
    handler,
    request,
    login,
    link,
    signed,
    state,
    post,
    headers,
    setIdentity: (v: string) => (identity = v),
    setManage: (v: boolean) => (manage = v),
    setRoles: (v: string[]) => (roles = v),
    setFail: (v: boolean) => (lookupFails = v),
    exchanges: () => exchanges,
  };
}
test("OAuth state is browser-bound, single-use, issuer-checked and identity-bound", async () => {
  const f = await webFixture();
  try {
    const replay = await f.request(
      "/oauth/callback?code=fake&state=" + f.signed.state,
      { headers: { cookie: f.signed.flow } },
    );
    expect(replay.status).toBe(401);
    expect(f.exchanges()).toBe(1);
    const wrongBrowser = await f.login(
      f.link.token,
      "__Host-rl_oauth=" + "x".repeat(43),
    );
    expect(wrongBrowser.r.status).toBe(401);
    f.setIdentity(outsider);
    const outsiderLogin = await f.login();
    expect(outsiderLogin.r.status).toBe(403);
    expect(outsiderLogin.cookie).toBe("");
    expect(f.signed.r.headers.get("set-cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax",
    );
    expect(f.signed.r.headers.get("location")).toBe(origin + "/editor");
  } finally {
    f.db.close();
  }
});
test("editor requires session and exact Origin/CSRF; tokens alone cannot preview/save/apply", async () => {
  const f = await webFixture();
  try {
    expect((await f.request("/api/theme")).status).toBe(401);
    expect(
      (
        await f.request("/api/theme", {
          headers: { cookie: "__Host-rl_editor=" + f.link.token },
        })
      ).status,
    ).toBe(401);
    const data = { revision: 0, theme: defaultEditorTheme() };
    expect(
      (await f.post("/api/save", data, { "X-CSRF-Token": "wrong" })).status,
    ).toBe(403);
    expect(
      (await f.post("/api/save", data, { origin: "https://attacker.example" }))
        .status,
    ).toBe(403);
    const save = await f.post("/api/save", data);
    expect(save.status).toBe(200);
    expect(
      (await f.post("/api/apply", { revision: 1, guild: other })).status,
    ).toBe(200);
    expect(f.prefs.guildTheme(guild)).toBe("custom-" + guild + "-1");
    expect(f.prefs.guildTheme(other)).toBe("rose");
    expect(
      (await f.handler(new Request("https://evil.example/editor"))).status,
    ).toBe(421);
  } finally {
    f.db.close();
  }
});
test("role removal, editor disable, admission revocation and expiry block existing sessions", async () => {
  const f = await webFixture();
  try {
    const data = { revision: 0, theme: defaultEditorTheme() };
    f.setManage(false);
    expect((await f.post("/api/save", data)).status).toBe(403);
    f.store.setRole(guild, user, "themes", role, true);
    f.setRoles([role]);
    expect((await f.post("/api/save", data)).status).toBe(200);
    f.store.setRole(guild, user, "themes", role, false);
    expect(
      (
        await f.post("/api/preview", {
          theme: defaultEditorTheme(),
          kind: "rank",
        })
      ).status,
    ).toBe(403);
    f.setManage(true);
    f.setFail(true);
    expect((await f.post("/api/apply", { revision: 1 })).status).toBe(403);
    f.setFail(false);
    f.advance(LINK_TTL);
    expect((await f.post("/api/apply", { revision: 1 })).status).toBe(401);
  } finally {
    f.db.close();
  }
});
test("every card preview uses the local production renderer and validation", async () => {
  const f = await webFixture();
  try {
    for (const kind of ["rank", "leaderboard", "history"]) {
      const r = await f.post("/api/preview", {
        theme: defaultEditorTheme(),
        kind,
      });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      const png = Buffer.from(await r.arrayBuffer());
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(1280);
    }
    expect(
      (
        await f.post("/api/preview", {
          theme: { ...defaultEditorTheme(), radius: 99 },
          kind: "rank",
        })
      ).status,
    ).toBe(400);
    expect(f.store.draft(guild).revision).toBe(0);
    const page = await f.request("/editor/" + f.link.token);
    expect(page.headers.get("cache-control")).toBe("no-store, private");
    expect(page.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
  } finally {
    f.db.close();
  }
});
test("editor request sizes, preview types and session request rate are bounded", async () => {
  const f = await webFixture();
  try {
    expect(
      (await f.post("/api/save", { revision: 0, theme: "x".repeat(17000) }))
        .status,
    ).toBe(413);
    expect(
      (
        await f.post("/api/preview", {
          theme: defaultEditorTheme(),
          kind: "unknown",
        })
      ).status,
    ).toBe(400);
    for (let n = 0; n < 60; n++)
      await f.request("/api/theme", { headers: f.headers });
    expect((await f.request("/api/theme", { headers: f.headers })).status).toBe(
      429,
    );
  } finally {
    f.db.close();
  }
});

test("slow bodies release all request slots and cannot apply after cancellation", async () => {
  const f = fixture();
  try {
    const invitation = f.store.issueLink(guild, user);
    const secret = "s".repeat(43),
      csrf = "c".repeat(43);
    f.store.db
      .query(
        "INSERT INTO theme_editor_auth(secret_hash,kind,link_hash,browser_hash,user_id,csrf,expires_at) VALUES (?,'session',?,'',?,?,?)",
      )
      .run(
        hashSecret(secret),
        hashSecret(invitation.token),
        user,
        csrf,
        invitation.expiresAt,
      );
    const handler = createThemeEditorHandler({
      baseUrl: origin,
      clientId: "1324382848979042414",
      clientSecret: "fake",
      store: f.store,
      ioTimeoutMs: 30,
      authorize: async () => ({ id: user, manage: true, roles: [] }),
    });
    let cancelled = 0;
    const hangs = Array.from({ length: 8 }, () =>
      handler(
        new Request(origin + "/api/save", {
          method: "POST",
          headers: {
            cookie: "__Host-rl_editor=" + secret,
            origin,
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
          },
          body: new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode("{"));
            },
            cancel() {
              cancelled++;
              return new Promise(() => {});
            },
          }),
        }),
      ),
    );
    expect(
      (
        await handler(
          new Request(origin + "/api/theme", {
            headers: { cookie: "__Host-rl_editor=" + secret },
          }),
        )
      ).status,
    ).toBe(503);
    expect((await Promise.all(hangs)).map((r) => r.status)).toEqual(
      Array(8).fill(408),
    );
    expect(cancelled).toBe(8);
    expect(
      (
        await handler(
          new Request(origin + "/api/theme", {
            headers: { cookie: "__Host-rl_editor=" + secret },
          }),
        )
      ).status,
    ).toBe(200);
    expect(f.store.draft(guild).revision).toBe(0);
  } finally {
    f.db.close();
  }
});
test("hanging authorization is cancelled and cannot later save a draft", async () => {
  const f = fixture();
  try {
    const invitation = f.store.issueLink(guild, user),
      secret = "s".repeat(43),
      csrf = "c".repeat(43);
    let signal: AbortSignal | undefined;
    f.store.db
      .query(
        "INSERT INTO theme_editor_auth(secret_hash,kind,link_hash,browser_hash,user_id,csrf,expires_at) VALUES (?,'session',?,'',?,?,?)",
      )
      .run(
        hashSecret(secret),
        hashSecret(invitation.token),
        user,
        csrf,
        invitation.expiresAt,
      );
    let release!: (actor: any) => void;
    const handler = createThemeEditorHandler({
      baseUrl: origin,
      clientId: "1324382848979042414",
      clientSecret: "fake",
      store: f.store,
      ioTimeoutMs: 20,
      authorize: async (_g, _u, s) => {
        signal = s;
        return new Promise((resolve) => (release = resolve));
      },
    });
    const r = await handler(
      new Request(origin + "/api/save", {
        method: "POST",
        headers: {
          cookie: "__Host-rl_editor=" + secret,
          origin,
          "X-CSRF-Token": csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ revision: 0, theme: defaultEditorTheme() }),
      }),
    );
    expect(r.status).toBe(403);
    expect(signal?.aborted).toBe(true);
    release({ id: user, manage: true, roles: [] });
    await Promise.resolve();
    expect(f.store.draft(guild).revision).toBe(0);
  } finally {
    f.db.close();
  }
});
