# Production Operations

This runbook is for the operator who deploys and maintains Vibes Discord.

## Requirements

- Use Node.js `>=26.0.0`.
- Install `ffmpeg` and make it available on `PATH`.
- Enable the Discord `Message Content Intent`.
- Enable the Discord `Guilds`, `Guild Voice States`, and `Guild Messages` intents.
- Keep `.env`, `cookies.json`, proxy files, the database, and backups outside Git.

## Configure the service

1. Copy `.env.example` to `.env`.
2. Set `DISCORD_TOKEN`.
3. Set `CLIENT_ID`.
4. Set `PREFIX`.
5. Set `DATABASE_PATH`.
6. Set `DATABASE_BACKUP_DIR`.
7. Set `DATABASE_BACKUP_RETENTION`.
8. Set YouTube proxy values when the server must not use direct YouTube egress.
9. Set all dashboard values when `DASHBOARD_ENABLED=true`.
10. Set `DASHBOARD_PUBLIC_URL` to the exact HTTPS URL used by the reverse proxy.
11. Set `DASHBOARD_SESSION_SECRET` to a random value with at least 32 bytes of entropy.

The bot stops at startup when `DISCORD_TOKEN` is missing. The dashboard stops startup when it is enabled but incomplete.

## Install and deploy

Run these commands from the repository directory:

```bash
npm ci
npm test
npm run deploy
npm start
```

Run `npm run deploy` after every slash-command schema change. Use `GUILD_ID` for instant command updates during development. Remove `GUILD_ID` for global registration.

For a service manager, use a dedicated unprivileged user. Set the working directory to the repository. Set `DATABASE_PATH` to a persistent disk. Configure restart-on-failure and a short restart delay.

## Database backup

Run a backup while the bot is online:

```bash
npm run backup
```

The backup uses SQLite's online backup API. It runs an integrity check before it publishes the snapshot. The utility keeps the newest `DATABASE_BACKUP_RETENTION` snapshots.

Run the backup at least once per day with a systemd timer or cron. Copy snapshots to storage that is independent from the VPS. Test one restore after the first deployment and after each migration.

Restore a snapshot only while the bot is stopped:

```bash
cp data/vibes.sqlite data/vibes.sqlite.before-restore
cp backups/vibes-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite data/vibes.sqlite
npm start
```

Keep the pre-restore copy until the bot passes its smoke checks.

## Dashboard exposure

Keep `DASHBOARD_HOST=127.0.0.1` when a reverse proxy runs on the same host. Do not expose the dashboard port directly to the Internet. Configure TLS at the reverse proxy. Register `<DASHBOARD_PUBLIC_URL>/auth/callback` in the Discord Developer Portal.

Use `/health` for a process and gateway readiness check. The endpoint does not replace a service monitor. Monitor the process, disk space, memory, and recent error logs.

## Smoke checks

After a restart:

1. Confirm that the service is active and enabled.
2. Run `/ping`.
3. Run `/stats`.
4. Run `/diagnose` from a text channel and a voice channel.
5. Run `/play` with a short YouTube video.
6. Press `Next`, `Prev`, `Pause`, `Resume`, and `Stop`.
7. Run `/library` and test liked songs and shared playlists.
8. Run `npm run backup` and inspect the new snapshot.

## Shared music library

The library is shared per Discord server.

- `/like` toggles the current song for the current member.
- `/liked list` shows songs liked by server members and the liker names.
- `/playlist create <name>` creates a shared playlist.
- `/playlist add <id>` adds the current song.
- `/playlist add <id> <song-key>` adds a liked song from the server library.
- `/playlist show <id>` shows the creator and the member who added each song.
- `/playlist play <id>` and `/playlist shuffle <id>` start playback.
- `/playlist remove <id> <song-key>` removes a song.
- `/playlist delete <id>` deletes the shared playlist.
- `/library` opens the interactive library card.

All members can modify shared playlists. The database stores the member attribution for likes and playlist changes.

## Incident response

If playback fails, run `/diagnose`, inspect the latest session log, and test the configured proxy path. If the bot restarts repeatedly, stop it, preserve the latest log, and run `npm test` before restarting it. If the database reports corruption or a migration error, stop the bot and restore the latest verified snapshot.
