import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'node:sqlite';
import { migrations } from './migrations.js';

const metricColumns = new Set(['plays', 'skips', 'failures', 'commands', 'active_minutes']);

export function openStore(databasePath) {
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

  return new Store(database);
}

export class Store {
  constructor(database) {
    this.database = database;
  }

  ensureGuildSettings(guildId) {
    if (!guildId) throw new TypeError('guildId is required');
    this.database
      .prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)')
      .run(guildId);
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

    this.withTransaction(() => {
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
    });

    return this.getGuildSettings(guildId);
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
          (session_hash, user_id, user_json, guilds_json, csrf_token, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        session.sessionHash,
        session.userId,
        JSON.stringify(session.user),
        JSON.stringify(session.guilds),
        session.csrfToken,
        session.expiresAt,
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

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
