import path from 'node:path';
import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  prefix: process.env.PREFIX || '!',
  defaultVolume: parseInt(process.env.DEFAULT_VOLUME, 10) || 50,
  databasePath: path.resolve(process.env.DATABASE_PATH || 'data/vibes.sqlite'),
  dashboardEnabled: process.env.DASHBOARD_ENABLED === 'true',
  dashboardHost: process.env.DASHBOARD_HOST || '127.0.0.1',
  dashboardPort: parseInt(process.env.DASHBOARD_PORT, 10) || 8787,
  dashboardPublicUrl: process.env.DASHBOARD_PUBLIC_URL || '',
  dashboardClientId: process.env.DASHBOARD_CLIENT_ID || process.env.CLIENT_ID || '',
  dashboardClientSecret: process.env.DASHBOARD_CLIENT_SECRET || '',
  dashboardSessionSecret: process.env.DASHBOARD_SESSION_SECRET || '',
};
