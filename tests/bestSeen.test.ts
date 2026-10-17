import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { parseProfileHtml } from "../services/profileParser.service";
import { makeRankCardModel } from "../services/rankCardModel.service";
import { ProfileCache } from "../services/profileCache.service";
import { RequestQueue } from "../services/requestQueue.service";
import generateRankCard from "../services/generateRankCard.service";

const row = parseProfileHtml(
  readFileSync(new URL("./fixtures/rank-table.html", import.meta.url), "utf8"),
).tableData![0];

test("best streak includes the current streak, preserves larger records, and keeps unknowns distinct from zero", () => {
  const cases: [
    number | null | undefined,
    number | undefined,
    number | null,
  ][] = [
    [5, undefined, 5],
    [5, 2, 5],
    [5, 9, 9],
    [5, 0, 5],
    [0, undefined, 0],
    [-3, undefined, 0],
    [-3, 7, 7],
    [null, undefined, null],
    [undefined, undefined, null],
    [null, 0, 0],
    [null, 8, 8],
    [NaN, undefined, null],
    [Infinity, undefined, null],
    [Number.MAX_SAFE_INTEGER + 1, undefined, null],
    [1.5, undefined, null],
    [5, -1, 5],
    [null, NaN, null],
    [null, -2, null],
  ];
  for (const [streak, retained, expected] of cases) {
    const model = makeRankCardModel({
      name: "Player",
      ranks: [{ ...row, streak: streak as number | null }],
      bestWinStreaks:
        retained === undefined ? undefined : { [row.playlist]: retained },
    });
    expect(
      model.modes.find((m) => m.playlist === row.playlist)!.bestWinStreak,
    ).toBe(expected);
    expect(
      model.modes.find((m) => m.playlist !== row.playlist)!.bestWinStreak,
    ).toBeNull();
  }
});

test("a pre-history cached winning streak renders as best streak without writing observations", async () => {
  const db = new Database(":memory:");
  let fetches = 0;
  const cache = new ProfileCache(
    db,
    async () => {
      fetches++;
      return {};
    },
    new RequestQueue(0),
  );
  const at = Date.now(),
    profile = { tableData: [{ ...row, streak: 5 }], fetchedAt: at };
  db.query(
    "INSERT INTO profile_cache(profile_key,result_json,fetched_at) VALUES (?,?,?)",
  ).run("epic:Player", JSON.stringify(profile), at);
  try {
    const before = db.serialize();
    const cached = await cache.get("Player", "epic");
    const best = cache.history.bestWinStreaks("epic:Player", at);
    expect(best).toEqual({});
    const image = await generateRankCard({
      name: "Player",
      ranks: cached.tableData!,
      fetchedAt: cached.fetchedAt,
      bestWinStreaks: best,
    });
    expect(image.description).toContain(
      `${row.playlist}: ${row.rank}, ${row.mmr} MMR, best streak 5 wins`,
    );
    expect(fetches).toBe(0);
    expect(db.query("SELECT COUNT(*) n FROM mmr_history").get()).toEqual({
      n: 0,
    });
    expect(db.query("SELECT COUNT(*) n FROM mmr_observations").get()).toEqual({
      n: 0,
    });
    expect(Buffer.from(db.serialize())).toEqual(Buffer.from(before));
  } finally {
    db.close();
  }
});

test("saved best remains scoped to the displayed snapshot and playlist", () => {
  const db = new Database(":memory:"),
    at = Date.now();
  const cache = new ProfileCache(db, async () => ({}), new RequestQueue(0));
  try {
    cache.history.record("epic:Player", [{ ...row, streak: 3 }], at - 1000);
    cache.history.record("epic:Player", [{ ...row, streak: 12 }], at + 1000);
    const snapshot = {
      name: "Player",
      ranks: [{ ...row, streak: 5 }],
      fetchedAt: at,
      bestWinStreaks: cache.history.bestWinStreaks("epic:Player", at),
    };
    expect(makeRankCardModel(snapshot).modes[0].bestWinStreak).toBe(5);
    expect(snapshot.bestWinStreaks[row.playlist]).toBe(3);
    expect(
      cache.history.bestWinStreaks("epic:Player", at + 1000)[row.playlist],
    ).toBe(12);
  } finally {
    db.close();
  }
});
