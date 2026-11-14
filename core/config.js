import path from 'node:path';
import 'dotenv/config';

const databasePath = process.env.DATABASE_PATH || 'data/vibes.sqlite';

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  prefix: process.env.PREFIX || '!',
  defaultVolume: parseInteger(process.env.DEFAULT_VOLUME, 50, 'DEFAULT_VOLUME', 0, 100),
  databasePath: databasePath === ':memory:' ? databasePath : path.resolve(databasePath),
  databaseBackupDir: path.resolve(process.env.DATABASE_BACKUP_DIR || 'backups'),
  databaseBackupRetention: parseInteger(
    process.env.DATABASE_BACKUP_RETENTION,
    14,
    'DATABASE_BACKUP_RETENTION',
    1,
    365,
  ),
  dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true',
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',
  dashboardPort: parseInteger(process.env.DASHBOARD_PORT, 8787, 'DASHBOARD_PORT', 0, 65535),
  dashboardPublicUrl: normalizePublicUrl(process.env.DASHBOARD_PUBLIC_URL || ''),
  dashboardClientId: process.env.DASHBOARD_CLIENT_ID || process.env.CLIENT_ID || '',
  dashboardClientSecret: process.env.DASHBOARD_CLIENT_SECRET || '',
  dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET || '',
  youtubeProxyFile: path.resolve(process.env.YOUTUBE_PROXY_FILE || 'data/youtube-proxies.txt'),
  youtubeProxies: process.env.YOUTUBE_PROXIES || process.env.YOUTUBE_PROXY || '',
  youtubeProxyCooldownMs: parseInteger(
    process.env.YOUTUBE_PROXY_COOLDOWN_MS,
    60_000,
    'YOUTUBE_PROXY_COOLDOWN_MS',
    1_000,
    60 * 60 * 1_000,
  ),
  youtubeProxyFailureCooldownMs: parseInteger(
    process.env.YOUTUBE_PROXY_FAILURE_COOLDOWN_MS,
    10 * 60_000,
    'YOUTUBE_PROXY_FAILURE_COOLDOWN_MS',
    1_000,
    24 * 60 * 60 * 1_000,
  ),
};
export function validateRuntimeConfig({
  requireToken = true,
  requireClientId = false,
  currentConfig = config,
} = {}) {
  if (requireToken && !currentConfig.token) throw new Error('DISCORD_TOKEN belum diatur di .env.');
  if (requireClientId && !currentConfig.clientId) throw new Error('CLIENT_ID belum diatur di .env.');
  if (!currentConfig.dashboardEnabled) return;
  const missing = [
    ['DASHBOARD_PUBLIC_URL', currentConfig.dashboardPublicUrl],
    ['DASHBOARD_CLIENT_ID or CLIENT_ID', currentConfig.dashboardClientId],
    ['DASHBOARD_CLIENT_SECRET', currentConfig.dashboardClientSecret],
    ['DASHBOARD_SESSION_SECRET', currentConfig.dashboardSessionSecret],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Dashboard aktif tetapi konfigurasi belum lengkap: ${missing.join(', ')}`);
  const publicUrl = new URL(currentConfig.dashboardPublicUrl);
  const localDevelopmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname);
  if (publicUrl.protocol !== 'https:' && !localDevelopmentHost) {
    throw new Error('DASHBOARD_PUBLIC_URL harus memakai HTTPS kecuali untuk localhost.');
  }
  if (currentConfig.dashboardSessionSecret.length < 32 || /^(?:replace-with|change-me|your-|default)/iu.test(currentConfig.dashboardSessionSecret)) {
    throw new Error('DASHBOARD_SESSION_SECRET harus berupa secret acak minimal 32 karakter.');
  }
}

function parseInteger(value, fallback, name, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function normalizePublicUrl(value) {
  return value.replace(/\/+$/u, '');
}
