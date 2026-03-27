import { describe, expect, test } from "bun:test";
import { buildTrackerProfileUrl, normalizePlatform } from "./trackerProfile.service";

describe("tracker profile helpers", () => {
  test("normalizes supported platforms", () => {
    expect(normalizePlatform("EPIC")).toBe("epic");
    expect(normalizePlatform("playstation")).toBe("psn");
    expect(normalizePlatform("steam")).toBe("steam");
  });

  test("rejects unsupported platform", () => {
    expect(normalizePlatform("switch")).toBeNull();
  });

  test("builds encoded tracker profile URLs", () => {
    const result = buildTrackerProfileUrl("steam", "name with space");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain("/steam/name%20with%20space/overview");
    }
  });

  test("rejects empty player name", () => {
    const result = buildTrackerProfileUrl("epic", "   ");
    expect(result.ok).toBe(false);
  });
});
