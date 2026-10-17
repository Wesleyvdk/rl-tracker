// Runs in its own Bun process so module mocks cannot affect parser/render tests.
// No app.ts import, Discord client, real database, browser or network transport.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import { AttachmentBuilder } from "discord.js";
import { fileURLToPath } from "node:url";

const modulePath = (name: string) =>
  fileURLToPath(new URL(`../../services/${name}.service.ts`, import.meta.url));
const image = () => new AttachmentBuilder(Buffer.from("mock"), { name: "test.png" });
let account: any = null, accounts: any[] = [], profile: any, season: any;
let cached: any, renderFailure = false, dbFailure = false, removed = true;
let calls: any[][] = [], rendered: any[][] = [];
const row = { playlist: "Duel 1v1", mmr: 0, rank: "Unranked", streak: 3 };
class HistoryCardLimitError extends Error {}
mock.module(modulePath("database"), () => ({
  getAccount: () => account,
  getAllAccounts: () => accounts,
  updateStats: (...args: any[]) => calls.push(["update", ...args]),
  linkAccount: (...args: any[]) => {
    if (dbFailure) throw new Error("disk error");
    calls.push(["link", ...args]);
  },
  unlinkAccount: () => {
    if (dbFailure) throw new Error("disk error");
    return removed;
  },
}));
mock.module(modulePath("profile"), () => ({ profileCache: {
  get: async (...args: any[]) => { calls.push(["get", ...args]); return profile; },
  read: () => cached,
  key: (name: string, platform: string) => `${platform}:${name}`,
  history: {
    bestWinStreaks: (...args: any[]) => { calls.push(["best", ...args]); return { "Duel 1v1": 7 }; },
    read: (...args: any[]) => { calls.push(["history", ...args]); return {}; },
  },
} }));
mock.module(modulePath("season"), () => ({
  getSeasonStatsCached: async (...args: any[]) => { calls.push(["season", ...args]); return season; },
}));
for (const kind of ["Rank", "Leaderboard", "Average"]) {
  mock.module(modulePath(`generate${kind}Card`), () => ({
    ...(kind === "Average" ? { HistoryCardLimitError } : {}),
    default: async (...args: any[]) => {
      if (renderFailure) throw new HistoryCardLimitError("Choose fewer seasons.");
      rendered.push([kind, ...args]);
      return kind === "Rank" ? image() : [image(), image()];
    },
  }));
}
const rank = await import("../../commands/rankCheck/rank");
const avg = await import("../../commands/avgMatches/avgmatches");
const board = await import("../../commands/leaderboard/leaderboard");
const link = await import("../../commands/link/link");
const unlink = await import("../../commands/unlink/unlink");
const errors: unknown[][] = [];
console.error = (...args) => { errors.push(args); };
function reset() {
  account = null; accounts = []; cached = null; calls = []; rendered = [];
  dbFailure = renderFailure = false; removed = true;
  profile = { tableData: [row], fetchedAt: 12345, stale: true };
  season = { seasonData: [{ season: "Season 1", playlists: {} }], averageStats: [], fetchedAt: 12345, stale: true };
}
function interaction(options: Record<string, unknown> = {}, inGuild = true) {
  const replies: any[][] = [];
  const i: any = {
    user: { id: "user" }, deferred: false, replied: false,
    options: Object.fromEntries(["getString", "getInteger", "getBoolean"].map(method => [method, (key: string) => options[key] ?? null])),
    guild: inGuild ? { name: "Test guild", members: { fetch: async (id: string) => {
      if (id === "outsider") throw new Error("not a member");
      return { id };
    } } } : null,
    deferReply: async () => { assert.equal(i.replied || i.deferred, false); i.deferred = true; replies.push(["defer"]); },
    reply: async (p: any) => { assert.equal(i.replied || i.deferred, false); i.replied = true; replies.push(["reply", p]); },
    editReply: async (p: any) => { assert.equal(i.replied || i.deferred, true); replies.push(["edit", p]); },
  };
  return { i, replies };
}
function payload(run: ReturnType<typeof interaction>) {
  const p = run.replies.at(-1)![1];
  assert.deepEqual(p.allowedMentions.parse, []);
  if (!run.i.deferred) assert.equal(p.flags, 64);
  return p;
}
function title(run: ReturnType<typeof interaction>) { return payload(run).embeds[0].toJSON().title; }
let scenarios = 0;
async function scenario(fn: () => Promise<void>) { reset(); await fn(); scenarios++; }

for (const command of [rank, avg]) {
  await scenario(async () => { const r = interaction(); await command.execute(null as any, r.i); assert.equal(title(r), "Profile needed"); });
  await scenario(async () => { account = { playername: "P", platform: "invalid" }; const r = interaction(); await command.execute(null as any, r.i); assert.equal(title(r), "Invalid profile"); assert.equal(calls.length, 0); });
}
await scenario(async () => {
  account = { playername: "P", platform: "steam" };
  const r = interaction(); await rank.execute(null as any, r.i);
  assert.equal(payload(r).files.length, 1);
  assert.deepEqual(calls.find(c => c[0] === "update")!.slice(3), [account, 12345]);
  assert.deepEqual(calls.find(c => c[0] === "best"), ["best", "steam:P", 12345]);
  assert.equal(rendered[0][1].stale, true); assert.equal(rendered[0][1].bestWinStreaks["Duel 1v1"], 7);
});
await scenario(async () => {
  account = { playername: "Linked", platform: "steam" };
  const r = interaction({ playername: "Other" }); await rank.execute(null as any, r.i);
  assert.deepEqual(calls.find(c => c[0] === "get"), ["get", "Other", "epic"]);
  assert.equal(calls.some(c => c[0] === "update"), false);
});
await scenario(async () => { profile = { failureReason: "profile_not_found" }; const r = interaction({ playername: "P" }); await rank.execute(null as any, r.i); assert.equal(title(r), "Stats unavailable"); assert.equal(calls.some(c => c[0] === "update"), false); });
await scenario(async () => { renderFailure = true; const r = interaction({ playername: "P" }); await rank.execute(null as any, r.i); assert.equal(title(r), "Couldn't load ranks"); });
await scenario(async () => {
  const r = interaction({ playername: "P", platform: "psn", seasons: 0, competitive_only: false });
  await avg.execute(null as any, r.i); assert.equal(payload(r).files.length, 2);
  assert.deepEqual(calls.find(c => c[0] === "season"), ["season", "P", "psn", 0, false]);
  assert.equal(rendered[0][1].fetchedAt, 12345); assert.equal(rendered[0][1].stale, true);
});
await scenario(async () => { season = { seasonData: [], failureReason: "profile_not_found" }; const r = interaction({ playername: "P" }); await avg.execute(null as any, r.i); assert.equal(title(r), "History unavailable"); });
await scenario(async () => { renderFailure = true; const r = interaction({ playername: "P" }); await avg.execute(null as any, r.i); assert.equal(title(r), "Couldn't load history"); assert.equal(payload(r).embeds[0].toJSON().description, "Choose fewer seasons."); });
await scenario(async () => { const r = interaction({ mode: "competitive" }, false); await board.execute(null as any, r.i); assert.equal(title(r), "Server only"); });
await scenario(async () => { const r = interaction({ mode: "wrong" }); await board.execute(null as any, r.i); assert.equal(title(r), "Choose a mode"); });
await scenario(async () => { const r = interaction({ mode: "competitive" }); await board.execute(null as any, r.i); assert.equal(title(r), "No linked players"); });
await scenario(async () => {
  accounts = [{ discord_id: "user", playername: "P", platform: "epic" }, { discord_id: "outsider", playername: "Hidden", platform: "epic" }];
  cached = { tableData: [row], fetchedAt: 12345, stale: true };
  const r = interaction({ mode: "competitive" }); await board.execute(null as any, r.i);
  assert.equal(payload(r).files.length, 2); assert.equal(rendered[0][1].length, 1);
  assert.equal(rendered[0][1][0].fetchedAt, 12345); assert.equal(calls.filter(c => c[0] === "get").length, 1);
});
await scenario(async () => { accounts = [{ discord_id: "user", playername: "P", platform: "epic" }]; const r = interaction({ mode: "extra" }); await board.execute(null as any, r.i); assert.equal(title(r), "No ranks yet"); assert.equal(calls.filter(c => c[0] === "get").length, 1); });
await scenario(async () => { const r = interaction({ playername: "@everyone **P**", platform: "xbox" }); await link.execute(null as any, r.i); assert.equal(title(r), "Profile linked"); assert.match(payload(r).embeds[0].toJSON().description, /\\\*\\\*P/); assert.deepEqual(calls[0], ["link", "user", "@everyone **P**", "xbox"]); });
await scenario(async () => { const r = interaction({ playername: "P", platform: "bad" }); await link.execute(null as any, r.i); assert.equal(title(r), "Invalid profile"); assert.equal(calls.length, 0); });
await scenario(async () => { dbFailure = true; const r = interaction({ playername: "P" }); await link.execute(null as any, r.i); assert.equal(title(r), "Couldn't link profile"); });
await scenario(async () => { const r = interaction(); await unlink.execute(null as any, r.i); assert.equal(title(r), "Profile unlinked"); });
await scenario(async () => { removed = false; const r = interaction(); await unlink.execute(null as any, r.i); assert.equal(title(r), "Nothing to unlink"); });
await scenario(async () => { dbFailure = true; const r = interaction(); await unlink.execute(null as any, r.i); assert.equal(title(r), "Couldn't unlink profile"); });
assert.equal(errors.length, 4);
console.log(`${scenarios} isolated command scenarios passed; no Discord transport`);
