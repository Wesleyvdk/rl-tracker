import type { Database } from "bun:sqlite";
import type { PlaylistStats } from "./profileParser.service";

export interface MmrPoint {
  at: number;
  mmr: number | null;
}
export type MmrHistory = Record<string, MmrPoint[]>;
const DAY = 86400000;
export const HISTORY_DAYS = 30;
export const HISTORY_POINTS = 256;

/** Successful local observations, never inferred match results or season peaks. */
export class MmrHistoryStore {
  constructor(private db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mmr_observations (
        profile_key TEXT NOT NULL, observed_at INTEGER NOT NULL,
        PRIMARY KEY(profile_key, observed_at)
      );
      CREATE INDEX IF NOT EXISTS mmr_observation_age ON mmr_observations(observed_at);
      CREATE TABLE IF NOT EXISTS mmr_history (
        profile_key TEXT NOT NULL, playlist TEXT NOT NULL,
        observed_at INTEGER NOT NULL, mmr INTEGER,
        PRIMARY KEY(profile_key, observed_at, playlist)
      );
      CREATE INDEX IF NOT EXISTS mmr_history_age ON mmr_history(observed_at);
    `);
  }

  record(key: string, rows: PlaylistStats[], at: number) {
    if (!key || !Number.isSafeInteger(at) || at <= 0)
      throw new Error("Invalid history observation identity or time");
    this.db.transaction(() => {
      this.db
        .query("INSERT OR IGNORE INTO mmr_observations VALUES (?, ?)")
        .run(key, at);
      // A same-millisecond successful fetch replaces the entire observation,
      // keeping it coherent with the latest cache, including removed playlists.
      this.db
        .query("DELETE FROM mmr_history WHERE profile_key=? AND observed_at=?")
        .run(key, at);
      const insert = this.db.query(
        "INSERT INTO mmr_history VALUES (?, ?, ?, ?)",
      );
      for (const row of rows) {
        const mmr =
          Number.isSafeInteger(row.mmr) && row.mmr! >= 0 ? row.mmr : null;
        insert.run(key, row.playlist, at, mmr);
      }
      // Per-profile bound plus a global age limit. Retained rows stay paired with
      // their observation; missing playlists become explicit gaps when read.
      this.db
        .query(
          `DELETE FROM mmr_observations WHERE profile_key=? AND observed_at NOT IN
      (SELECT observed_at FROM mmr_observations WHERE profile_key=? ORDER BY observed_at DESC LIMIT 1024)`,
        )
        .run(key, key);
      this.db
        .query("DELETE FROM mmr_observations WHERE observed_at < ?")
        .run(Date.now() - 90 * DAY);
      this.db
        .query("DELETE FROM mmr_history WHERE observed_at < ?")
        .run(Date.now() - 90 * DAY);
      this.db
        .query(
          `DELETE FROM mmr_history WHERE profile_key=? AND observed_at NOT IN (
        SELECT observed_at FROM mmr_observations WHERE profile_key=?)`,
        )
        .run(key, key);
    })();
  }

  read(key: string, playlists: string[], asOf: number): MmrHistory {
    if (!Number.isSafeInteger(asOf) || asOf <= 0) return {};
    const times = this.db
      .query(
        `SELECT observed_at AS at FROM mmr_observations
      WHERE profile_key=? AND observed_at BETWEEN ? AND ?
      ORDER BY observed_at DESC LIMIT ?`,
      )
      .all(key, asOf - HISTORY_DAYS * DAY, asOf, HISTORY_POINTS) as {
      at: number;
    }[];
    times.reverse();
    if (!times.length) return {};
    const rows = this.db
      .query(
        `SELECT playlist,observed_at AS at,mmr FROM mmr_history
      WHERE profile_key=? AND observed_at BETWEEN ? AND ? ORDER BY observed_at`,
      )
      .all(key, times[0].at, asOf) as {
      playlist: string;
      at: number;
      mmr: number | null;
    }[];
    const indexed = new Map(rows.map((r) => [`${r.at}\0${r.playlist}`, r.mmr]));
    return Object.fromEntries(
      [...new Set(playlists)].map((playlist) => [
        playlist,
        times.map(({ at }) => ({
          at,
          mmr: indexed.get(`${at}\0${playlist}`) ?? null,
        })),
      ]),
    );
  }
}

export function summarizeHistory(points: MmrPoint[], asOf: number) {
  const clean = points
    .filter(
      (p) =>
        Number.isSafeInteger(p.at) &&
        p.at > 0 &&
        p.at <= asOf &&
        p.at >= asOf - HISTORY_DAYS * DAY,
    )
    .map((p) => ({
      at: p.at,
      mmr: Number.isSafeInteger(p.mmr) && p.mmr! >= 0 ? p.mmr : null,
    }))
    .sort((a, b) => a.at - b.at)
    .filter((p, i, a) => i === a.length - 1 || p.at !== a[i + 1].at)
    .slice(-HISTORY_POINTS);
  const values = clean.filter(
    (p): p is { at: number; mmr: number } => p.mmr !== null,
  );
  return {
    points: clean,
    values,
    delta: values.length >= 2 ? values.at(-1)!.mmr - values[0].mmr : null,
    peak: values.length >= 2 ? Math.max(...values.map((p) => p.mmr)) : null,
    min: values.length ? Math.min(...values.map((p) => p.mmr)) : null,
    max: values.length ? Math.max(...values.map((p) => p.mmr)) : null,
  };
}
