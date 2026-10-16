import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProfileHtml } from "../services/profileParser.service";
import { ProfileCache } from "../services/profileCache.service";
import { RequestQueue } from "../services/requestQueue.service";
import {
  MmrHistoryStore,
  summarizeHistory,
} from "../services/mmrHistory.service";
import {
  makeRankCardModel,
  historyGeometry,
  rankAppearance,
} from "../services/rankCardModel.service";
import generateRankCard, {
  rankCardHeight,
} from "../services/generateRankCard.service";
const profile = () =>
  parseProfileHtml(
    readFileSync(
      new URL("./fixtures/rank-table.html", import.meta.url),
      "utf8",
    ),
  );
const now = Date.now(),
  hour = 3600000;

test("linked-account cache preserves the supplied observation timestamp", () => {
  const folder = mkdtempSync(join(tmpdir(), "rl-style-timestamp-"));
  try {
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--eval",
        `
      import {db, linkAccount, updateStats, getAccount} from './services/database.service';
      linkAccount('test-user','player','epic');
      updateStats('test-user','[]',{playername:'player',platform:'epic'},777);
      console.log(getAccount('test-user').last_updated);db.close();
    `,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_PATH: join(folder, "test.sqlite") },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe("777");
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("same-timestamp refresh replaces the complete observation coherently", () => {
  const db = new Database(":memory:"),
    store = new MmrHistoryStore(db);
  const rows = profile().tableData!;
  store.record("epic:p", rows, now);
  store.record("epic:p", [{ ...rows[0], mmr: 600 }], now);
  expect(
    store.read("epic:p", [rows[0].playlist, rows[1].playlist], now)[
      rows[0].playlist
    ][0].mmr,
  ).toBe(600);
  expect(
    store.read("epic:p", [rows[0].playlist, rows[1].playlist], now)[
      rows[1].playlist
    ][0].mmr,
  ).toBeNull();
  expect(db.query("SELECT COUNT(*) n FROM mmr_observations").get()).toEqual({
    n: 1,
  });
  db.exec(
    "CREATE TRIGGER refuse_direct_history BEFORE INSERT ON mmr_history BEGIN SELECT RAISE(ABORT,'failed insert'); END",
  );
  expect(() => store.record("epic:p", rows, now)).toThrow("failed insert");
  expect(
    store.read("epic:p", [rows[0].playlist], now)[rows[0].playlist][0].mmr,
  ).toBe(600);
  db.close();
});

test("only successful fresh fetches record history; reads, coalescing and failures add none", async () => {
  const db = new Database(":memory:");
  let calls = 0;
  const cache = new ProfileCache(
    db,
    async () => (++calls === 1 ? profile() : { error: "blocked" }),
    new RequestQueue(0),
  );
  await Promise.all([cache.get("player", "epic"), cache.get("player", "epic")]);
  await cache.get("player", "epic");
  await cache.get("player", "epic", { refresh: true });
  expect(calls).toBe(2);
  expect(db.query("SELECT COUNT(*) n FROM mmr_observations").get()).toEqual({
    n: 1,
  });
  expect(db.query("SELECT COUNT(*) n FROM mmr_history").get()).toEqual({
    n: 7,
  });
  expect(cache.read("player", "epic")!.tableData!.length).toBe(7);
  db.close();
});
test("cache replacement and history append roll back together on disk-write failure", async () => {
  const db = new Database(":memory:");
  let mmr = 10;
  const cache = new ProfileCache(
    db,
    async () => {
      const p = profile();
      p.tableData![0].mmr = mmr;
      return p;
    },
    new RequestQueue(0),
  );
  await cache.get("player", "epic");
  mmr = 99;
  db.exec(
    "CREATE TRIGGER refuse_history BEFORE INSERT ON mmr_history BEGIN SELECT RAISE(ABORT,'history write failure'); END",
  );
  await expect(cache.get("player", "epic", { refresh: true })).rejects.toThrow(
    "history write failure",
  );
  expect(cache.read("player", "epic")!.tableData![0].mmr).toBe(10);
  expect(db.query("SELECT COUNT(*) n FROM mmr_observations").get()).toEqual({
    n: 1,
  });
  db.close();
});
test("history is snapshot bounded and missing playlists remain null gaps", () => {
  const db = new Database(":memory:"),
    store = new MmrHistoryStore(db),
    row = profile().tableData![0];
  store.record("epic:A", [{ ...row, mmr: 0 }], now - 3 * hour);
  store.record("epic:A", [], now - 2 * hour);
  store.record("epic:A", [{ ...row, mmr: 12 }], now - hour);
  store.record("epic:A", [{ ...row, mmr: 99 }], now);
  const points = store.read("epic:A", [row.playlist], now - hour)[row.playlist];
  expect(points.map((p) => p.mmr)).toEqual([0, null, 12]);
  expect(summarizeHistory(points, now - hour).delta).toBe(12);
  expect(store.read("epic:a", [row.playlist], now)).toEqual({});
  db.close();
});
test("history and graph windows are bounded and old observations expire", () => {
  const db = new Database(":memory:"),
    store = new MmrHistoryStore(db),
    row = profile().tableData![0];
  store.record("old", [row], now - 91 * 86400000);
  for (let i = 0; i < 1030; i++)
    store.record("new", [{ ...row, mmr: i }], now - 1030 * 60000 + i * 60000);
  expect(
    db
      .query("SELECT COUNT(*) n FROM mmr_observations WHERE profile_key='new'")
      .get(),
  ).toEqual({ n: 1024 });
  expect(
    db
      .query("SELECT COUNT(*) n FROM mmr_history WHERE profile_key='old'")
      .get(),
  ).toEqual({ n: 0 });
  expect(store.read("new", [row.playlist], now)[row.playlist]).toHaveLength(
    256,
  );
  db.close();
});
test("unsafe MMR never enters graphs; zero and decreases remain valid", () => {
  const points = [
    { at: now - 3 * hour, mmr: 15 },
    { at: now - 2 * hour, mmr: -1 },
    { at: now - hour, mmr: 0 },
    { at: now, mmr: NaN },
  ];
  const s = summarizeHistory(points, now);
  expect(s.points.map((p) => p.mmr)).toEqual([15, null, 0, null]);
  expect(s.delta).toBe(-15);
  expect(s.peak).toBe(15);
  expect(
    summarizeHistory([{ at: now, mmr: Number.MAX_SAFE_INTEGER + 1 }], now)
      .values,
  ).toHaveLength(0);
});
test("graph positions reflect elapsed time, break at missing data and stay finite for flat histories", () => {
  const points = [
    { at: now - 4 * hour, mmr: 10 },
    { at: now - 3 * hour, mmr: 10 },
    { at: now, mmr: 10 },
  ];
  const g = historyGeometry(points, 100, 50);
  expect(g.map((p) => p.x)).toEqual([0, 25, 100]);
  expect(g.every((p) => p.y === 25)).toBe(true);
  expect(
    historyGeometry(
      [
        { at: now - 10 * hour, mmr: 5 },
        { at: now, mmr: 6 },
      ],
      100,
      50,
    )[1].join,
  ).toBe(false);
  expect(
    historyGeometry(
      [
        { at: now - hour, mmr: null },
        { at: now, mmr: 6 },
      ],
      100,
      50,
    )[1].join,
  ).toBe(false);
  expect(historyGeometry([{ at: now, mmr: 0 }], 100, 50)[0].x).toBe(50);
});
test("all standard modes, unknown extra modes, stale time and missing division distances remain honest", () => {
  const row = profile().tableData![0];
  const m = makeRankCardModel(
    {
      name: "p",
      ranks: [
        { ...row, mmr: 0, nextMMR: null, playlist: "Tournament Matches" },
      ],
      fetchedAt: now - 2 * hour,
    },
    now,
  );
  expect(m.modes).toHaveLength(8);
  expect(m.available).toBe(1);
  expect(m.stale).toBe(true);
  expect(m.modes.at(-1)!.mmr).toBe(0);
  expect(m.modes.at(-1)!.progress).toBeNull();
  expect(m.modes[0].mmr).toBeNull();
  expect(makeRankCardModel({ name: "p", ranks: [] }, now).at).toBeNull();
  expect(rankAppearance("Grand Champion II").icon).toBe(20);
  expect(rankAppearance("Supersonic Legend").icon).toBe(22);
});
test("existing cache initialization creates no invented historical observation", () => {
  const db = new Database(":memory:");
  const cache = new ProfileCache(
    db,
    async () => profile(),
    new RequestQueue(0),
  );
  db.query(
    "INSERT INTO profile_cache(profile_key,result_json,fetched_at) VALUES (?,?,?)",
  ).run("epic:player", JSON.stringify(profile()), now);
  expect(cache.read("player", "epic")!.tableData).toHaveLength(7);
  expect(cache.history.read("epic:player", ["Ranked Duel 1v1"], now)).toEqual(
    {},
  );
  expect(cache.key(" Player ", "playstation")).toBe(cache.key("Player", "psn"));
  db.close();
});
test("attachment is a complete local PNG including all modes, long names and nullable data", async () => {
  const p = profile(),
    rank = p.tableData![0];
  rank.mmr = null;
  rank.icon = "https://invalid.example/must-not-fetch.png";
  const image = await generateRankCard({
    name: "A very long Unicode player 🏆 é name ".repeat(8),
    ranks: p.tableData!,
    fetchedAt: now - 2 * hour,
    stale: true,
  });
  const bytes = image.attachment as Buffer;
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(1280);
  expect(bytes.readUInt32BE(20)).toBe(rankCardHeight(7));
  expect(bytes.length).toBeLessThan(8 * 1024 * 1024);
  expect(image.name).toBe("rank.png");
  expect(image.description).toContain("Cached snapshot");
  expect(image.description).toContain("Snow Day");
});
