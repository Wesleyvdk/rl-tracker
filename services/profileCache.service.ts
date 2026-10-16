import type { Database } from "bun:sqlite";
import type { ProfileResult } from "./profileParser.service";
import { RequestQueue, requestQueue } from "./requestQueue.service";
import { MmrHistoryStore } from "./mmrHistory.service";
import { normalizePlatform } from "./trackerProfile.service";

export class ProfileCache {
  private failures = new Map<string, number>();
  readonly history: MmrHistoryStore;
  constructor(
    private db: Database,
    private fetcher: (name: string, platform: string) => Promise<ProfileResult>,
    private queue: RequestQueue = requestQueue,
    private ttlMs = 3600000,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS profile_cache (
      profile_key TEXT PRIMARY KEY, result_json TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      last_error TEXT, last_attempt INTEGER
    )`);
    this.history = new MmrHistoryStore(db);
  }
  key(name: string, platform: string) {
    return `${normalizePlatform(platform) || platform}:${name.trim()}`;
  }
  read(name: string, platform: string): ProfileResult | undefined {
    const row = this.db
      .query(
        "SELECT result_json,fetched_at FROM profile_cache WHERE profile_key=?",
      )
      .get(this.key(name, platform)) as {
      result_json: string;
      fetched_at: number;
    } | null;
    if (!row) return;
    try {
      return {
        ...JSON.parse(row.result_json),
        fetchedAt: row.fetched_at,
        stale: Date.now() - row.fetched_at > this.ttlMs,
      };
    } catch {
      return;
    }
  }
  async get(
    name: string,
    platform: string,
    options: {
      refresh?: boolean;
      priority?: "interactive" | "background";
    } = {},
  ): Promise<ProfileResult> {
    const key = this.key(name, platform),
      cached = this.read(name, platform);
    if (cached && !options.refresh) {
      if (cached.stale)
        void this.refresh(name, platform, "background").catch((error) =>
          console.warn("Background refresh failed:", error.message),
        );
      return cached;
    }
    if (!options.refresh && (this.failures.get(key) || 0) > Date.now())
      return {
        error: "Tracker is temporarily unavailable. Please retry shortly.",
        failureReason: "fetch_failed",
      };
    return this.refresh(name, platform, options.priority || "interactive");
  }
  refresh(
    name: string,
    platform: string,
    priority: "interactive" | "background" = "background",
  ): Promise<ProfileResult> {
    const key = this.key(name, platform);
    if ((this.failures.get(key) || 0) > Date.now())
      return Promise.resolve(
        this.read(name, platform) || {
          error: "Refresh is cooling down after an upstream failure.",
          failureReason: "fetch_failed",
        },
      );
    return this.queue.enqueue(
      async () => {
        let result: ProfileResult;
        try {
          result = await this.fetcher(name, platform);
        } catch {
          result = {
            error: "Profile retrieval failed.",
            failureReason: "fetch_failed",
          };
        }
        if (result.tableData?.length && !result.error) {
          result = { ...result, fetchedAt: Date.now(), stale: false };
          this.db.transaction(() => {
            this.db
              .query(
                "INSERT INTO profile_cache(profile_key,result_json,fetched_at,last_attempt) VALUES (?,?,?,?) ON CONFLICT(profile_key) DO UPDATE SET result_json=excluded.result_json,fetched_at=excluded.fetched_at,last_error=NULL,last_attempt=excluded.last_attempt",
              )
              .run(key, JSON.stringify(result), result.fetchedAt!, Date.now());
            this.history.record(key, result.tableData!, result.fetchedAt!);
          })();
          this.failures.delete(key);
        } else {
          this.failures.set(key, Date.now() + 300000);
          this.db
            .query(
              "UPDATE profile_cache SET last_error=?,last_attempt=? WHERE profile_key=?",
            )
            .run(result.error || "Invalid profile result", Date.now(), key);
          const cached = this.read(name, platform);
          if (cached) return { ...cached, stale: true, error: result.error };
        }
        return result;
      },
      { key: `profile:${key}`, priority },
    );
  }
}
