import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import {
  parseProfileHtml,
  parseInteger,
  type ProfileResult,
} from "../services/profileParser.service";
import { ProfileCache } from "../services/profileCache.service";
import { RequestQueue } from "../services/requestQueue.service";
import { rankCardHeight } from "../services/generateRankCard.service";
const fixture = readFileSync(
  new URL("./fixtures/rank-table.html", import.meta.url),
  "utf8",
);
const result = () => parseProfileHtml(fixture);

test("captured table includes all ranked playlists and source-provided thresholds", () => {
  const profile = result();
  expect(profile.error).toBeUndefined();
  expect(profile.tableData?.length).toBe(7);
  const duel = profile.tableData!.find(
    (row) => row.playlist === "Ranked Duel 1v1",
  )!;
  expect(duel.mmr).toBe(980);
  expect(duel.matches).toBe(0);
  expect(duel.nextMMR).toBe(56);
  expect(duel.prevMMR).toBeNull();
  expect(
    profile.tableData!.find((row) => row.playlist === "Snow Day"),
  ).toBeDefined();
  expect(
    profile.tableData!.find((row) => row.playlist === "Rumble"),
  ).toBeDefined();
});
test("missing numbers remain null and numeric zero stays zero", () => {
  expect(parseInteger("N/A")).toBeNull();
  expect(parseInteger("")).toBeNull();
  expect(parseInteger("1,674")).toBe(1674);
  expect(parseInteger("0")).toBe(0);
});
test("HTTP success with an error page cannot become successful stats", () => {
  expect(
    parseProfileHtml(
      "<html><title>Player</title><body>400 Server Error Network Error</body></html>",
    ).failureReason,
  ).toBe("table_unavailable");
  expect(
    parseProfileHtml("<title>Just a moment...</title>").failureReason,
  ).toBe("blocked");
  expect(
    parseProfileHtml('<div class="content--error">Player Not Found</div>')
      .failureReason,
  ).toBe("profile_not_found");
});
test("seven modes fit inside the image canvas", () => {
  expect(rankCardHeight(7)).toBeGreaterThanOrEqual(125 + 3 * 255 + 230);
});
test("simultaneous profile requests share one retrieval and persist the snapshot", async () => {
  const db = new Database(":memory:");
  let calls = 0;
  const cache = new ProfileCache(
    db,
    async () => {
      calls++;
      await Promise.resolve();
      return result();
    },
    new RequestQueue(0),
  );
  const [first, second] = await Promise.all([
    cache.get("player", "epic"),
    cache.get("player", "epic"),
  ]);
  expect(calls).toBe(1);
  expect(first.tableData).toEqual(second.tableData);
  expect(cache.read("player", "epic")!.stale).toBe(false);
  db.close();
});
test("failed refresh preserves the last successful snapshot and enters cooldown", async () => {
  const db = new Database(":memory:");
  let calls = 0;
  const cache = new ProfileCache(
    db,
    async () =>
      ++calls === 1 ? result() : { error: "Blocked", failureReason: "blocked" },
    new RequestQueue(0),
  );
  await cache.get("player", "epic");
  db.query("UPDATE profile_cache SET fetched_at=0").run();
  const refreshed = await cache.get("player", "epic", { refresh: true });
  expect(refreshed.tableData?.length).toBe(7);
  expect(refreshed.stale).toBe(true);
  await cache.get("player", "epic", { refresh: true });
  expect(calls).toBe(2);
  expect(cache.read("player", "epic")!.tableData!.length).toBe(7);
  db.close();
});
test("queue prioritizes interactive work and continues after a failed job", async () => {
  const queue = new RequestQueue(0);
  const order: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  const first = queue.enqueue(() => barrier);
  const background = queue.enqueue(
    async () => {
      order.push("background");
    },
    { priority: "background" },
  );
  const foreground = queue.enqueue(async () => {
    order.push("interactive");
    throw new Error("expected");
  });
  const failure = foreground.then(
    () => {
      throw new Error("Expected failure");
    },
    (error) => {
      expect(error.message).toBe("expected");
    },
  );
  release();
  await Promise.all([first, background, failure]);
  expect(order).toEqual(["interactive", "background"]);
});

test("season averages distinguish missing match counts from zero", async () => {
  const { seasonAverages } = await import("../services/seasonAverages.service");
  const stats = seasonAverages([
    { season: "S1", playlists: { Duel: { rank: "Champion I", matches: 0 } } },
    { season: "S2", playlists: { Duel: { rank: "Unranked", matches: null } } },
  ]);
  expect(stats[0].averageMatches).toBe(0);
  expect(stats[0].averageRankName).toBe("Champion I");
});
