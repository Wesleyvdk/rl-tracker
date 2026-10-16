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

- `/link` and `/unlink` manage the user's linked platform/profile.
- `/rank` returns a cached snapshot immediately when present, with retrieval time. Stale snapshots trigger background refreshes. A new profile waits for one bounded retrieval.
- `/leaderboard` uses cached snapshots of linked users in the current server and starts missing/stale refreshes in the background. It does not wait for every profile to scrape.
- `/avgmatches` uses cached season history. Missing match counts remain unavailable; they are excluded from averages instead of treated as zero. Zero matches remains a valid observation.

### Rank card appearance and history

`/rank` renders all seven standard modes on one image, with extra named modes retained when reported. Rank-colored panels, bundled rank icons and Inter typography, large MMR figures, streak badges and source-provided division distances keep the main information readable. An amber cached badge and an observation timestamp travel with the image. Rendering uses local assets and makes no network requests.

Each panel includes a subtle background curve and a readable graph of **locally observed MMR snapshots**. The change and peak refer to the displayed observations; they are not last-match changes or lifetime/season records. Graphs use independent scales with visible observed ranges. Points use real observation timestamps; missing MMR/modes and breaks longer than six hours interrupt the line. A single point is shown as a dot, and no history shows a waiting state.

History starts with new successful fetches after this update. Existing latest snapshots are not turned into invented past history. Cached reads and failed refreshes add no observations. Cache and history writes are atomic; a missing mode remains a gap. Graphs select at most 256 observations from the preceding 30 days, ending at the displayed snapshot, so a background refresh cannot add later timestamps to an older card. Storage retains at most 1,024 snapshots per profile and removes observations older than 90 days as new snapshots arrive. History follows the platform/profile identity, preserving username case, independently of Discord links.

Preview the design locally with `bun run scripts/previewRankCard.ts`. This writes an image under `benchmark/results/rank-card-style/` with an explicit synthetic-history watermark; demo points are never inserted into the bot's database. To render a real cached snapshot, pass `--input path/to/local-input.json --out path/to/card.png`.

Further styling ideas: selectable dark/light/team-color themes; a compact mobile layout; an opt-in goal marker for each mode; comparison cards for two players; and weekly progress posters built from actual stored observations. Automated Discord posting would be a separate opt-in feature.

All retrieval goes through one priority queue. Concurrent requests for the same profile share one job. Interactive requests take priority over background jobs. Current-profile failures enter a five-minute cooldown and preserve the last good snapshot. Profile/history freshness is one hour. Rank retrieval is bounded to 45 seconds after browser launch; season retrieval is bounded to 120 seconds. Cached results reflect retrieval time, not a guarantee that Tracker's upstream data is current.

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

## Verification and remaining trial

`bun test` covers the public table fixture, extra playlists, source-provided thresholds, missing/zero values, cache preservation, duplicate requests, queue priority/failure recovery, season averages, and profile/season-label normalization. `bun run typecheck` checks TypeScript.

A live retrieval probe verified seven ranked playlists from the VPS after the parser change. Longer-term availability, platform coverage, full season-history switching, and Discord command rendering still need observation during the rollout. The benchmark's raw HTML and local databases are ignored by Git.
