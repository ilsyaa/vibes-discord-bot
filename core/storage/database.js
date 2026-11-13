import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { migrations } from './migrations.js';

const metricColumns = new Set(['plays', 'skips', 'failures', 'commands', 'active_minutes']);
const userMetricColumns = new Set(['commands', 'plays', 'active_minutes']);

export function openStore(databasePath, { defaultVolume = 50 } = {}) {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
    defensive: true,
  });

  database.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
  `);

  const applied = new Set(
    database.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((row) => row.version),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      database.close();
      throw error;
    }
  }

  return new Store(database, { defaultVolume });
}

export class Store {
  constructor(database, { defaultVolume = 50 } = {}) {
    this.database = database;
    this.defaultVolume = defaultVolume;
  }

  ensureGuildSettings(guildId) {
    if (!guildId) throw new TypeError('guildId is required');
    this.database
      .prepare('INSERT OR IGNORE INTO guild_settings (guild_id, default_volume) VALUES (?, ?)')
      .run(guildId, this.defaultVolume);
    return this.getGuildSettings(guildId);
  }

  getGuildSettings(guildId) {
    if (!guildId) throw new TypeError('guildId is required');
    const row = this.database
      .prepare('SELECT * FROM guild_settings WHERE guild_id = ?')
      .get(guildId);
    if (!row) return null;
    return normalizeSettings(row);
  }

  updateGuildSettings(guildId, patch, actorId = null) {
    return this.withTransaction(() => {
      const current = this.ensureGuildSettings(guildId);
      const next = {
        ...current,
        ...patch,
        defaultVolume: patch.defaultVolume ?? current.defaultVolume,
        autoplay: patch.autoplay ?? current.autoplay,
        featureFlags: patch.featureFlags ?? current.featureFlags,
      };

      validateSettings(next);
      const featureFlagsJson = JSON.stringify(next.featureFlags);
      this.database
        .prepare(`
          UPDATE guild_settings
          SET music_channel_id = ?,
              control_role_id = ?,
              default_volume = ?,
              autoplay = ?,
              locale = ?,
              feature_flags_json = ?,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE guild_id = ?
        `)
        .run(
          next.musicChannelId,
          next.controlRoleId,
          next.defaultVolume,
          next.autoplay ? 1 : 0,
          next.locale,
          featureFlagsJson,
          guildId,
        );

      this.appendAudit(guildId, actorId, 'guild_settings.updated', guildId, {
        fields: Object.keys(patch),
      });
      return this.getGuildSettings(guildId);
    });
  }

  recordMetric(guildId, metric, amount = 1) {
    if (!guildId || !metricColumns.has(metric)) return;
    if (!Number.isInteger(amount) || amount < 1) throw new RangeError('metric amount must be a positive integer');

    const day = new Date().toISOString().slice(0, 10);
    this.database
      .prepare(`
        INSERT INTO daily_metrics (guild_id, day, ${metric})
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, day) DO UPDATE SET ${metric} = ${metric} + excluded.${metric}
      `)
      .run(guildId, day, amount);
  }

  recordUserActivity(userId, guildId, displayName, metric = 'commands', amount = 1) {
    if (!userId || !guildId || !userMetricColumns.has(metric)) return;
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('user activity amount must be a positive integer');
    }

    const day = new Date().toISOString().slice(0, 10);
    const name = normalizeProfileText(displayName, 'Listener', 80);
    this.database
      .prepare(`
        INSERT INTO user_activity_daily (user_id, guild_id, display_name, day, ${metric})
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, guild_id, day) DO UPDATE SET
          display_name = excluded.display_name,
          ${metric} = ${metric} + excluded.${metric},
          last_seen_at = CURRENT_TIMESTAMP
      `)
      .run(userId, guildId, name, day, amount);
  }

  recordUserTrack({ userId, guildId, displayName, title, url, durationSeconds = 0 }) {
    if (!userId || !guildId || !url) return;

    const trackKey = createHash('sha256').update(String(url)).digest('hex').slice(0, 32);
    const safeTitle = normalizeProfileText(title, 'Unknown track', 160);
    const duration = Number.isFinite(Number(durationSeconds))
      ? Math.max(0, Math.floor(Number(durationSeconds)))
      : 0;

    this.withTransaction(() => {
      this.recordUserActivity(userId, guildId, displayName, 'plays');
      this.database
        .prepare(`
          INSERT INTO user_track_stats
            (user_id, guild_id, track_key, title, plays, duration_seconds)
          VALUES (?, ?, ?, ?, 1, ?)
          ON CONFLICT(user_id, guild_id, track_key) DO UPDATE SET
            title = excluded.title,
            plays = plays + 1,
            duration_seconds = excluded.duration_seconds,
            last_played_at = CURRENT_TIMESTAMP
        `)
        .run(userId, guildId, trackKey, safeTitle, duration);
    });
  }

  getUserProfile(userId, guilds = [], limit = 3) {
    if (!userId) throw new TypeError('userId is required');
    const boundedLimit = Math.min(Math.max(Number(limit) || 3, 1), 10);
    const guildMap = new Map(
      (Array.isArray(guilds) ? guilds : [])
        .filter((guild) => guild?.id)
        .map((guild) => [String(guild.id), normalizeProfileText(guild.name, 'Unknown server', 100)]),
    );
    const guildIds = [...guildMap.keys()];

    const topServers = this.database
      .prepare(`
        SELECT guild_id, SUM(commands) AS commands, SUM(plays) AS plays
        FROM user_activity_daily
        WHERE user_id = ?
        GROUP BY guild_id
        ORDER BY (SUM(plays) * 3 + SUM(commands)) DESC, MAX(last_seen_at) DESC
        LIMIT ?
      `)
      .all(userId, boundedLimit)
      .map((row) => ({
        name: guildMap.get(row.guild_id) || 'Unknown server',
        plays: Number(row.plays),
        commands: Number(row.commands),
      }));

    const topFriends = guildIds.length
      ? this.database
        .prepare(`
          SELECT user_id, MAX(display_name) AS display_name, SUM(plays) AS plays
          FROM user_activity_daily
          WHERE guild_id IN (${guildIds.map(() => '?').join(',')}) AND user_id != ?
          GROUP BY user_id
          ORDER BY SUM(plays) DESC, MAX(last_seen_at) DESC
          LIMIT ?
        `)
        .all(...guildIds, userId, boundedLimit)
        .map((row) => ({
          name: normalizeProfileText(row.display_name, 'Listener', 80),
          plays: Number(row.plays),
        }))
      : [];

    const topTracks = this.database
      .prepare(`
        SELECT
          track_key,
          MAX(title) AS title,
          SUM(plays) AS plays,
          SUM(plays * duration_seconds) AS duration_seconds
        FROM user_track_stats
        WHERE user_id = ?
        GROUP BY track_key
        ORDER BY SUM(plays) DESC, MAX(last_played_at) DESC
        LIMIT ?
      `)
      .all(userId, boundedLimit)
      .map((row) => ({
        title: normalizeProfileText(row.title, 'Unknown track', 160),
        plays: Number(row.plays),
        durationSeconds: Number(row.duration_seconds),
      }));

    const summary = this.database
      .prepare(`
        SELECT
          COALESCE(SUM(commands), 0) AS commands,
          COALESCE(SUM(plays), 0) AS plays,
          COUNT(DISTINCT guild_id) AS servers
        FROM user_activity_daily
        WHERE user_id = ?
      `)
      .get(userId);

    return {
      summary: {
        commands: Number(summary.commands),
        plays: Number(summary.plays),
        servers: Number(summary.servers),
      },
      topServers,
      topFriends,
      topTracks,
    };
  }

  getMetrics(guildId = null) {
    const row = guildId
      ? this.database.prepare(`
          SELECT
            COALESCE(SUM(plays), 0) AS plays,
            COALESCE(SUM(skips), 0) AS skips,
            COALESCE(SUM(failures), 0) AS failures,
            COALESCE(SUM(commands), 0) AS commands,
            COALESCE(SUM(active_minutes), 0) AS active_minutes,
            COUNT(*) AS days
          FROM daily_metrics
          WHERE guild_id = ?
        `).get(guildId)
      : this.database.prepare(`
          SELECT
            COALESCE(SUM(plays), 0) AS plays,
            COALESCE(SUM(skips), 0) AS skips,
            COALESCE(SUM(failures), 0) AS failures,
            COALESCE(SUM(commands), 0) AS commands,
            COALESCE(SUM(active_minutes), 0) AS active_minutes,
            COUNT(DISTINCT day) AS days
          FROM daily_metrics
        `).get();

    return {
      plays: Number(row.plays),
      skips: Number(row.skips),
      failures: Number(row.failures),
      commands: Number(row.commands),
      activeMinutes: Number(row.active_minutes),
      days: Number(row.days),
    };
  }

  appendAudit(guildId, actorId, action, target = null, metadata = {}) {
    if (!guildId || !action) throw new TypeError('guildId and action are required');
    this.database
      .prepare(`
        INSERT INTO audit_log (guild_id, actor_id, action, target, metadata_json)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(guildId, actorId, action, target, JSON.stringify(metadata));
  }

  listAudit(guildId, limit = 50) {
    const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return this.database
      .prepare(`
        SELECT id, guild_id, actor_id, action, target, metadata_json, created_at
        FROM audit_log
        WHERE guild_id = ?
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(guildId, boundedLimit)
      .map((row) => ({
        ...row,
        metadata: parseJson(row.metadata_json, {}),
      }));
  }

  createSession(session) {
    this.database
      .prepare(`
        INSERT INTO dashboard_sessions
          (session_hash, user_id, user_json, guilds_json, csrf_token, expires_at, access_token_encrypted)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.sessionHash,
        session.userId,
        JSON.stringify(session.user),
        JSON.stringify(session.guilds),
        session.csrfToken,
        session.expiresAt,
        session.accessTokenEncrypted,
      );
  }

  getSession(sessionHash) {
    if (!sessionHash) return null;
    const row = this.database
      .prepare('SELECT * FROM dashboard_sessions WHERE session_hash = ?')
      .get(sessionHash);
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
      if (row) this.deleteSession(sessionHash);
      return null;
    }

    this.database
      .prepare('UPDATE dashboard_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_hash = ?')
      .run(sessionHash);

    return {
      sessionHash: row.session_hash,
      userId: row.user_id,
      user: parseJson(row.user_json, {}),
      guilds: parseJson(row.guilds_json, []),
      csrfToken: row.csrf_token,
      expiresAt: row.expires_at,
      accessTokenEncrypted: row.access_token_encrypted,
    };
  }

  deleteSession(sessionHash) {
    this.database.prepare('DELETE FROM dashboard_sessions WHERE session_hash = ?').run(sessionHash);
  }

  createOAuthState(stateHash, codeVerifier, expiresAt) {
    this.database
      .prepare('INSERT INTO oauth_states (state_hash, code_verifier, expires_at) VALUES (?, ?, ?)')
      .run(stateHash, codeVerifier, expiresAt);
  }

  consumeOAuthState(stateHash) {
    const row = this.database
      .prepare('SELECT code_verifier, expires_at FROM oauth_states WHERE state_hash = ?')
      .get(stateHash);
    this.database.prepare('DELETE FROM oauth_states WHERE state_hash = ?').run(stateHash);
    if (!row || new Date(row.expires_at).getTime() <= Date.now()) return null;
    return { codeVerifier: row.code_verifier, expiresAt: row.expires_at };
  }

  cleanupExpired() {
    this.database.prepare("DELETE FROM dashboard_sessions WHERE julianday(expires_at) <= julianday('now')").run();
    this.database.prepare("DELETE FROM oauth_states WHERE julianday(expires_at) <= julianday('now')").run();
  }

  close() {
    this.database.close();
  }

  withTransaction(callback) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function normalizeSettings(row) {
  return {
    guildId: row.guild_id,
    musicChannelId: row.music_channel_id,
    controlRoleId: row.control_role_id,
    defaultVolume: row.default_volume,
    autoplay: Boolean(row.autoplay),
    locale: row.locale,
    featureFlags: parseJson(row.feature_flags_json, {}),
    version: row.version,
    updatedAt: row.updated_at,
  };
}

function validateSettings(settings) {
  if (!Number.isInteger(settings.defaultVolume) || settings.defaultVolume < 0 || settings.defaultVolume > 100) {
    throw new RangeError('defaultVolume must be an integer from 0 to 100');
  }
  if (typeof settings.autoplay !== 'boolean') throw new TypeError('autoplay must be boolean');
  if (typeof settings.locale !== 'string' || settings.locale.length < 2 || settings.locale.length > 16) {
    throw new RangeError('locale must be between 2 and 16 characters');
  }
  if (!settings.featureFlags || typeof settings.featureFlags !== 'object' || Array.isArray(settings.featureFlags)) {
    throw new TypeError('featureFlags must be an object');
  }
}

function normalizeProfileText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
