import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  prefix: process.env.PREFIX || '!',
  defaultVolume: parseInt(process.env.DEFAULT_VOLUME, 10) || 50,
  youtubeProxy: process.env.YOUTUBE_PROXY || '',
};
