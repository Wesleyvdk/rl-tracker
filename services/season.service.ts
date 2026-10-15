import { db } from "./database.service";
import { requestQueue } from "./requestQueue.service";
import getSeasonStats from "./getSeasonStats.service";
import type { SeasonStatsResult } from "../types";
db.exec(
  "CREATE TABLE IF NOT EXISTS season_cache (cache_key TEXT PRIMARY KEY,result_json TEXT NOT NULL,fetched_at INTEGER NOT NULL)",
);
export async function getSeasonStatsCached(
  name: string,
  platform: string,
  seasons: number,
  competitive: boolean,
): Promise<SeasonStatsResult> {
  const key = JSON.stringify([platform, name.trim(), seasons, competitive]);
  const saved = db
    .query("SELECT result_json,fetched_at FROM season_cache WHERE cache_key=?")
    .get(key) as { result_json: string; fetched_at: number } | null;
  let cached: SeasonStatsResult | undefined;
  if (saved) {
    try {
      cached = {
        ...JSON.parse(saved.result_json),
        fetchedAt: saved.fetched_at,
        stale: Date.now() - saved.fetched_at > 3600000,
      };
    } catch {}
  }
  const refresh = () =>
    requestQueue.enqueue(
      async () => {
        const result = await getSeasonStats(
          name,
          platform,
          seasons,
          competitive,
        );
        if (result.seasonData.length && !result.failureReason) {
          result.fetchedAt = Date.now();
          db.query(
            "INSERT INTO season_cache(cache_key,result_json,fetched_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,fetched_at=excluded.fetched_at",
          ).run(key, JSON.stringify(result), result.fetchedAt);
        }
        return result;
      },
      {
        key: `seasons:${key}`,
        priority: cached ? "background" : "interactive",
      },
    );
  if (cached) {
    if (cached.stale)
      void refresh().catch((error) =>
        console.warn("Season refresh failed:", error.message),
      );
    return cached;
  }
  return refresh();
}
