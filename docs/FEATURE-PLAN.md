# Vibes Discord feature plan

Status: control-plane, persistence, profile cards, and the initial dashboard slice are implemented; richer music UX remains planned.

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
- The repository has file-backed persistence, aggregate metrics, an opt-in dashboard, OAuth session storage, and a dependency-free dashboard UI.
- `test/contract.test.js` covers storage migrations, profile aggregation, PNG rendering, and OAuth browser binding.
- `core/deploy.js` separately registers slash commands globally or to `GUILD_ID`.
- The deployed runtime is Node 26, which provides the release-candidate `node:sqlite` `Database` API; this minimum is a persistence contract.

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
- [x] F-033 Add a Discord-native `/profile` card with aggregate top servers, listeners, and tracks.

### P2 — Database and persistence

- [x] F-013 Add `core/storage/database.js` using Node 26 `Database` with foreign keys, defensive mode, busy timeout, and prepared statements.
- [x] F-014 Add idempotent numbered migrations and a `schema_migrations` table.
- [x] F-015 Persist `guild_settings` and apply default volume/music-channel settings.
- [ ] F-016 Persist favorites and named playlists with owner/server visibility and delete behavior.
- [x] F-017 Store aggregate daily metrics without raw search queries by default.
- [x] F-018 Add `audit_log` for dashboard setting changes.
- [ ] F-019 Add scheduled SQLite backup, restore check, and corruption/lock health status.

### P3 — Dashboard

- [x] F-020 Add a dependency-free Node HTTP dashboard server with an embedded UI and a health endpoint.
- [x] F-021 Add Discord OAuth2 authorization-code flow with state, PKCE, exact redirect URI, and server-side client secret.
- [x] F-022 Add server-side sessions with HttpOnly/Secure/SameSite cookies, HMAC-hashed session records, and encrypted OAuth access tokens for permission revalidation.
- [x] F-023 Add guild authorization: user must manage the guild and the bot must be present before reads/writes.
- [ ] F-024 Add dashboard pages for Overview, Music Settings, Controls, Analytics, Audit Log, and Integrations.
- [x] F-025 Add settings REST endpoints with schema validation, CSRF protection, audit events, and transactional writes.
- [x] F-026 Add dashboard loading, empty, error, unauthorized, and conflict states.

### P4 — Operations and quality

- [x] F-027 Add contract tests for migrations, settings authorization, metrics rollups, and session expiry.
- [x] F-028 Add dashboard API smoke tests with a fake Discord gateway boundary.
- [ ] F-029 Add structured operational logs without tokens, cookies, raw queries, or OAuth codes.
- [ ] F-030 Add provider health checks, bounded retries, circuit breakers, and user-visible remediation.
- [ ] F-031 Add localization and per-guild timezone/locale support.
- [ ] F-032 Add deployment documentation for bot-only and bot-plus-dashboard modes.

## Current vertical slice in this branch

### Commands and runtime

- `/stats` and `!stats`: runtime status plus aggregate plays/failures/command metrics.
- `/diagnose` and `!diagnose`: ephemeral slash diagnostics; prefix diagnostics remain visible because Discord prefix commands cannot be ephemeral.
- `play` reads persisted guild settings for the configured music channel and default volume.
- Music playback events and dispatched commands update daily aggregate metrics.
- `/profile` and `!profile`: PNG profile card with aggregate plays, servers, listeners, and top tracks.

### Persistence

- `core/storage/migrations.js`: numbered schema migrations.
- `core/storage/database.js`: file-backed SQLite store, guild settings, metrics, audit rows, OAuth states, and dashboard sessions.
- `user_activity_daily` and `user_track_stats` store aggregate profile activity; media URLs are hashed.
- `DATABASE_PATH` defaults to `data/vibes.sqlite`, which is ignored by Git.

### Dashboard

- `dashboard/server.js`: dependency-free Node HTTP server, health endpoint, embedded control center, OAuth2 login, PKCE, HMAC-hashed sessions, guild authorization, settings/metrics/audit APIs, CSRF checks, and transactional writes.
- Dashboard is opt-in through `DASHBOARD_ENABLED`; bot-only mode remains the default.

### Integration map

- `core/client.js`: initializes storage, starts the optional dashboard, records command metrics, and closes resources on shutdown.
- `core/config.js`: database and dashboard configuration.
- `core/storage/`: migrations and repositories.
- `dashboard/server.js`: dashboard routes, auth, API, and UI.
- `features/general/commands.js`: stats command and aggregate metrics display.
- `features/music/commands.js`: diagnostics, music-channel guard, and default-volume application.
- `features/music/player.js`: playback/failure metric events.
- `README.md` and `.env.example`: setup and dashboard configuration.

## Target data model

The first database migration set should keep domain boundaries explicit:

- `schema_migrations(version, applied_at)`
- `guild_settings(guild_id, music_channel_id, control_role_id, default_volume, autoplay, locale, feature_flags_json, updated_at)`
- `favorites(id, guild_id, owner_id, provider, provider_id, title, url, created_at)`
- `playlists(id, guild_id, owner_id, name, visibility, created_at, updated_at)`
- `playlist_items(playlist_id, position, provider, provider_id, title, url)`
- `music_events(id, guild_id, actor_id, event_type, provider, provider_id, occurred_at)`
- `daily_metrics(guild_id, day, plays, skips, failures, commands, active_minutes)`
- `user_activity_daily(user_id, guild_id, day, commands, plays, active_minutes, last_seen_at)`
- `user_track_stats(user_id, guild_id, track_key, title, plays, duration_seconds, last_played_at)`
- `audit_log(id, guild_id, actor_id, action, target, metadata_json, created_at)`
- `dashboard_sessions(user_id, session_hash, access_token_encrypted, expires_at, created_at, last_seen_at)`
- `oauth_states(state_hash, code_verifier, expires_at, created_at)`

Privacy default: do not store raw search strings, message content, cookies, bot tokens, OAuth codes, or full media URLs when an identifier is sufficient. Add retention and deletion behavior before exposing historical analytics.

## Dashboard architecture

Implemented initial shape:

- `dashboard/server.js`: dependency-free Node HTTP server and lifecycle.
- OAuth2 authorization-code flow with state, PKCE, issuer validation, token exchange, and identity/guild discovery.
- HMAC-hashed sessions with HttpOnly/Secure/SameSite cookies and encrypted server-side Discord access tokens for permission revalidation.
- Guild authorization based on Discord `Manage Guild`/`Administrator` claims plus bot presence.
- Settings, metrics, audit, and health API routes.
- `dashboard/public` is reserved for future split assets; the current UI is embedded and dependency-free.
- `core/storage/`: SQLite connection, migrations, repositories, and transaction helpers.

Dashboard write invariant: every setting write passes authenticated user, guild-management authorization, bot presence, schema validation, CSRF validation, audit insertion, and a transaction. The dashboard never grants a Discord permission the bot does not already have.

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

- **Node version:** use built-in `node:sqlite` on Node 26. Do not add a native SQLite package without evidence that built-in SQLite is insufficient.
- **Concurrency:** Node's synchronous `Database` API is synchronous; keep transactions short and move rollups/backup work off command handlers.
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
