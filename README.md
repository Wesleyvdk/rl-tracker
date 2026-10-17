# rl-tracker

A standalone Rocket League Discord bot running entirely on your VPS. It uses local retrieval, parsing, SQLite caching, and image rendering. No hosted crawler, paid proxy, or AI extraction service is required. AP-Gaming has its own repository, bot application, configuration, container, and database; these projects are never combined.

## Crawler decision

The initial local comparison is recorded in [benchmark/README.md](benchmark/README.md). Scrapling and Crawl4AI's tested configurations returned profile shells or error pages without stats. The existing Puppeteer-extra path retrieved data, so it remains the retrieval engine until another local candidate passes the same correctness check. This is a limited probe, not a claim that those libraries can never work.

Retrieval is separate from the validated HTML parser, persistent profile cache, and request queue. The parser reads all named ranked playlists, retains zero versus missing values, and uses the page's own division-up/down values instead of old hardcoded thresholds.

## Setup

Use Bun 1.3.8 (the Docker runtime). Run `bun install --frozen-lockfile`. Copy `.env.example` to `.env` and set this application's `BOT_TOKEN` and `CLIENTID`. The bot needs the Guilds intent and channel permissions to send messages, embed links, and attach files. No privileged member intent is required for the per-user leaderboard membership checks.

`bun run deploy` registers commands explicitly. Set `TEST_GUILD_ID` to target a test server; otherwise registration is global. Startup never registers commands. Use a separate Discord application for test-server command/message checks; automated tests do not send Discord messages.

```sh
bun test
bun run typecheck
bun run deploy
bun start
```

For direct host execution, install Chromium and set `PUPPETEER_EXECUTABLE_PATH` to its path. Docker includes it.

## Commands and caching

- `/link` and `/unlink` manage the user's linked platform/profile with compact private status embeds. Errors use the same styling.
- `/rank` returns a cached snapshot immediately when present, with retrieval time. Stale snapshots trigger background refreshes. A new profile waits for one bounded retrieval.
- `/leaderboard` uses cached snapshots of linked users in the current server and starts missing/stale refreshes in the background. It ranks by the highest MMR among the selected modes, includes real zero MMR, and shows the top 25 players across pages of ten. Each row retains its own snapshot time and cached badge.
- `/avgmatches` uses cached season history. Four modes and fourteen seasons fit per image; additional pages retain the remaining modes and seasons. Requests exceeding Discord's ten-image limit ask for fewer seasons or competitive-only. Missing match counts remain unavailable; they are excluded from averages instead of treated as zero. Zero matches remains a valid observation. Partial totals have a `+` marker; the per-season total average includes only complete totals. On pages showing a subset of modes, `ALL MODES` labels the total across the full requested mode set.

Season history preserves every distinct Tracker season ID, including original seasons: modern `Season 14 (28)` is different from original `Season 14`. Cards label them `S14` and `Legacy S14`. Parenthesized IDs are never match counts. Each season waits for the browser's own matching GET to finish, an observed table reload, and the selected season's settled DOM. Rankless historical match tables remain usable. Failed/timed-out documents are closed before another season starts; late responses cannot populate the next season. Initial and final document URLs must match the requested profile.

The season extractor uses a versioned cache key. Previous cache rows remain available as explicitly partial, stale fallback while the new version retrieves verified data. Coverage records requested/completed/missing IDs and separately identifies checked seasons without available records. Incomplete retrieval displays `N / M SEASONS · PARTIAL`; checked empty tables display `NO DATA` and unknown counts, never invented zeroes. Verified historical rows resume for up to an hour, unavailable rows for up to five minutes, while the newest season is refreshed. Failed or unavailable refreshes preserve previous populated rows. Incomplete retrievals retry after a one-minute cooldown; unavailable data and failures use five minutes when requested again. A merged complete history can remain marked cached if the latest refresh failed or returned unavailable records. Original cache rows are retained separately.

Leaderboard and season cards share the rank card's local fonts, rank icons, colors and panels. `bun run scripts/previewCommands.ts` produces clearly marked synthetic previews under `benchmark/results/command-card-style/` without database writes or Discord messages.

### Rank card appearance and history

`/rank` renders all seven standard modes on one image, with extra named modes retained when reported. Rank-colored panels, bundled rank icons and Inter typography, large MMR figures, streak badges and source-provided division distances keep the main information readable. An amber cached badge and an observation timestamp travel with the image. Rendering uses local assets and makes no network requests.

Each panel includes a subtle background curve and a readable graph of **locally observed MMR snapshots**. The change refers to the displayed observations; it is not a last-match change. Graphs use independent scales with visible observed ranges. Points use real observation timestamps; missing MMR/modes and breaks longer than six hours interrupt the line. A single point is shown as a dot, and no history shows a waiting state.

`BEST SEEN` is the largest positive **source-reported current win streak** stored for that mode in retained observations at or before the displayed snapshot. It is not a verified lifetime record: snapshots can miss streaks between refreshes, and retention is limited to 90 days and 1,024 snapshots per profile. Repeated reports are not added together, and MMR increases are never counted as wins. No valid streak report shows `—`; valid reports containing only losses/zero show `0W`. Existing cached rows have unknown historical streaks until new successful fetches record them. Old source values are not backfilled. The current-streak badge remains separate.

History starts with new successful fetches after this update. Existing latest snapshots are not turned into invented past history. Cached reads and failed refreshes add no observations. Cache and history writes are atomic; a missing mode remains a gap. Graphs select at most 256 observations from the preceding 30 days, ending at the displayed snapshot, so a background refresh cannot add later timestamps to an older card. Storage retains at most 1,024 snapshots per profile and removes observations older than 90 days as new snapshots arrive. History follows the platform/profile identity, preserving username case, independently of Discord links.

Preview the design locally with `bun run scripts/previewRankCard.ts`. This writes an image under `benchmark/results/rank-card-style/` with an explicit synthetic-history watermark; demo points are never inserted into the bot's database. To render a real cached snapshot, pass `--input path/to/local-input.json --out path/to/card.png`.

Further styling ideas: selectable dark/light/team-color themes; a compact mobile layout; an opt-in goal marker for each mode; comparison cards for two players; and weekly progress posters built from actual stored observations. Automated Discord posting would be a separate opt-in feature.

All retrieval goes through one priority queue. Concurrent requests for the same profile share one job. Interactive requests take priority over background jobs. Current-profile failures enter a five-minute cooldown and preserve the last good snapshot. Profile/history freshness is one hour. Rank retrieval is bounded to 45 seconds after browser launch; season retrieval has a three-minute browser deadline with fifteen-second season operations. Cached results reflect retrieval time, not a guarantee that Tracker's upstream data is current.

The `users` table and existing links are preserved. Startup adds `profile_cache` and `season_cache`; successful legacy snapshots seed the profile cache. Relinking during a refresh cannot apply the previous account's new snapshot to the changed link.

## Verified browser on this VPS

The rollout uses `RL_TRACKER_BASE_IMAGE=rl-tracker:before-local-restoration-20261015` to preserve the already deployed Chromium 146. Updated bot dependencies retrieved seven playlists with that browser; the newly installed Chromium 155 repeatedly returned upstream error pages. The prior browser image is a local rollback artifact, not a new download. Keep it available (`docker save` can archive it). New installations default to the Bun base image and installed Chromium, which must pass the live retrieval gate before production. Browser upgrades remain a separate verification step; a clean JavaScript dependency audit does not assess browser system packages.

## Docker operation

```sh
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=50 bot
```

The Compose project is explicitly named `rl-tracker` and retains the existing `rl-tracker_sqlite_data` volume. AP-Gaming uses a separate Compose project and volume. No public ports are exposed. Compose applies a 1 GB memory limit, one CPU, log rotation, and a restart policy. Do not run two production instances using the same Discord token.

Health checks verify a recent heartbeat and a connected Discord client. `/tmp/rl-tracker-health.json` also records the last refresh attempt and last successful profile snapshot, so a connected bot can be distinguished from working data retrieval.

## Backup, upgrade, and rollback

```sh
mkdir -p backups
docker compose exec bot bun run scripts/backup.ts
docker cp rl-tracker-bot:/app/backups/. ./backups/
```

Backups use SQLite `VACUUM INTO` and run `PRAGMA integrity_check`. Copy them out of the container promptly, since `/app/backups` is not the database volume. On this VPS, `scripts/backup-vps.sh` performs the backup, copies it to this checkout’s restricted `backups/` directory, and retains daily backups for 14 days. It is scheduled at 03:15 server time in the user crontab, independently of all other projects. The pre-upgrade backup is retained separately and is not removed by that retention rule. Store `.env` separately with restricted permissions.

Before replacing a running container, retain its image tag and create a backup. Stop the bot before restoring into an empty database volume. Restore `database.sqlite` with permissions readable/writable by the container user, run an integrity check, and start exactly one instance. Existing cache tables are additive; no user data is dropped by migration.

The command-card update adds nullable `source_streak` to `mmr_history` under a serialized transaction. Older four-column `INSERT INTO mmr_history VALUES (...)` statements cannot write this upgraded table. On this VPS, `rl-tracker:compatible-before-command-style-20261017` preserves the previous UI with its history insert patched to name the original four columns; this rollback image can use the upgraded database, leaving new streak fields null. Returning to an unpatched older image requires stopping the bot and restoring the pre-upgrade database backup, which discards observations written since that backup. Do not roll back to that original image alone.

## Verification and remaining trial

`bun test` covers the public table fixture, extra playlists, source-provided thresholds, missing/zero values, cache preservation, duplicate requests, queue priority/failure recovery, season averages, profile/season-label normalization, streak migration/retention/as-of isolation, paged image bounds, and isolated mocked execution of every command. `bun run typecheck` checks TypeScript. These tests do not send Discord messages.

`bun test ./tests ./services` scopes test discovery to maintained test roots. The optional `bun run scripts/verifySeasonBrowser.ts` gate uses locally fulfilled browser pages/requests to check delayed DOM commits, identical season tables, CORS preflights and timed-out document closure. Run it in Docker with networking disabled and a writable temporary home; it never starts Discord or opens the application database.

A live retrieval probe verified seven ranked playlists from the VPS after the parser change. Longer-term availability, platform coverage, full season-history switching, and Discord command rendering still need observation during the rollout. The benchmark's raw HTML and local databases are ignored by Git.
