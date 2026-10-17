import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  seasonIdFromLabel,
  canonicalizeSeasonLabels,
} from "../services/seasonLabel.service";
import {
  seasonPage,
  seasonFromPage,
  historyResult,
  resumableSeason,
} from "../services/seasonPage.service";
import { SeasonCache, verifiedHistory } from "../services/seasonCache.service";
import { RequestQueue } from "../services/requestQueue.service";
import {
  boundedPage,
  matchesProfilePage,
  matchesSeasonResponse,
  readBrowserSeason,
} from "../services/getSeasonStats.service";
import type { SeasonData } from "../types";
const options = [
  { id: 38, label: "Season 24 (38)" },
  { id: 37, label: "Season 23 (37)" },
  { id: 14, label: "Season 14" },
];
const table = (n: string = "25") =>
  `<table class="trn-table"><tbody><tr><td class="name"><div class="playlist">Ranked Doubles 2v2</div></td><td class="matches"><div class="value">${n}</div></td></tr></tbody></table>`;
const html = (id: number, n = "25", extra = "") =>
  `<div class="multi-switch__item--selected">${options.find((o) => o.id === id)!.label}</div><div class="dropdown">${options.map((o) => `<li class="dropdown__item"><span class="dropdown__item-label">${o.label}</span></li>`).join("")}</div>${table(n)}${extra}`;
const row = (id: number, n: number): SeasonData => ({
  seasonId: id,
  season: options.find((o) => o.id === id)!.label,
  totalMatches: n,
  playlists: { "Ranked Doubles 2v2": { rank: "Unranked", matches: n } },
});

test("all38 modern/original season identities survive; aliases alone deduplicate", () => {
  const labels = [
    ...Array.from({ length: 24 }, (_, i) => `Season ${24 - i} (${38 - i})`),
    ...Array.from({ length: 14 }, (_, i) => `Season ${14 - i}`),
  ];
  expect(canonicalizeSeasonLabels([...labels, "S24 (38)", " "])).toHaveLength(
    38,
  );
  expect(seasonIdFromLabel("Season 14 (28)")).toBe(28);
  expect(seasonIdFromLabel("Season 14")).toBe(14);
});
test("historic rankless tables retain real counts and unknown/zero/invalid distinctions", () => {
  expect(seasonFromPage(html(37, "957"), options[1], true)?.totalMatches).toBe(
    957,
  );
  for (const count of ["N/A", "-7", "9007199254740992"])
    expect(
      seasonFromPage(html(37, count), options[1], true)?.totalMatches,
    ).toBeNull();
  expect(seasonFromPage(html(37, "0"), options[1], true)?.totalMatches).toBe(0);
  expect(seasonFromPage(html(38), options[1], true)).toBeNull();
});
test("loading tables cannot be attached to the newly selected label", () => {
  expect(
    seasonPage(html(37, "957", '<div class="loading-indicator"></div>')).busy,
  ).toBe(true);
  expect(
    seasonFromPage(
      html(37, "957", '<div class="loading-indicator"></div>'),
      options[1],
      true,
    ),
  ).toBeNull();
  expect(
    seasonFromPage(
      html(37, "957", '<div class="content--error">400 Server error</div>'),
      options[1],
      true,
    ),
  ).toBeNull();
});
test("explicit no matches is zero; generic unavailable/challenge is not", () => {
  const base = '<div class="multi-switch__item--selected">Season 14</div>';
  expect(
    seasonFromPage(
      base +
        '<table class="trn-table"><tbody><tr><td>No matches played this season</td></tr></tbody></table>',
      options[2],
      true,
    )?.totalMatches,
  ).toBe(0);
  expect(
    seasonFromPage(
      base +
        '<div class="content">No matches played</div><table class="trn-table"></table>',
      options[2],
      true,
    ),
  ).toBeNull();
  expect(
    seasonFromPage(
      base + '<div class="content">No data</div>',
      options[2],
      true,
    ),
  ).toBeNull();
  expect(
    seasonFromPage(
      base + "<title>Just a moment</title>" + table("2"),
      options[2],
      true,
    ),
  ).toBeNull();
});
test("only a verified settled empty table becomes unavailable, never zero", () => {
  const empty =
    '<div class="multi-switch__item--selected">Season 14</div><table class="trn-table"><tbody></tbody></table>';
  expect(seasonFromPage(empty, options[2], true)).toBeNull();
  const source = seasonFromPage(empty, options[2], true, true)!;
  expect(source.unavailable).toBe(true);
  expect(source.totalMatches).toBeNull();
  expect(source.playlists).toEqual({});
  expect(historyResult(options, 38, [source]).coverage?.unavailable).toEqual([
    14,
  ]);
  expect(
    seasonFromPage(
      empty + '<div class="loading-indicator"></div>',
      options[2],
      true,
      true,
    ),
  ).toBeNull();
});
test("unavailable refresh cannot erase populated prior counts and remains retryable", async () => {
  const db = new Database(":memory:");
  let now = Date.now(),
    empty = false;
  const cache = new SeasonCache(
    db,
    async () =>
      historyResult(
        options,
        38,
        options.map((o) =>
          empty
            ? {
                season: o.label,
                seasonId: o.id,
                playlists: {},
                totalMatches: null,
                unavailable: true,
              }
            : row(o.id, 10),
        ),
      ),
    new RequestQueue(0),
    () => now,
  );
  await cache.get("P", "epic", 0, true);
  empty = true;
  now += 3600001;
  const result = await cache.refresh("P", "epic", 0, true);
  expect(result.seasonData.map((s) => s.totalMatches)).toEqual([10, 10, 10]);
  expect(result.refreshIncomplete).toBe(true);
  expect(result.stale).toBe(true);
  expect(cache.read("P", "epic", 0, true)?.stale).toBe(true);
  db.close();
});
test("resume expires empty observations after5min and populated history after1h", () => {
  const now = Date.now(),
    known = { ...row(37, 20), fetchedAt: now - 300000 },
    empty = { ...known, unavailable: true };
  expect(resumableSeason(known, undefined, now)).toBe(true);
  expect(resumableSeason(empty, undefined, now)).toBe(false);
  expect(
    resumableSeason({ ...known, fetchedAt: now - 3600000 }, undefined, now),
  ).toBe(false);
  expect(
    resumableSeason({ ...known, fetchedAt: now + 1 }, undefined, now),
  ).toBe(false);
});
test("coverage follows requested source identities and rejects inconsistent provenance", () => {
  const result = historyResult(options, 38, [row(37, 957), row(14, 3)]);
  expect(result.coverage?.missing).toEqual([38]);
  expect(result.partial).toBe(true);
  expect(verifiedHistory(result)).toBe(true);
  expect(verifiedHistory({ ...result, partial: false })).toBe(false);
  expect(
    verifiedHistory({
      ...result,
      coverage: { ...result.coverage!, completed: [38, 37, 14] },
    }),
  ).toBe(false);
  expect(verifiedHistory({ ...result, coverage: {} as any })).toBe(false);
  expect(
    verifiedHistory({ ...result, seasonData: [row(37, 1), row(37, 2)] }),
  ).toBe(false);
});
test("legacy cache is preserved and explicitly partial while coalesced versioned refresh restores it", async () => {
  const db = new Database(":memory:");
  let fetched = 0;
  const cache = new SeasonCache(
    db,
    async () => {
      fetched++;
      return historyResult(
        options,
        38,
        options.map((o) => row(o.id, 10)),
      );
    },
    new RequestQueue(0),
  );
  const legacy = JSON.stringify(["epic", "P", 0, true]),
    saved = JSON.stringify({ seasonData: [row(38, 7)], averageStats: [] });
  db.query("INSERT INTO season_cache VALUES (?,?,?)").run(
    legacy,
    saved,
    Date.now(),
  );
  const old = await cache.get("P", "epic", 0, true);
  expect(old.partial).toBe(true);
  expect(old.stale).toBe(true);
  await cache.refresh("P", "epic", 0, true);
  expect(fetched).toBe(1);
  expect(cache.read("P", "epic", 0, true)?.partial).toBe(false);
  expect(
    (
      db
        .query("SELECT result_json FROM season_cache WHERE cache_key=?")
        .get(legacy) as any
    ).result_json,
  ).toBe(saved);
  db.close();
});
test("verified partial cache resumes by ID and becomes complete after disjoint successful fetch", async () => {
  const db = new Database(":memory:");
  let now = Date.now(),
    fetches = 0,
    seen: any;
  const cache = new SeasonCache(
    db,
    async (_n, _p, _s, _c, resume) => {
      seen = resume;
      return ++fetches === 1
        ? historyResult(options, 38, [row(38, 10)])
        : historyResult(options, 38, [row(37, 20), row(14, 30)]);
    },
    new RequestQueue(0),
    () => now,
  );
  expect((await cache.get("P", "epic", 0, true)).partial).toBe(true);
  now += 61000;
  const next = await cache.refresh("P", "epic", 0, true);
  expect(seen.seasonData.map((r: SeasonData) => r.seasonId)).toEqual([38]);
  expect(next.coverage?.completed).toEqual([38, 37, 14]);
  expect(next.partial).toBe(false);
  expect(next.refreshIncomplete).toBe(true);
  expect(next.stale).toBe(true);
  db.close();
});
test("failed or malformed refresh cannot overwrite good cache or its timestamp", async () => {
  const db = new Database(":memory:");
  let now = Date.now(),
    fail = false;
  const cache = new SeasonCache(
    db,
    async () =>
      fail
        ? { ...historyResult(options, 38, [row(38, 999)]), partial: false }
        : historyResult(
            options,
            38,
            options.map((o) => row(o.id, 10)),
          ),
    new RequestQueue(0),
    () => now,
  );
  const before = await cache.get("P", "epic", 0, true);
  fail = true;
  now += 3600001;
  const after = await cache.refresh("P", "epic", 0, true);
  expect(after.seasonData).toEqual(before.seasonData);
  expect(after.fetchedAt).toBe(before.fetchedAt);
  expect(after.stale).toBe(true);
  db.close();
});
test("cache identities separate profile, platform, limit and mode scope", async () => {
  const db = new Database(":memory:");
  const cache = new SeasonCache(
    db,
    async () => historyResult(options, 38, [row(38, 2)]),
    new RequestQueue(0),
  );
  await cache.get("P", "epic", 0, true);
  for (const [name, platform, seasons, competitive] of [
    ["p", "epic", 0, true],
    ["P", "steam", 0, true],
    ["P", "epic", 2, true],
    ["P", "epic", 0, false],
  ] as const)
    expect(cache.read(name, platform, seasons, competitive)).toBeUndefined();
  db.close();
});
test("season response and document identities reject wrong profile, site, season and redirect", () => {
  const path =
    "https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/P/segments/playlist?season=37";
  expect(matchesSeasonResponse(path, 37, "epic", "P")).toBe(true);
  expect(matchesSeasonResponse(path, 38, "epic", "P")).toBe(false);
  expect(matchesSeasonResponse(path, 37, "epic", "Other")).toBe(false);
  expect(
    matchesProfilePage(
      "https://rocketleague.tracker.network/rocket-league/profile/epic/Other/overview",
      "epic",
      "P",
    ),
  ).toBe(false);
});
test("bounded operation closes its old document before a timed-out result can be reused", async () => {
  let closed = false;
  await expect(
    boundedPage(
      {
        close: async () => {
          closed = true;
        },
      },
      () => new Promise(() => {}),
      10,
    ),
  ).rejects.toThrow("deadline");
  expect(closed).toBe(true);
});
test("without a reload, matching GET permits only unknown empty data, never stale counts or zero", async () => {
  const fake = (body: string, initial = 38) => {
    let selected = initial,
      closed = false;
    const response = {
      url: () =>
        "https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/P/segments/playlist?season=37",
      request: () => ({ method: () => "GET" }),
      status: () => 200,
      headers: () => ({ "content-type": "application/json" }),
      buffer: async () => Buffer.from("{}"),
    };
    return {
      url: () =>
        "https://rocketleague.tracker.network/rocket-league/profile/epic/P/overview",
      content: async () => {
        if (closed) throw new Error("closed");
        return `<div class="multi-switch__item--selected">${options.find((o) => o.id === selected)!.label}</div>${body}`;
      },
      waitForResponse: async (predicate: any) => {
        expect(predicate(response)).toBe(true);
        return response;
      },
      evaluate: async (_fn: any, ...args: any[]) => {
        if (closed) throw new Error("closed");
        if (args.length) {
          selected = 37;
          return true;
        }
        return false;
      },
      close: async () => {
        closed = true;
      },
    };
  };
  const empty = '<table class="trn-table"><tbody></tbody></table>';
  const page = fake(empty);
  const result = await boundedPage(
    page,
    () => readBrowserSeason(page, options[1], "epic", "P", true),
    500,
  );
  expect(result.unavailable).toBe(true);
  expect(result.totalMatches).toBeNull();
  for (const body of [
    table("25"),
    '<table class="trn-table"><tbody><tr><td>No matches played this season</td></tr></tbody></table>',
  ]) {
    const stale = fake(body);
    await expect(
      boundedPage(
        stale,
        () => readBrowserSeason(stale, options[1], "epic", "P", true),
        100,
      ),
    ).rejects.toThrow("deadline");
  }
  const initial = fake(empty, 37);
  await expect(
    boundedPage(
      initial,
      () => readBrowserSeason(initial, options[1], "epic", "P", true),
      100,
    ),
  ).rejects.toThrow("deadline");
});
test("reader checks first selected season rather than assuming menu index zero", async () => {
  const page = {
    url: () =>
      "https://rocketleague.tracker.network/rocket-league/profile/epic/P/overview",
    content: async () => html(38, "25"),
    evaluate: async () => {},
  };
  const value = await readBrowserSeason(page, options[0], "epic", "P", true);
  expect(value.seasonId).toBe(38);
  expect(value.totalMatches).toBe(25);
  await expect(
    readBrowserSeason(
      {
        ...page,
        url: () =>
          "https://rocketleague.tracker.network/rocket-league/profile/epic/Other/overview",
      },
      options[0],
      "epic",
      "P",
      true,
    ),
  ).rejects.toThrow("Unexpected profile");
});
