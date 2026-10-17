import { describe, expect, test } from "bun:test";
import {
  canonicalizeSeasonLabels,
  normalizeSeasonLabel,
  seasonIdFromLabel,
} from "./seasonLabel.service";

describe("season label helpers", () => {
  test("reads season identity rather than interpreting it as games", () => {
    expect(seasonIdFromLabel("Season 21 (35)")).toBe(35);
    expect(seasonIdFromLabel("Season 14")).toBe(14);
    expect(seasonIdFromLabel("Unknown")).toBeNull();
  });

  test("normalizes modern season labels", () => {
    expect(normalizeSeasonLabel("Season 21 (35)")).toBe("S21");
    expect(normalizeSeasonLabel("Season 14")).toBe("Legacy S14");
  });

  test("keeps distinct original and modern seasons sharing a number", () => {
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
      "Season 14",
      "Season 13",
      "Season 13 (27)",
      "Season 12",
    ]);
  });
});
