# Vibes Discord feature plan

Status: first control-plane slice implemented in this branch.

## Purpose

Make the bot easier to discover and operate inside Discord before adding a web dashboard, database, or additional media providers.

## Baseline

- `index.js` boots `core/client.js`.
- `core/loader.js` discovers feature manifests and registers slash/prefix commands plus interaction handlers.
- `features/music/` owns DisTube queues, the now-playing embed, and playback buttons.
- `features/general/` owns `ping` and the static `help` embed.
- Music state is process-local. There is no application persistence, metrics store, dashboard, or test suite.
- `core/deploy.js` separately registers slash commands globally or to `GUILD_ID`.

## Research conclusions

Popular music bots repeatedly expose search disambiguation, a persistent now-playing surface, queue navigation, requester-aware controls, vote/permission policy, recent-session history, autoplay, lyrics, saved collections, and statistics. FredBoat, Jockie Music, and Chip document these patterns; Hydra is not a current music comparator because it removed music features in 2023.

Popular utility bots repeatedly expose categorized command catalogs, guided setup, per-command permissions, diagnostics, logs, and dashboard settings. Dyno, Carl-bot, and MEE6 document these patterns.

Discord's native interaction model supports slash commands, buttons, select menus, modals, autocomplete, and ephemeral responses. Vibes already uses slash commands, buttons, embeds, and ephemeral error replies, so the first work should extend those primitives instead of adding a web UI.

## Execution order

| Phase | Feature | Effort | Dependencies | Acceptance |
|---|---|---:|---|---|
| P0 | Operational `/stats` | S | Existing client state | Shows uptime, guild count, cached member count, WS ping, memory, Node version, and loaded command count without persistence. |
| P0 | Ephemeral `/diagnose` | S | Existing Discord client and DisTube queue | Reports voice-channel alignment, required text/voice permissions, queue state, and WS ping with actionable remediation. |
| P0 | Guided `/help` | M | Current command registry | Categories and command-specific help are selectable from Discord; aliases remain documented. |
| P0 | Queue pagination | M | DisTube queue state, message buttons | Queues larger than one page have previous/next controls with correct disabled states. |
| P1 | Search disambiguation | L | YouTube plugin search API, select menus | Ambiguous text search presents candidates; selecting one queues exactly that track. Direct URLs remain fast-path. |
| P1 | Control policy | M | Discord native permissions | Destructive controls have one documented policy: native permissions first, then optional DJ role or vote policy. |
| P1 | Session metrics | M | Event instrumentation | Counts plays, skips, failures, and queue depth in memory; no raw queries or user history. |
| P2 | Durable favorites/playlists/history | L | Storage choice and retention rules | Cross-restart collections work with explicit owner/server visibility and deletion behavior. |
| P2 | Autoplay/lyrics/providers | L | External APIs and failure budgets | Each integration has rate limits, fallback behavior, and a provider-specific health check. |
| P2 | Web dashboard | XL | OAuth, web app, authorization model | Dashboard settings cannot diverge from Discord permissions or runtime state. |

## Task queue

- [x] F-001 Add derived bot operational stats.
- [x] F-002 Add read-only music diagnostics with actionable permission failures.
- [ ] F-003 Replace static help with feature/category navigation and command detail.
- [ ] F-004 Add queue pagination to slash and button flows.
- [ ] F-005 Add search-result select menus while preserving direct URL playback.
- [ ] F-006 Define and enforce skip/stop/shuffle control policy.
- [ ] F-007 Instrument aggregate session metrics without storing raw queries.
- [ ] F-008 Choose a persistence model for favorites and server defaults.
- [ ] F-009 Add external integrations one at a time with provider health checks.
- [ ] F-010 Revisit a dashboard only after Discord-native settings are stable.

## Current vertical slice

### Commands

- `/stats` and `!stats`: public operational status.
- `/diagnose` and `!diagnose`: ephemeral slash diagnostics; prefix diagnostics remain visible because Discord prefix messages cannot be ephemeral.

### Data model

No new database, files, migrations, or persistent user data. `/stats` derives values from `Client`, `process`, and the command registry. `/diagnose` derives values from the invoking guild member, bot permissions, and the active DisTube queue.

### Integration map

- `features/general/commands.js`: stats command and embed builder.
- `features/general/index.js`: general command registration.
- `features/music/commands.js`: diagnostics command and checks.
- `features/music/index.js`: music command registration.
- `core/client.js`: existing slash/prefix dispatch remains unchanged.
- `core/deploy.js`: existing command deployment remains unchanged.
- `README.md`: command documentation and future roadmap reference.

## Acceptance criteria

1. `/stats` returns an embed with uptime, guild count, cached members, WS ping, RSS memory, Node version, and loaded command count.
2. `/diagnose` is ephemeral and identifies missing voice membership, bot/channel mismatch, missing `ViewChannel`/`SendMessages`/`EmbedLinks`, missing `Connect`/`Speak`, absent queue, and current latency.
3. Both commands are available through the existing loader and deployment path.
4. No new dependency, database, raw message logging, or external API is introduced.
5. Existing music commands and proxy/ffmpeg behavior are unchanged.
6. A no-login smoke script can exercise the builders/checks with a mock Discord client and no network side effects.

## Non-goals

- No web dashboard or OAuth.
- No database or cross-restart history.
- No additional media provider.
- No autoplay, lyrics, DSP effects, 24/7 mode, queue export, or raw analytics.
- No custom permission database before Discord-native permissions are documented and tested.

## Risks and decisions

- **Cached member counts are approximate.** Label them as cached; do not present them as authoritative analytics.
- **Permission checks can be unavailable in partial guild state.** Report unknown state rather than claiming permission is granted.
- **Process uptime resets on restart.** This is intentional until persistence and retention are designed.
- **Prefix diagnostics are public.** Slash diagnostics use ephemeral replies; prefix commands cannot provide the same privacy boundary.
- **A dashboard is deferred.** OAuth and multi-guild authorization are a separate security boundary, not a shortcut for missing Discord UX.

## Research sources

- FredBoat command and permissions docs: <https://docs.fredboat.com/markdown/index.md>, <https://docs.fredboat.com/permissions>
- Jockie Music command catalog: <https://www.jockiemusic.com/api/commands>
- Chip command catalog: <https://chipbot.gg/commands>
- Hydra music removal notice: <https://hydra.bot/articles/why-is-hydra-dropping-music-features>
- Dyno commands, stats, logs, and settings: <https://docs.dyno.gg/en/commands>, <https://docs.dyno.gg/en/dashboard/stats>, <https://docs.dyno.gg/en/dashboard/logs>, <https://docs.dyno.gg/en/dashboard/settings>
- Carl-bot configuration and utilities: <https://docs.carl.gg/config.md>, <https://docs.carl.gg/utilities.md>
- MEE6 settings and command permissions: <https://wiki.mee6.xyz/features/settings>, <https://help.mee6.xyz/en/articles/611778-how-to-set-role-permissions-for-mee6-commands>
- Discord interactions and components: <https://docs.discord.com/developers/interactions/overview.md>, <https://docs.discord.com/developers/components/reference.md>, <https://docs.discord.com/developers/topics/permissions.md>
