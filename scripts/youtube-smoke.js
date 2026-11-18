import fs from 'node:fs';
import { YouTubePlugin } from '@distube/youtube';
import { Client, Ytdl } from '@distube/ytdl-core';
import { ProxyPool } from '../core/proxy-pool.js';
import { config } from '../core/config.js';
import { startPoTokenProvider } from '../features/music/player.js';

const proxySource = fs.existsSync(config.youtubeProxyFile)
  ? fs.readFileSync(config.youtubeProxyFile, 'utf8')
  : config.youtubeProxies;
const cookies = fs.existsSync('cookies.json')
  ? JSON.parse(fs.readFileSync('cookies.json', 'utf8'))
  : undefined;
const pool = new ProxyPool({
  proxies: proxySource,
  cooldownMs: config.youtubeProxyCooldownMs,
  failureCooldownMs: config.youtubeProxyFailureCooldownMs,
});
const fetchThroughProxy = pool.fetch.bind(pool);
const clients = [Client.Tv, Client.WebEmbedded, Client.Mweb, Client.VisionOS, Client.WebMusic];
let provider;
let session;

try {
  provider = await startPoTokenProvider(fetchThroughProxy);
  const plugin = new YouTubePlugin({
    cookies,
    ytdlOptions: {
      getPoToken: provider || undefined,
      fetch: fetchThroughProxy,
      clients,
    },
  });
  let info;
  let lastError;
  for (const id of ['jNQXAC9IVRw', 'dQw4w9WgXcQ']) {
    try {
      info = await plugin.ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!info) throw lastError || new Error('YouTube metadata unavailable');
  const searchResults = await plugin.search('lofi hip hop', { limit: 3 });

  session = await pool.createSession();
  const mediaYtdl = new Ytdl({
    cookie: plugin.ytCookie || undefined,
    fetch: session.fetch,
    getPoToken: provider || undefined,
    clients,
  });
  const stream = mediaYtdl.download(info, {
    filter: { hasAudio: true, hasVideo: false },
    quality: 'highestaudio',
    highWaterMark: 1 << 20,
  });
  let bytes = 0;
  await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes >= 512 * 1024) {
        stream.destroy();
        resolve();
      }
    });
    stream.once('end', resolve);
    stream.once('error', reject);
  });
  if (bytes === 0) throw new Error('YouTube stream returned no audio bytes');
  console.log(JSON.stringify({
    ok: true,
    videoId: info.videoDetails.id,
    bytes,
    searchResults: searchResults.length,
    proxyPool: pool.snapshot(),
  }));
} finally {
  await session?.close?.();
  await provider?.dispose?.();
  await pool.close();
}
