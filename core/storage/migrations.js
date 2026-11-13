export const migrations = [
  {
    version: 1,
    name: 'core-settings-metrics',
    sql: `
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        music_channel_id TEXT,
        control_role_id TEXT,
        default_volume INTEGER NOT NULL DEFAULT 50 CHECK (default_volume BETWEEN 0 AND 100),
        autoplay INTEGER NOT NULL DEFAULT 0 CHECK (autoplay IN (0, 1)),
        locale TEXT NOT NULL DEFAULT 'id-ID',
        feature_flags_json TEXT NOT NULL DEFAULT '{}',
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE TABLE IF NOT EXISTS daily_metrics (
        guild_id TEXT NOT NULL,
        day TEXT NOT NULL,
        plays INTEGER NOT NULL DEFAULT 0,
        skips INTEGER NOT NULL DEFAULT 0,
        failures INTEGER NOT NULL DEFAULT 0,
        commands INTEGER NOT NULL DEFAULT 0,
        active_minutes INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, day)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        actor_id TEXT,
        action TEXT NOT NULL,
        target TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE INDEX IF NOT EXISTS audit_log_guild_created_idx
        ON audit_log (guild_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'dashboard-sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS dashboard_sessions (
        session_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_json TEXT NOT NULL,
        guilds_json TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE INDEX IF NOT EXISTS dashboard_sessions_expires_idx
        ON dashboard_sessions (expires_at);

      CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash TEXT PRIMARY KEY,
        code_verifier TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;

      CREATE INDEX IF NOT EXISTS oauth_states_expires_idx
        ON oauth_states (expires_at);
    `,
  },
  {
    version: 3,
    name: 'user-profile-activity',
    sql: `
      CREATE TABLE IF NOT EXISTS user_activity_daily (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        day TEXT NOT NULL,
        commands INTEGER NOT NULL DEFAULT 0,
        plays INTEGER NOT NULL DEFAULT 0,
        active_minutes INTEGER NOT NULL DEFAULT 0,
        last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, guild_id, day)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS user_activity_user_idx
        ON user_activity_daily (user_id, day DESC);

      CREATE INDEX IF NOT EXISTS user_activity_guild_idx
        ON user_activity_daily (guild_id, day DESC);

      CREATE TABLE IF NOT EXISTS user_track_stats (
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        track_key TEXT NOT NULL,
        title TEXT NOT NULL,
        plays INTEGER NOT NULL DEFAULT 0,
        duration_seconds INTEGER NOT NULL DEFAULT 0,
        last_played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, guild_id, track_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS user_track_stats_user_idx
        ON user_track_stats (user_id, plays DESC, last_played_at DESC);
    `,
  },
];
