# Vibes Discord feature plan

Status: control-plane slice implemented in this branch; database, dashboard, and richer music UX are planned product work.

## Product direction

Build Vibes into a feature-rich Discord music and server-operations product:

- Discord-native controls for fast daily use.
- Durable guild settings, favorites, playlists, and aggregate analytics.
- A secure web dashboard for configuration, health, analytics, and audit history.
- Explicit permission checks and remediation instead of opaque provider errors.
- Provider integrations isolated behind health-checked adapters.

The dashboard and database are not forbidden scope. They are separate security and migration boundaries, so they get explicit phases instead of being mixed into the first command patch.

## Research evidence

Popular music bots repeatedly expose search disambiguation, persistent now-playing surfaces, queue navigation, requester-aware controls, permission/vote policy, recent-session history, autoplay, lyrics, saved collections, and statistics. FredBoat, Jockie Music, and Chip document these patterns. Hydra is not a current music comparator because its official notice says it removed music features in 2023.

Popular utility bots repeatedly expose categorized command catalogs, guided setup, per-command permissions, diagnostics, logs, dashboard settings, and server statistics. Dyno, Carl-bot, and MEE6 document these patterns.

Discord supports slash commands, buttons, select menus, modals, autocomplete, ephemeral responses, native application-command permissions, and OAuth2. The product should use Discord-native permissions first, then add dashboard controls that mirror—not bypass—those permissions.

## Current baseline

- `index.js` boots `core/client.js`.
- `core/loader.js` discovers feature manifests and registers slash/prefix commands plus interaction handlers.
- `features/music/` owns DisTube queues, now-playing embeds, and playback buttons.
- `features/general/` owns utility commands and help.
- Music state is currently process-local.
- There is no persistence, migration runner, dashboard, session store, metrics subsystem, or test suite.
- `core/deploy.js` separately registers slash commands globally or to `GUILD_ID`.
- The deployed runtime is Node 26, which provides `node:sqlite` `DatabaseSync`; the database phase should pin the minimum Node version before migration work lands.

## Phased execution plan

| Phase | Scope | Main deliverables | Dependencies |
|---|---|---|---|
| P0 | Control plane | `/stats`, `/diagnose`, guided help, authoritative now-playing updates, queue pagination | Existing Discord client, DisTube, components |
| P1 | Rich music UX | Search-result select menus, requester-aware queue management, favorites, session history, control policy, autoplay/lyrics adapters | P0, provider adapter boundary |
| P2 | Persistence foundation | `node:sqlite` database, migrations, guild settings, aggregate events, favorites/playlists, audit log, backups | Node 26 minimum, storage contract |
| P3 | Dashboard | Discord OAuth2, guild authorization, settings API, health overview, analytics, audit pages, music controls | P2, web server, CSRF/session model |
| P4 | Scale and polish | Background rollups, rate limits, provider health, job cleanup, localization, import/export, dashboard live refresh | P2/P3 operational evidence |

## Feature backlog and task queue

### P0 — Discord control plane

- [x] F-001 Add derived bot operational stats.
- [x] F-002 Add read-only music diagnostics with actionable permission failures.
- [ ] F-003 Replace static help with feature/category navigation, command detail, and autocomplete.
- [ ] F-004 Make the now-playing panel authoritative after pause, resume, loop, shuffle, queue, and volume changes.
- [ ] F-005 Add queue pagination with disabled boundary controls.
- [ ] F-006 Add a clear destructive-control policy using native permissions first.

### P1 — Feature-rich music

- [ ] F-007 Add `/search` select menus while preserving direct URL playback as a fast path.
- [ ] F-008 Add requester-aware remove, move, clear, and queue filtering.
- [ ] F-009 Add favorites and “recently played this session.”
- [ ] F-010 Add autoplay and lyrics as independent, health-checked provider adapters.
- [ ] F-011 Add vote-skip only if the selected guild policy needs it; do not make voting the default without a control decision.
- [ ] F-012 Add queue export/import after persistence and privacy rules exist.

### P2 — Database and persistence

- [ ] F-013 Add `core/storage/database.js` using `DatabaseSync` with foreign keys, defensive mode, busy timeout, and prepared statements.
- [ ] F-014 Add idempotent numbered migrations and a `schema_migrations` table.
- [ ] F-015 Persist `guild_settings`: music channel, control role, default volume, autoplay, locale, and feature flags.
- [ ] F-016 Persist favorites and named playlists with owner/server visibility and delete behavior.
- [ ] F-017 Store aggregate `music_events`/daily rollups without raw search queries by default.
- [ ] F-018 Add `audit_log` for dashboard setting changes and privileged music actions.
- [ ] F-019 Add scheduled SQLite backup, restore check, corruption/lock health status, and retention cleanup.

### P3 — Dashboard

- [ ] F-020 Add a Fastify dashboard server with static assets and a health endpoint.
- [ ] F-021 Add Discord OAuth2 authorization-code flow with state, PKCE, exact redirect URI, and server-side client secret.
- [ ] F-022 Add server-side sessions with HttpOnly, Secure, SameSite cookies and hashed session records.
- [ ] F-023 Add guild authorization: user must manage the guild, the bot must be present, and the dashboard must re-check permissions before writes.
- [ ] F-024 Add dashboard pages: Overview, Music Settings, Controls, Analytics, Audit Log, and Integrations.
- [ ] F-025 Add settings REST endpoints with schema validation, CSRF protection, rate limits, audit events, and optimistic concurrency.
- [ ] F-026 Add dashboard UI empty/loading/error states and deep links back to Discord commands.

### P4 — Operations and quality

- [ ] F-027 Add contract tests for migrations, settings authorization, metrics rollups, and session expiry.
- [ ] F-028 Add dashboard API smoke tests with a fake Discord gateway boundary.
- [ ] F-029 Add structured operational logs without tokens, cookies, raw queries, or OAuth codes.
- [ ] F-030 Add provider health checks, bounded retries, circuit breakers, and user-visible remediation.
- [ ] F-031 Add localization and per-guild timezone/locale support.
- [ ] F-032 Add deployment documentation for bot-only and bot-plus-dashboard modes.

## Current vertical slice in this branch

### Commands

- `/stats` and `!stats`: public derived runtime status.
- `/diagnose` and `!diagnose`: ephemeral slash diagnostics; prefix diagnostics remain visible because Discord prefix commands cannot be ephemeral.

### Data model

This slice intentionally adds no persistent data. `/stats` derives values from `Client`, `process`, and the command registry. `/diagnose` derives values from guild state, bot permissions, and the active DisTube queue.

### Integration map

- `features/general/commands.js`: stats command and embed builder.
- `features/general/index.js`: general command registration.
- `features/music/commands.js`: diagnostics command and checks.
- `features/music/index.js`: music command registration.
- `core/client.js`: existing slash/prefix dispatch remains unchanged.
- `core/deploy.js`: existing command deployment remains unchanged.
- `README.md`: command documentation.

## Target data model

The first database migration set should keep domain boundaries explicit:

- `schema_migrations(version, applied_at)`
- `guild_settings(guild_id, music_channel_id, control_role_id, default_volume, autoplay, locale, feature_flags_json, updated_at)`
- `favorites(id, guild_id, owner_id, provider, provider_id, title, url, created_at)`
- `playlists(id, guild_id, owner_id, name, visibility, created_at, updated_at)`
- `playlist_items(playlist_id, position, provider, provider_id, title, url)`
- `music_events(id, guild_id, actor_id, event_type, provider, provider_id, occurred_at)`
- `daily_metrics(guild_id, day, plays, skips, failures, commands, active_minutes)`
- `audit_log(id, guild_id, actor_id, action, target, metadata_json, created_at)`
- `dashboard_sessions(id, user_id, session_hash, expires_at, created_at, last_seen_at)`

Privacy default: do not store raw search strings, message content, cookies, bot tokens, OAuth codes, or full media URLs when an identifier is sufficient. Add retention and deletion behavior before exposing historical analytics.

## Dashboard architecture

Recommended initial shape:

- `dashboard/server.js`: Fastify server and lifecycle.
- `dashboard/auth/discord-oauth.js`: authorization code, state, PKCE, token exchange, identity.
- `dashboard/auth/authorization.js`: guild-management checks and bot-presence checks.
- `dashboard/api/`: typed route handlers for settings, stats, controls, audit, and health.
- `dashboard/public/`: static UI assets; start without a second SPA build system unless the surface outgrows the static approach.
- `core/storage/`: SQLite connection, migrations, repositories, and transaction helpers.
- `core/metrics/`: event contracts and rollup jobs shared by bot and dashboard.

Dashboard write invariant: every setting write must pass authenticated user, guild-management authorization, bot presence, schema validation, current-version check, audit insertion, and a transaction. The dashboard must never grant a Discord permission the bot does not already have.

## Acceptance criteria for future phases

### P1 music

1. Ambiguous text search produces a select menu rather than silently playing an arbitrary result.
2. Selecting a result queues exactly that track.
3. Queue pages work at 1, page boundary, and 12+ tracks.
4. Unauthorized destructive actions return an ephemeral remediation message.
5. Existing direct URLs and proxy/ffmpeg playback remain functional.

### P2 persistence

1. A fresh database migrates from zero to current schema idempotently.
2. A second startup performs no duplicate migration or duplicate seed.
3. Settings writes are transactional and survive restart.
4. Foreign-key and uniqueness violations fail without partial writes.
5. Backup restore passes a read-only integrity check.

### P3 dashboard

1. OAuth state/PKCE rejects replay, missing state, wrong redirect, and expired sessions.
2. A user sees only guilds they can manage and where the bot is present.
3. Every settings mutation creates an audit row and cannot bypass Discord-native permissions.
4. API errors return stable JSON codes; the UI shows loading, empty, unauthorized, conflict, and retry states.
5. Session cookies never expose access tokens to browser JavaScript.

## Risks and decisions

- **Node version:** use built-in `node:sqlite` on Node 26 and declare the minimum engine before persistence lands. Do not add a native SQLite package without evidence that built-in SQLite is insufficient.
- **Concurrency:** `DatabaseSync` is synchronous; keep transactions short and move rollups/backup work off command handlers.
- **OAuth security:** use server-side code exchange, state, PKCE, exact redirect URIs, secure cookies, CSRF protection, and short-lived sessions.
- **Authorization drift:** re-check guild permissions at API write time; cached dashboard guild lists are not authority.
- **Analytics privacy:** aggregate by default; document retention and provide deletion before adding rankings/history.
- **Provider reliability:** isolate YouTube, lyrics, and autoplay behind adapters with bounded retries and health state.
- **Deployment:** support bot-only mode and dashboard mode separately so a dashboard outage does not stop music playback.
- **Scope:** “feature-rich” means a coherent product surface with explicit data/security contracts, not an unbounded pile of commands.

## Research sources

- FredBoat command and permissions docs: <https://docs.fredboat.com/markdown/index.md>, <https://docs.fredboat.com/permissions>
- Jockie Music command catalog: <https://www.jockiemusic.com/api/commands>
- Chip command catalog: <https://chipbot.gg/commands>
- Hydra music removal notice: <https://hydra.bot/articles/why-is-hydra-dropping-music-features>
- Dyno commands, stats, logs, and settings: <https://docs.dyno.gg/en/commands>, <https://docs.dyno.gg/en/dashboard/stats>, <https://docs.dyno.gg/en/dashboard/logs>, <https://docs.dyno.gg/en/dashboard/settings>
- Carl-bot configuration and utilities: <https://docs.carl.gg/config.md>, <https://docs.carl.gg/utilities.md>
- MEE6 settings and command permissions: <https://wiki.mee6.xyz/features/settings>, <https://help.mee6.xyz/en/articles/611778-how-to-set-role-permissions-for-mee6-commands>
- Discord interactions, components, permissions, and OAuth2: <https://docs.discord.com/developers/interactions/overview.md>, <https://docs.discord.com/developers/components/reference.md>, <https://docs.discord.com/developers/topics/permissions.md>, <https://docs.discord.com/developers/topics/oauth2>
- Node 26 `node:sqlite` API: <https://nodejs.org/api/sqlite.html>
