import { mock } from "bun:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import { OrganizationSettings } from "../../services/organizationSettings.service";
const db = new Database(":memory:");
db.exec(
  "PRAGMA foreign_keys=ON;CREATE TABLE users(discord_id TEXT PRIMARY KEY);CREATE TABLE guild_themes(guild_id TEXT PRIMARY KEY,theme_id TEXT NOT NULL)",
);
const store = new OrganizationSettings(db),
  guild = "123456789012345678",
  other = "223456789012345678",
  user = "323456789012345678",
  role = "423456789012345678";
let manage = false,
  roles: string[] = [],
  operator = false;
mock.module(
  fileURLToPath(
    new URL("../../services/organization.service.ts", import.meta.url),
  ),
  () => ({ organizations: store }),
);
mock.module(
  fileURLToPath(
    new URL("../../services/guildAuthorization.service.ts", import.meta.url),
  ),
  () => ({
    guildActor: async () => ({ id: user, manage, roles }),
    isBotOperator: async () => operator,
  }),
);
mock.module(
  fileURLToPath(new URL("../../services/database.service.ts", import.meta.url)),
  () => ({ db, getAccount: () => null }),
);
const config = await import("../../commands/config/config");
const org = await import("../../commands/organization/organization");
const theme = await import("../../commands/theme/theme");
process.env.THEME_EDITOR_BASE_URL = "https://tracker.example.test";
let n = 0;
async function run(
  command: any,
  action: string,
  values: any = {},
  server: string | null = guild,
) {
  const replies: any[] = [];
  const i: any = {
    guildId: server,
    user: { id: user },
    deferred: false,
    options: {
      getSubcommand: () => action,
      getString: (key: string) => values[key] ?? null,
      getBoolean: (key: string) => values[key] ?? null,
      getRole: () => ({ id: values.role ?? role, managed: !!values.managed }),
    },
    deferReply: async () => {
      i.deferred = true;
    },
    editReply: async (p: any) => replies.push(p),
    reply: async (p: any) => replies.push(p),
  };
  await command.execute({} as any, i);
  n++;
  const result = replies.at(-1);
  assert.deepEqual(result.allowedMentions, { parse: [] });
  return result.embeds[0].toJSON();
}
assert.match(
  (await run(org, "apply", { name: "Example", website: "https://example.org" }))
    .description,
  /Manage Server/,
);
manage = true;
assert.equal(
  (await run(org, "apply", { name: "Example", website: "https://example.org" }))
    .title,
  "Application received",
);
assert.match((await run(theme, "editor")).description, /Organization access/);
assert.match(
  (await run(org, "review", { server: guild, decision: "approved" }))
    .description,
  /Only the bot/,
);
operator = true;
assert.equal(
  (await run(org, "review", { server: guild, decision: "approved" })).title,
  "Organization access updated",
);
operator = false;
assert.match(
  (await run(theme, "editor")).description,
  /https:\/\/tracker.example.test\/editor\/[\w-]{43}/,
);
assert.equal(
  (await run(config, "role", { scope: "themes", role, allowed: true })).title,
  "Server settings",
);
manage = false;
roles = [role];
assert.match((await run(theme, "editor")).description, /Open your editor/);
assert.equal(
  (await run(theme, "server", { style: "slate" })).title,
  "Server theme updated",
);
assert.match(
  (await run(config, "role", { scope: "settings", role, allowed: true }))
    .description,
  /Ask a server admin/,
);
assert.match(
  (await run(config, "editor", { enabled: false })).description,
  /Ask a server admin/,
);
manage = true;
await run(config, "role", { scope: "settings", role, allowed: true });
manage = false;
assert.match(
  (
    await run(config, "role", {
      scope: "settings",
      role: "523456789012345678",
      allowed: true,
    })
  ).description,
  /Manage Server/,
);
assert.equal(
  (await run(config, "editor", { enabled: false })).title,
  "Server settings",
);
assert.match((await run(theme, "editor")).description, /disabled/);
assert.equal(
  (await run(config, "editor", { enabled: true })).title,
  "Server settings",
);
assert.equal((await run(config, "revoke-links")).title, "Server settings");
assert.match(
  (await run(theme, "editor", {}, other)).description,
  /Ask a server admin/,
);
assert.match((await run(config, "show", {}, null)).description, /server/);
manage = true;
assert.match(
  (await run(config, "role", { scope: "themes", role: guild, allowed: true }))
    .description,
  /@everyone/,
);
assert.match(
  (
    await run(config, "role", {
      scope: "themes",
      role,
      managed: true,
      allowed: true,
    })
  ).description,
  /regular server role/,
);
assert.match((await run(org, "status")).description, /approved/);
assert.match((await run(org, "pending")).description, /Only the bot/);
assert.match(
  (await run(org, "inspect", { server: guild })).description,
  /Only the bot/,
);
operator = true;
const inspected = await run(org, "inspect", { server: guild });
assert.equal(inspected.title, "Organization application");
assert(
  inspected.fields.some(
    (f: any) => f.name === "Website" && f.value === "https://example.org",
  ),
);
assert.equal(
  (await run(org, "pending")).description,
  "No pending applications.",
);
assert.equal(
  (await run(org, "review", { server: guild, decision: "revoked" })).title,
  "Organization access updated",
);
operator = false;
assert.match((await run(theme, "editor")).description, /Organization access/);
assert.equal(store.approved(guild), false);
for (const command of [config, org, theme])
  assert(command.data.toJSON().options!.length <= 25);
db.close();
console.log(`${n} settings and organization command scenarios passed`);
