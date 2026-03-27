import { describe, expect, test } from "bun:test";
import { canonicalizeSeasonLabels, normalizeSeasonLabel, parseGamesFromLabel } from "./seasonLabel.service";

describe("season label helpers", () => {
  test("parses games from labeled season", () => {
    expect(parseGamesFromLabel("Season 21 (35)")).toBe(35);
    expect(parseGamesFromLabel("Season 14")).toBe(0);
  });

  test("normalizes modern season labels", () => {
    expect(normalizeSeasonLabel("Season 21 (35)")).toBe("S21 (35)");
    expect(normalizeSeasonLabel("Season 14")).toBe("Season 14");
  });

  test("drops duplicate legacy labels when modern labels exist", () => {
    const labels = [
      "Season 22 (36)",
      "Season 14 (28)",
      "Season 14",
      "Season 13",
      "Season 13 (27)",
      "Season 12",
    ];
    expect(canonicalizeSeasonLabels(labels)).toEqual([
      "Season 22 (36)",
      "Season 14 (28)",
      "Season 13 (27)",
      "Season 12",
    ]);
  });
});
