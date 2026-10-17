import type { Database } from "bun:sqlite";
import { DEFAULT_THEME, ThemeRegistry } from "./themeRegistry.service";

export class ThemePreferences {
  constructor(
    private db: Database,
    readonly registry: ThemeRegistry,
  ) {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS account_themes (
        discord_id TEXT PRIMARY KEY REFERENCES users(discord_id) ON DELETE CASCADE,
        theme_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS guild_themes (
        guild_id TEXT PRIMARY KEY, theme_id TEXT NOT NULL
      );`);
  }
  private linked(user: string) {
    return !!this.db
      .query("SELECT discord_id FROM users WHERE discord_id=?")
      .get(user);
  }
  userChoice(user: string): string | null {
    if (!this.linked(user)) return null;
    return (
      (
        this.db
          .query("SELECT theme_id FROM account_themes WHERE discord_id=?")
          .get(user) as { theme_id: string } | null
      )?.theme_id ?? null
    );
  }
  guildTheme(guild?: string | null) {
    const id = guild
      ? (
          this.db
            .query("SELECT theme_id FROM guild_themes WHERE guild_id=?")
            .get(guild) as { theme_id: string } | null
        )?.theme_id
      : null;
    return id && this.registry.allowed(id, guild) ? id : DEFAULT_THEME;
  }
  resolve(user: string, guild?: string | null) {
    const id = this.userChoice(user);
    return id && this.registry.allowed(id, guild) ? id : this.guildTheme(guild);
  }
  setUser(user: string, id: string, guild?: string | null) {
    if (!this.linked(user)) throw new Error("Link an account first.");
    if (!this.registry.allowed(id, guild))
      throw new Error("That theme isn't available here.");
    this.db
      .query(
        "INSERT INTO account_themes (discord_id,theme_id) VALUES (?,?) ON CONFLICT(discord_id) DO UPDATE SET theme_id=excluded.theme_id",
      )
      .run(user, id);
  }
  resetUser(user: string) {
    this.db.query("DELETE FROM account_themes WHERE discord_id=?").run(user);
  }
  setGuild(guild: string, id?: string) {
    if (id === undefined) {
      this.db.query("DELETE FROM guild_themes WHERE guild_id=?").run(guild);
      return;
    }
    if (!this.registry.allowed(id, guild))
      throw new Error("That theme isn't available here.");
    this.db
      .query(
        "INSERT INTO guild_themes (guild_id,theme_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET theme_id=excluded.theme_id",
      )
      .run(guild, id);
  }
}
