import path from 'node:path';
import 'dotenv/config';

const databasePath = process.env.DATABASE_PATH || 'data/vibes.sqlite';

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  prefix: process.env.PREFIX || '!',
  defaultVolume: parseInteger(process.env.DEFAULT_VOLUME, 50, 'DEFAULT_VOLUME', 0, 100),
  databasePath: databasePath === ':memory:' ? databasePath : path.resolve(databasePath),
  dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true',
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',
  dashboardPort: parseInteger(process.env.DASHBOARD_PORT, 8787, 'DASHBOARD_PORT', 0, 65535),
  dashboardPublicUrl: normalizePublicUrl(process.env.DASHBOARD_PUBLIC_URL || ''),
  dashboardClientId: process.env.DASHBOARD_CLIENT_ID || process.env.CLIENT_ID || '',
  dashboardClientSecret: process.env.DASHBOARD_CLIENT_SECRET || '',
  dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET || '',
};

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
