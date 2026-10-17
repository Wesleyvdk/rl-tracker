import { test, expect } from "bun:test";
import generateAverage from "../services/generateAverageCard.service";
import { averageModel } from "../services/averageCardModel.service";
import type { SeasonData } from "../types";

test("unavailable legacy tail does not create empty pages or dilute match averages", async () => {
  const known: SeasonData[] = Array.from({ length: 23 }, (_, i) => ({
    season: `S${24 - i}`,
    seasonId: 38 - i,
    totalMatches: 100,
    playlists: { "Doubles 2v2": { rank: "Gold I", matches: 100 } },
  }));
  const unknown: SeasonData[] = Array.from({ length: 15 }, (_, i) => ({
    season: `Legacy S${15 - i}`,
    seasonId: 15 - i,
    totalMatches: null,
    unavailable: true,
    playlists: {},
  }));
  const source = [...known, ...unknown],
    before = structuredClone(source);
  const images = await generateAverage({ name: "Player", seasonData: source });
  expect(images).toHaveLength(2);
  expect(images.map((i) => i.description).join(" ")).not.toContain("Legacy");
  expect(images[1].description).toContain("S2: 100");
  expect(averageModel(source).known).toBe(2300);
  expect(averageModel(source).average).toBe(100);
  expect(averageModel(source).averages[0].averageMatches).toBe(100);
  expect(source).toEqual(before);
});

test("real zeroes, explicit no-matches and partially known seasons remain visible", async () => {
  const source: SeasonData[] = [
    {
      season: "Real zero",
      totalMatches: 0,
      playlists: { Duel: { rank: "Unranked", matches: 0 } },
    },
    {
      season: "Explicit zero",
      totalMatches: 0,
      noMatches: true,
      playlists: {},
    },
    {
      season: "Partial",
      totalMatches: null,
      playlists: {
        Duel: { rank: "Gold I", matches: 7 },
        Hoops: { rank: "Unranked", matches: null },
      },
    },
    {
      season: "Unknown",
      totalMatches: null,
      playlists: { Duel: { rank: "Unranked", matches: null } },
    },
  ];
  const images = await generateAverage({ name: "Player", seasonData: source });
  expect(images).toHaveLength(1);
  expect(images[0].description).toContain("Real zero: 0 matches");
  expect(images[0].description).toContain("Explicit zero: 0 matches");
  expect(images[0].description).toContain("Partial: 7 partial matches");
  expect(images[0].description).not.toContain("Unknown:");
  const m = averageModel(source);
  expect(m.known).toBe(7);
  expect(m.average).toBe(0);
  expect(m.partial).toBe(true);
});

test("all unknown match counts produce no blank attachment", async () => {
  expect(
    await generateAverage({
      name: "Player",
      seasonData: [
        {
          season: "Legacy S1",
          unavailable: true,
          totalMatches: null,
          playlists: {},
        },
      ],
    }),
  ).toEqual([]);
  expect(await generateAverage({ name: "Player", seasonData: [] })).toEqual([]);
});
