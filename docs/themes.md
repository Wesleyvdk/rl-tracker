# Card themes

Slate is the default. Dune, Jade, Rose and Neon are public presets; Neon keeps the earlier colors, glow and panel treatment. None draws the history backdrop through MMR text. RSC is a packaged organization concept using its public charcoal/red branding and local logo. No server is assigned to RSC automatically.

`/theme list` shows available styles. `/theme preview style:...` privately renders clearly labelled fictional data without changing preferences. `/theme set style:...` saves the linked Discord account's preference; `/theme reset` returns to inheritance. Relinking preserves the user's style; unlinking deletes it. Two Discord users linking the same Rocket League profile keep separate styles.

`/theme server style:...` sets the current server's default and leaderboard style. Omitting `style` resets it. The server command requires Manage Server, checked against the interaction's actual server and permissions. Individual rank/history cards resolve personal preference, then server default, then Slate. The leaderboard uses only the server's shared theme. In DMs, server and organization themes are unavailable. Organization preferences saved in one server do not apply outside its configured organization servers.

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

Server admins may select themes only from the public catalog or their configured organization. They cannot claim another organization by supplying an ID. Invalid configuration fails startup; unknown/deleted stored IDs fall back to inheritance. No remote URLs, CSS, scripts or user-supplied colors are accepted by the commands.

Every render captures its own immutable theme context. Paginated views keep the same already-rendered theme across pages. `account_themes` and `guild_themes` are additive SQLite tables; existing links, snapshots and history are not migrated or rewritten. The new application enables foreign keys for unlink cleanup. A previous application image ignores these extra tables; its older unlink code may leave unused preference rows because its connection does not enforce the new foreign key. Do not describe older-version cleanup as equivalent.

## Preview and verification

Run `bun run scripts/previewThemes.ts` for a comparison gallery and rank, leaderboard and season cards for every registered theme. All previews use explicitly fictional stats and local assets. Tests cover color contrast, mode order, unavailable Tournament icon, isolated concurrent renders, preference inheritance/cleanup, organization access and mocked Discord command permissions/autocomplete.

Tournament is always fourth, next to Standard 3v3. When its row is absent for the selected season, it shows `Unavailable`, the bundled unranked icon and unknown MMR/matches. An earlier season's rank is never reused as current. When a valid Tournament row is present, the normal parser and model retain its reported rank, MMR, streak and matches.

Palette references supplied by the user: [dark neutrals](https://pin.it/7xqRSg6Zj), [earth/forest/rose palettes](https://pin.it/2xcl8UFOk). The [RSC website](https://rsc-community.com/) supplies the RSC concept's brand reference. Reference artwork is not bundled or rendered in cards.
