# Card themes

Rose is the default, with a subtle layered gradient background. Slate, Dune, Jade and the original Neon remain public presets. Muted rank-family colors drive rank labels, graphs and progress across every theme, independently of its brand accent. Colors adjust for contrast on light surfaces. Neon retains its optional glow and panel treatment. None draws the history backdrop through MMR text. RSC is a packaged organization concept using its public charcoal/red branding and local logo. No server is assigned to RSC automatically.

`/theme list` shows available styles. `/theme preview style:...` privately renders clearly labelled fictional data without changing preferences. `/theme set style:...` saves the linked Discord account's preference; `/theme reset` returns to inheritance. Relinking preserves the user's style; unlinking deletes it. Two Discord users linking the same Rocket League profile keep separate styles.

`/theme server style:...` sets the current server's default and leaderboard style. Omitting `style` resets it. The server command allows Manage Server or a configured theme-editing role; current membership, roles and ownership are fetched from Discord before changing settings. Individual rank/history cards resolve personal preference, then server default, then Rose. The leaderboard uses only the server's shared theme. In DMs, server and organization themes are unavailable. Organization preferences saved in one server do not apply outside its configured organization servers.

## Add an organization

1. Add a definition to `themes/catalog.json`: unique slug, name, description, `scope: "organization"`, organization slug, ten six-digit color tokens, radius, optional brand text and packaged logo. Use `themes/catalog.json`'s RSC entry as the template. Put an optional PNG/WebP under `assets/themes/<organization>/` and retain its source attribution. The renderer never downloads assets. New themes use existing layout primitives; a new visual primitive belongs in `createCardStyle`, not in organization-specific command branches.
2. Copy `config/organization-themes.example.json` to a deployment-owned file. Set the actual Discord server IDs for that organization and set `ORGANIZATION_THEMES_PATH` to its container path. A server can belong to only one organization. Rebuild/restart the bot with that local config mounted read-only. Autocomplete discovers available theme IDs at runtime; adding a preset needs no command-schema update.

For Docker, a local override can mount the deployment config:

```yaml
services:
  bot:
    environment:
      ORGANIZATION_THEMES_PATH: /run/rl-themes/organizations.json
    volumes:
      - ./organization-themes.json:/run/rl-themes/organizations.json:ro
```

Server admins may select themes only from the public catalog or their configured organization. They cannot claim another organization by supplying an ID. Invalid configuration fails startup; unknown/deleted stored IDs fall back to inheritance. Preset commands accept only registered IDs. The approved organization editor accepts validated design tokens, never remote assets, CSS or scripts.

Every render captures its own immutable theme context. Paginated views keep the same already-rendered theme across pages. `account_themes` and `guild_themes` are additive SQLite tables; existing links, snapshots and history are not migrated or rewritten. The new application enables foreign keys for unlink cleanup. A previous application image ignores these extra tables; its older unlink code may leave unused preference rows because its connection does not enforce the new foreign key. Do not describe older-version cleanup as equivalent.

## Preview and verification

Run `bun run scripts/previewThemes.ts` for a comparison gallery and rank, leaderboard and season cards for every registered theme. All previews use explicitly fictional stats and local assets. Tests cover color contrast, mode order, unavailable Tournament icon, isolated concurrent renders, preference inheritance/cleanup, organization access and mocked Discord command permissions/autocomplete.

Tournament is always fourth, next to Standard 3v3. When its row is absent for the selected season, it shows `Unavailable`, the bundled unranked icon and unknown MMR/matches. An earlier season's rank is never reused as current. When a valid Tournament row is present, the normal parser and model retain its reported rank, MMR, streak and matches.

Palette references supplied by the user: [dark neutrals](https://pin.it/7xqRSg6Zj), [earth/forest/rose palettes](https://pin.it/2xcl8UFOk). The [RSC website](https://rsc-community.com/) supplies the RSC concept's brand reference. Reference artwork is not bundled or rendered in cards.

## Organization editor

Organization admission and theme publication are separate. `/organization apply name:... website:https://...` requests organization features for the current Discord server and requires current Manage Server. The verified Discord application owner reviews admission with `/organization pending` and `/organization review server:... decision:approved|denied|revoked`. Server admins and delegates cannot approve themselves. Admission grants custom theme capability now; there is no billing integration or claim of an active subscription. A future paid entitlement provider can replace the approval check without adding payment logic to the renderer. Each server is its own tenant; approval does not automatically extend to another server owned by the same people.

After approval, `/theme editor` gives an authorized user a private, random URL valid for 24 hours. No individual design needs operator approval. The page edits name, brand signature, colors, corner radius and solid/gradient/soft-light/contour backgrounds. Rank-family colors are semantic and cannot be replaced by an organization's accent. Rank, leaderboard and history previews use the same local production renderers with explicitly fictional data. There are no remote assets, hosted image processors or paid APIs. PNGs, fonts, presets, drafts and published themes remain on this VPS. Discord supplies browser identity and fresh server permissions; Cloudflare supplies DNS/proxying when enabled.

`Save draft` stores a private server draft with an expected revision. Concurrent changes produce a conflict and require a reload; they never silently overwrite another editor. `Apply to server` atomically publishes an immutable revision and changes that server's default immediately. Personal `/theme set` overrides continue to win, including an explicitly chosen older organization revision. The shared leaderboard always uses the server default. `/theme reset` opts back into that default. Already-rendered paginated cards retain their revision and embed colors. The published theme stays active after its editor link expires. `/theme server` can switch back to Rose or another available preset. Published revisions and active pointers survive a restart.

### Delegation and revocation

- `/config show` displays the editor toggle, admission and delegated roles to server managers/settings delegates.
- `/config role scope:themes|settings role:... allowed:true|false` requires Manage Server. Themes grants editor links and changing the shared theme. Settings grants viewing settings, enabling/disabling the editor and revoking editor sessions. Settings delegates cannot grant either kind of role or approve admission. Managed roles and @everyone cannot be delegated.
- `/config editor enabled:false` disables editing and revokes existing links/sessions. It does not remove the published theme. Re-enabling never revives old links.
- `/config revoke-links` closes every editor link/session in that server. Removing a user's delegated role or Manage Server also blocks their next authorized request. Revoking organization admission blocks custom selection and falls back to personal public/server/default inheritance; old revisions remain readable internally for in-flight cards.

### Public URL and deployment

Use one hostname: `https://trackerbot.aylian-studios.com/editor/<256-bit-random-token>`. A SQLite primary key reserves each invitation digest; generation retries a digest collision. A friendly organization name is never used as an authorization credential or claimed as a global subdomain. There is no wildcard DNS provisioning or per-link DNS record.

Configure an A record for `trackerbot` to this VPS and an HTTPS proxy to `rl-tracker-editor:8790`. The optional `docker-compose.editor.yml` joins only this bot to `nginxproxymanager_default`; it exposes no host port and preserves its own data volume and default network. Set `CLIENTSECRET` for this Discord application and register the exact `https://trackerbot.aylian-studios.com/oauth/callback` redirect in the Discord Developer Portal. The override sets `THEME_EDITOR_BASE_URL` to this canonical origin. For direct deployments, use the corresponding `.env.example` settings. Public links require HTTPS; Host/X-Forwarded headers never choose redirects. Avoid access/error logging of editor invitation paths or OAuth query strings in the proxy. Use no caching on editor/auth/API responses. The app sends no-store, no-referrer, CSP, no-index and frame protections. If Cloudflare proxying is enabled, retain validated HTTPS at the origin.

```sh
docker compose -f docker-compose.yml -f docker-compose.editor.yml build bot
docker compose -f docker-compose.yml -f docker-compose.editor.yml up -d --no-deps bot
docker compose -f docker-compose.yml -f docker-compose.editor.yml exec bot bun run deploy.ts
```

OAuth requests only `identify`. An invitation is bound to the requesting Discord account and server; possession of the URL alone grants no edit access. Login state is browser-bound, single-use and valid for at most ten minutes. Secure HttpOnly host cookies hold opaque session handles. The database stores invitation/state/session digests, never raw URL tokens, browser cookies or Discord access/refresh tokens. Sessions cannot outlive the original 24-hour invitation. Every preview/read/save/apply rechecks membership, owner/administrator/Manage Server/delegated roles, editor enablement and approved admission. Permission lookups fail closed. Writes require an exact Origin and session CSRF token. Unauthenticated pages contain no saved theme data.

Requests are capped at 16 KiB and ten seconds for reading a body or a permission/OAuth operation. There are eight active API requests, four callbacks and two renders at a time, with no unbounded rendering queue. A session is limited to 60 API requests/minute; a server can issue 20 invitations/hour; one invitation can start ten sign-ins/minute and retain at most 20 pending/active auth records. Auth records expire and are cleaned on issue/sign-in; invitation digests expire after a week of retention, with cleanup on issue. Each server retains one draft, at most 500 audit entries and immutable published revisions; publication is capped at ten/hour and 1,000 revisions/server. Old published revisions remain because users and existing cards can reference them. At that cap, further publication needs an explicit retention upgrade; current cards remain usable. New data tables are additive and existing account/cache/history rows are not rewritten.

Before upgrades, keep a SQLite backup and the reviewed old image. Rolling back the app can ignore new organization tables, but custom theme IDs become unknown and resolve to the old default; old commands cannot edit them. Disable/remove the new proxy host on rollback and restore the prior command payload if removing `/config` and `/organization`. Never restore a database backup merely to roll back the image: that would discard newly collected player observations.
