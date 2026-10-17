import type { Database } from "bun:sqlite";
import type { SeasonStatsResult } from "../types";
import { RequestQueue, requestQueue } from "./requestQueue.service";
import { normalizePlatform } from "./trackerProfile.service";
import { SEASON_EXTRACTOR_VERSION, historyResult } from "./seasonPage.service";
import { seasonAverages } from "./seasonAverages.service";
import { seasonIdFromLabel } from "./seasonLabel.service";

export function verifiedHistory(result: SeasonStatsResult) {
  const coverage = result.coverage;
  if (
    result.extractorVersion !== SEASON_EXTRACTOR_VERSION ||
    !Array.isArray(coverage?.requested) ||
    !coverage.requested.length ||
    !Array.isArray(result.seasonData) ||
    !Number.isSafeInteger(coverage.available) ||
    coverage.available < coverage.requested.length
  )
    return false;
  const ids = new Set(coverage.requested.map((o) => o.id));
  const found = new Set(result.seasonData.map((r) => r.seasonId));
  const completed = coverage.requested
      .filter((o) => found.has(o.id))
      .map((o) => o.id),
    missing = coverage.requested
      .filter((o) => !found.has(o.id))
      .map((o) => o.id);
  return (
    ids.size === coverage.requested.length &&
    coverage.requested.every(
      (o) =>
        Number.isSafeInteger(o.id) &&
        o.id > 0 &&
        seasonIdFromLabel(o.label) === o.id,
    ) &&
    result.seasonData.every((r) => ids.has(r.seasonId!)) &&
    found.size === result.seasonData.length &&
    JSON.stringify(coverage.completed) === JSON.stringify(completed) &&
    JSON.stringify(coverage.missing) === JSON.stringify(missing) &&
    JSON.stringify(coverage.unavailable) ===
      JSON.stringify(
        coverage.requested
          .filter((o) =>
            result.seasonData.some((r) => r.seasonId === o.id && r.unavailable),
          )
          .map((o) => o.id),
      ) &&
    result.partial === missing.length > 0
  );
}
export class SeasonCache {
  private cooldown = new Map<string, number>();
  constructor(
    private db: Database,
    private fetcher: (
      name: string,
      platform: string,
      seasons: number,
      competitive: boolean,
      resume?: SeasonStatsResult,
    ) => Promise<SeasonStatsResult>,
    private queue: RequestQueue = requestQueue,
    private now: () => number = Date.now,
  ) {
    db.exec(
      "CREATE TABLE IF NOT EXISTS season_cache (cache_key TEXT PRIMARY KEY,result_json TEXT NOT NULL,fetched_at INTEGER NOT NULL)",
    );
  }
  key(name: string, platform: string, seasons: number, competitive: boolean) {
    return JSON.stringify([
      SEASON_EXTRACTOR_VERSION,
      normalizePlatform(platform) || platform,
      name.trim(),
      seasons,
      competitive,
    ]);
  }
  private saved(key: string): SeasonStatsResult | undefined {
    const row = this.db
      .query(
        "SELECT result_json,fetched_at FROM season_cache WHERE cache_key=?",
      )
      .get(key) as { result_json: string; fetched_at: number } | null;
    if (!row) return;
    try {
      const result = JSON.parse(row.result_json);
      if (!Array.isArray(result.seasonData)) return;
      return {
        ...result,
        fetchedAt: row.fetched_at,
        stale:
          !!result.partial ||
          !!result.refreshIncomplete ||
          this.now() - row.fetched_at > 3600000,
      };
    } catch {
      return;
    }
  }
  read(
    name: string,
    platform: string,
    seasons: number,
    competitive: boolean,
  ): SeasonStatsResult | undefined {
    const saved = this.saved(this.key(name, platform, seasons, competitive));
    if (saved && verifiedHistory(saved)) return saved;
    const legacy = this.saved(
      JSON.stringify([
        normalizePlatform(platform) || platform,
        name.trim(),
        seasons,
        competitive,
      ]),
    );
    return legacy ? { ...legacy, partial: true, stale: true } : undefined;
  }
  async get(
    name: string,
    platform: string,
    seasons: number,
    competitive: boolean,
  ): Promise<SeasonStatsResult> {
    const key = this.key(name, platform, seasons, competitive),
      cached = this.read(name, platform, seasons, competitive);
    if (cached) {
      if (cached.stale)
        void this.refresh(name, platform, seasons, competitive).catch((e) =>
          console.warn("Season refresh failed:", e.message),
        );
      return cached;
    }
    if ((this.cooldown.get(key) || 0) > this.now())
      return {
        seasonData: [],
        averageStats: [],
        failureReason: "fetch_failed",
        partial: true,
      };
    return this.refresh(name, platform, seasons, competitive);
  }
  refresh(
    name: string,
    platform: string,
    seasons: number,
    competitive: boolean,
  ): Promise<SeasonStatsResult> {
    const key = this.key(name, platform, seasons, competitive);
    if ((this.cooldown.get(key) || 0) > this.now())
      return Promise.resolve(
        this.read(name, platform, seasons, competitive) || {
          seasonData: [],
          averageStats: [],
          failureReason: "fetch_failed",
          partial: true,
        },
      );
    return this.queue.enqueue(
      async () => {
        const previous = this.saved(key);
        let fresh: SeasonStatsResult;
        try {
          fresh = await this.fetcher(
            name,
            platform,
            seasons,
            competitive,
            previous && verifiedHistory(previous) ? previous : undefined,
          );
        } catch {
          fresh = {
            seasonData: [],
            averageStats: [],
            failureReason: "fetch_failed",
          };
        }
        if (
          !fresh.failureReason &&
          verifiedHistory(fresh) &&
          fresh.seasonData.length
        ) {
          const combined = historyResult(
            fresh.coverage!.requested,
            fresh.coverage!.available,
            [
              ...(previous && verifiedHistory(previous)
                ? previous.seasonData
                : []),
              ...fresh.seasonData.map((row) =>
                row.unavailable && previous && verifiedHistory(previous)
                  ? (previous.seasonData.find(
                      (old) =>
                        old.seasonId === row.seasonId && !old.unavailable,
                    ) ?? row)
                  : row,
              ),
            ],
          );
          combined.refreshIncomplete =
            !!fresh.partial ||
            fresh.seasonData.some((r) => r.unavailable === true);
          combined.stale = !!combined.partial || combined.refreshIncomplete;
          combined.fetchedAt = this.now();
          combined.averageStats = seasonAverages(combined.seasonData);
          this.db
            .query(
              "INSERT INTO season_cache(cache_key,result_json,fetched_at) VALUES (?,?,?) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,fetched_at=excluded.fetched_at",
            )
            .run(key, JSON.stringify(combined), combined.fetchedAt!);
          this.cooldown.set(
            key,
            this.now() +
              (fresh.seasonData.some((r) => r.unavailable)
                ? 300000
                : combined.stale
                  ? 60000
                  : 0),
          );
          return combined;
        }
        this.cooldown.set(key, this.now() + 300000);
        const cached = this.read(name, platform, seasons, competitive);
        return cached ? { ...cached, stale: true } : fresh;
      },
      {
        key: `seasons:${key}`,
        priority: this.read(name, platform, seasons, competitive)
          ? "background"
          : "interactive",
      },
    );
  }
}
