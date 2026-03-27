import { Database } from "bun:sqlite";

// Initialize SQLite database
// Bun automatically creates this file if it doesn't exist
const db = new Database("database.sqlite", { create: true });

// Enable Write-Ahead Logging for better concurrent performance
db.exec("PRAGMA journal_mode = WAL;");

// Create the users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    playername TEXT NOT NULL,
    platform TEXT NOT NULL,
    mmr_2v2 INTEGER,
    mmr_3v3 INTEGER,
    last_updated INTEGER,
    created_at INTEGER
  );
`);

// Add stats_json column without dropping the table to preserve existing data
try {
  db.exec("ALTER TABLE users ADD COLUMN stats_json TEXT;");
} catch (e) {
  // Column already exists
}

export interface UserAccount {
  discord_id: string;
  playername: string;
  platform: string;
  mmr_2v2: number | null;
  mmr_3v3: number | null;
  last_updated: number | null;
  created_at: number;
  stats_json: string | null;
}

/**
 * Link a Discord account to a Rocket League tracker profile
 */
export function linkAccount(discordId: string, playername: string, platform: string): void {
  const stmt = db.prepare(`
    INSERT INTO users (discord_id, playername, platform, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      playername = excluded.playername,
      platform = excluded.platform,
      last_updated = NULL,
      mmr_2v2 = NULL,
      mmr_3v3 = NULL,
      stats_json = NULL
  `);
  stmt.run(discordId, playername, platform, Date.now());
}

/**
 * Get a linked account by Discord ID
 */
export function getAccount(discordId: string): UserAccount | null {
  const stmt = db.prepare("SELECT * FROM users WHERE discord_id = ?");
  return stmt.get(discordId) as UserAccount | null;
}

/**
 * Remove a linked account
 */
export function unlinkAccount(discordId: string): boolean {
  const stmt = db.prepare("DELETE FROM users WHERE discord_id = ?");
  const info = stmt.run(discordId);
  return info.changes > 0;
}

/**
 * Update cached JSON stats for a user (includes all modes)
 */
export function updateStats(discordId: string, statsJson: string): void {
  const stmt = db.prepare(`
    UPDATE users 
    SET stats_json = ?, last_updated = ?
    WHERE discord_id = ?
  `);
  stmt.run(statsJson, Date.now(), discordId);
}

/**
 * Get multiple accounts by their Discord IDs (useful for server leaderboards)
 */
export function getAccountsByDiscordIds(discordIds: string[]): UserAccount[] {
  if (discordIds.length === 0) return [];

  // Create placeholders like ?, ?, ?
  const placeholders = discordIds.map(() => "?").join(",");
  const stmt = db.prepare(`SELECT * FROM users WHERE discord_id IN (${placeholders})`);

  return stmt.all(...discordIds) as UserAccount[];
}

/**
 * Get ALL linked accounts
 */
export function getAllAccounts(): UserAccount[] {
  const stmt = db.prepare("SELECT * FROM users");
  return stmt.all() as UserAccount[];
}
