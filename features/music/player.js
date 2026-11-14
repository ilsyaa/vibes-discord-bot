import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { DisTube } from 'distube';
import { YouTubePlugin } from '@distube/youtube';
import { createPoTokenProvider, Client, Ytdl } from '@distube/ytdl-core';
import { EmbedBuilder } from 'discord.js';
import { config } from '../../core/config.js';
import { ProxyPool } from '../../core/proxy-pool.js';
import { createStreamRelay } from '../../core/stream-relay.js';
import { createNowPlayingEmbed, createPlayerButtons, formatSongLink, getSongTitle } from './ui.js';

let distubeInstance = null;
let youtubePluginInstance = null;
let youtubeProxyPool = null;
let youtubeStreamRelay = null;
let poTokenProvider = null;
let songMetadataResolver = null;

const recordedProfileTracks = new WeakSet();
const autoplayInFlight = new Set();
const autoplayRelatedCache = new Map();
const autoplayRelatedInFlight = new Map();


export function getDisTube() {
  return distubeInstance;
}

export async function ensureSongMetadata(song) {
  await songMetadataResolver?.(song);
  return song;
}

function recordProfileTrack(client, queue, song) {
  if (!song || typeof song !== 'object' || recordedProfileTracks.has(song)) return;

  const requester = song.member?.user || song.user || song.playlist?.member?.user;
  const title = getSongTitle(song, '');
  if (!requester?.id || !song.url || !title) return;

  try {
    client.store?.recordUserTrack?.({
      userId: requester.id,
      guildId: queue.id,
      displayName: requester.globalName || requester.username || requester.tag || 'Listener',
      title,
      url: song.url,
      durationSeconds: song.duration,
    });
    recordedProfileTracks.add(song);
  } catch (error) {
    console.error('Profile track metric failed:', error.message);
  }
}

export function selectAutoplayRecommendation(relatedSongs, queue) {
  const usedIds = new Set(
    [...(queue.songs || []), ...(queue.previousSongs || [])]
      .map((song) => song.id || song.url)
      .filter(Boolean),
  );
  return relatedSongs.find((song) => {
    const duration = Number(song.duration);
    return song.url
      && !song.isLive
      && duration >= 30
      && duration <= 20 * 60
      && !usedIds.has(song.id || song.url);
  });
}
async function getAutoplayRelatedSongs(youtubePlugin, song) {
  const key = song?.id || song?.url;
  if (!key) return [];
  if (autoplayRelatedCache.has(key)) return autoplayRelatedCache.get(key);

  const existingRequest = autoplayRelatedInFlight.get(key);
  if (existingRequest) return existingRequest;

  const request = youtubePlugin.getRelatedSongs(song).then((relatedSongs) => {
    autoplayRelatedCache.set(key, relatedSongs);
    if (autoplayRelatedCache.size > 100) {
      autoplayRelatedCache.delete(autoplayRelatedCache.keys().next().value);
    }
    return relatedSongs;
  }).finally(() => {
    if (autoplayRelatedInFlight.get(key) === request) autoplayRelatedInFlight.delete(key);
  });
  autoplayRelatedInFlight.set(key, request);
  return request;
}

function prefetchAutoplayRelatedSongs(youtubePlugin, song) {
  void getAutoplayRelatedSongs(youtubePlugin, song).catch((error) => {
    console.warn(`Autoplay prefetch failed for ${song?.url || 'unknown song'}:`, error.message);
  });
}


async function autoplayNext(client, distube, youtubePlugin, queue, { manual = false } = {}) {
  if (!queue?.id || !queue.voiceChannel || !queue.textChannel || autoplayInFlight.has(queue.id)) return false;
  if (!client.store?.getGuildSettings?.(queue.id)?.autoplay) return false;

  const currentSong = manual ? queue.songs?.[0] : queue.previousSongs?.at(-1);
  if (!currentSong) return false;

  autoplayInFlight.add(queue.id);
  try {
    const relatedSongs = await getAutoplayRelatedSongs(youtubePlugin, currentSong);
    const recommendation = selectAutoplayRecommendation(relatedSongs, queue);
    if (!recommendation) return false;

    await distube.play(queue.voiceChannel, recommendation.url, {
      textChannel: queue.textChannel,
      member: currentSong.member,
    });
    if (manual) {
      const nextSong = await queue.skip();
      await ensureSongMetadata(nextSong);
      return nextSong;
    }
    return true;
  } catch (error) {
    console.warn(`Autoplay recommendation failed for guild ${queue.id}:`, error.message);
    return false;
  } finally {
    autoplayInFlight.delete(queue.id);
  }
}

export async function skipWithAutoplay(client, queue) {
  return autoplayNext(client, distubeInstance, youtubePluginInstance, queue, { manual: true });
}

function loadProxySource(proxyFile, inlineProxies) {
  const sources = [];
  if (proxyFile && fs.existsSync(proxyFile)) {
    sources.push(fs.readFileSync(proxyFile, 'utf8'));
  }
  if (inlineProxies) sources.push(inlineProxies);
  return sources.join('\n');
}

export async function startPoTokenProvider(
  fetchFn,
  { attempts = 4, delays = [2_000, 6_000, 15_000], create = createPoTokenProvider } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const provider = await create({ fetch: fetchFn });
      console.log('🛡️ PO Token Provider berhasil diinisialisasi.');
      return provider;
    } catch (error) {
      console.warn(`⚠️ Gagal membuat PO Token Provider (percobaan ${attempt}/${attempts}):`, error.message);
      const delay = delays[Math.min(attempt - 1, delays.length - 1)];
      if (attempt === attempts || delay === undefined) break;
      await sleep(delay);
    }
  }
  console.warn('⚠️ PO Token Provider tidak tersedia; playback berjalan tanpa PO token.');
  return null;
}

export async function warmYoutubePipeline(
  youtubePlugin,
  { ids = ['jNQXAC9IVRw', 'dQw4w9WgXcQ'] } = {},
) {
  for (const id of ids) {
    const started = Date.now();
    try {
      await youtubePlugin.ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`);
      console.log(`🔥 Warm-up YouTube siap dalam ${Date.now() - started} ms.`);
      return true;
    } catch (error) {
      console.warn('⚠️ Warm-up YouTube gagal:', error.message);
    }
  }
  return false;
}

function hasSongTitle(song) {
  return typeof song?.name === 'string' && song.name.trim().length > 0;
}

export function hydrateSongMetadata(song, info) {
  const title = [
    info?.videoDetails?.title,
    info?.playerResponse?.videoDetails?.title,
    info?.player_response?.videoDetails?.title,
  ].find((value) => typeof value === 'string' && value.trim());
  if (song && !hasSongTitle(song) && title) song.name = title.trim();
  return song;
}

export async function initMusicPlayer(client) {
  let cookies;
  const cookiePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../cookies.json');
  if (fs.existsSync(cookiePath)) {
    try {
      cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      console.log('✅ YouTube cookies.json berhasil dimuat.');
    } catch (err) {
      console.warn('⚠️ Gagal membaca cookies.json:', err.message);
    }
  }

  const proxySource = loadProxySource(config.youtubeProxyFile, config.youtubeProxies);
  youtubeProxyPool = new ProxyPool({
    proxies: proxySource,
    cooldownMs: config.youtubeProxyCooldownMs,
    failureCooldownMs: config.youtubeProxyFailureCooldownMs,
  });
  const fetchThroughProxy = youtubeProxyPool.fetch.bind(youtubeProxyPool);
  if (youtubeProxyPool.enabled) {
    console.log(`🌐 YouTube proxy pool aktif: ${youtubeProxyPool.size} proxy; rotasi setelah cooldown.`);
  } else {
    console.log('🌐 YouTube proxy pool tidak dikonfigurasi; memakai koneksi langsung.');
  }

  poTokenProvider = await startPoTokenProvider(fetchThroughProxy);
  const poToken = poTokenProvider || undefined;

  const youtubeClients = [
    Client.Tv,
    Client.WebEmbedded,
    Client.Mweb,
    Client.VisionOS,
    Client.WebMusic,
  ];
  const youtubePlugin = new YouTubePlugin({
    cookies,
    ytdlOptions: {
      getPoToken: poToken,
      fetch: fetchThroughProxy,
      clients: youtubeClients,
    },
  });
  youtubePluginInstance = youtubePlugin;
  const resolvedInfos = new Map();
  const songMetadataRequests = new WeakMap();

  const pluginYtdl = youtubePlugin.ytdl;
  const originalGetInfo = pluginYtdl.getInfo.bind(pluginYtdl);
  pluginYtdl.getInfo = async (video, options) => {
    const info = await originalGetInfo(video, options);
    resolvedInfos.set(info.videoDetails.id, info);
    if (resolvedInfos.size > 100) resolvedInfos.delete(resolvedInfos.keys().next().value);
    return info;
  };
  const findResolvedInfo = (song) => {
    if (song.id) {
      const info = resolvedInfos.get(song.id);
      if (info) return info;
    }
    return [...resolvedInfos.values()].find((candidate) => candidate.videoDetails?.url === song.url);
  };

  const recoverSongMetadata = async (song, { requireInfo = false } = {}) => {
    if (!song?.url) return undefined;
    const initialInfo = findResolvedInfo(song);
    if (hasSongTitle(song) && (!requireInfo || initialInfo)) return initialInfo;

    const existingRequest = songMetadataRequests.get(song);
    if (existingRequest) return existingRequest;

    const request = (async () => {
      let info = initialInfo;
      hydrateSongMetadata(song, info);

      if (!hasSongTitle(song) || (requireInfo && !info)) {
        try {
          info = await youtubePlugin.ytdl.getInfo(song.url);
          hydrateSongMetadata(song, info);
        } catch (error) {
          console.warn('⚠️ Gagal mengambil ulang metadata judul YouTube:', error.message);
        }
      }

      if (!hasSongTitle(song)) {
        try {
          const response = await fetchThroughProxy(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(song.url)}&format=json`,
          );
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error(`HTTP ${response.status}`);
          }
          const payload = await response.json();
          if (typeof payload.title === 'string' && payload.title.trim()) {
            song.name = payload.title.trim();
          }
        } catch (error) {
          console.warn('⚠️ Gagal mengambil fallback judul YouTube:', error.message);
        }
      }

      return info;
    })();

    songMetadataRequests.set(song, request);
    try {
      return await request;
    } finally {
      if (songMetadataRequests.get(song) === request) songMetadataRequests.delete(song);
    }
  };
  songMetadataResolver = recoverSongMetadata;
  youtubeStreamRelay = await createStreamRelay({
    createStream: async ({ url, info }) => {
      const mediaInfo = info || await youtubePlugin.ytdl.getInfo(url);
      const session = await youtubeProxyPool.createSession();
      try {
        const streamYtdl = new Ytdl({
          cookie: youtubePlugin.ytCookie || undefined,
          fetch: session.fetch,
          getPoToken: poToken,
          clients: youtubeClients,
        });
        const stream = streamYtdl.download(mediaInfo, {
          filter: { hasAudio: true, hasVideo: false },
          quality: 'highestaudio',
          highWaterMark: 1 << 20,
          liveBuffer: 40000,
        });
        const closeSession = () => {
          void session.close();
        };
        stream.once('end', closeSession);
        stream.once('error', closeSession);
        stream.once('close', closeSession);
        return stream;
      } catch (error) {
        await session.close();
        throw error;
      }
    },
    onError: (error) => console.warn('YouTube relay stream failed:', error.message),
  });
  youtubePlugin.getStreamURL = async (song) => {
    if (!song?.url) throw new Error('YouTube song URL missing');
    const info = await recoverSongMetadata(song, { requireInfo: true });
    if (song.id) resolvedInfos.delete(song.id);
    if (info?.videoDetails?.id) resolvedInfos.delete(info.videoDetails.id);
    return youtubeStreamRelay.register({ url: song.url, info });
  };
  const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    savePreviousSongs: true,
    nsfw: true,
    joinNewVoiceChannel: false,
    plugins: [youtubePlugin],
    ffmpeg: {
      path: 'ffmpeg',
      args: {
        global: {
          loglevel: 'warning',
        },
        input: {
          reconnect: '1',
          reconnect_streamed: '1',
          reconnect_delay_max: '5',
        },
      },
    },
  });

  distube.on('playSong', async (queue, song) => {
    await recoverSongMetadata(song).catch((error) => {
      console.warn('⚠️ Gagal memulihkan metadata lagu yang sedang diputar:', error.message);
    });
    client.store?.recordMetric(queue.id, 'plays');
    recordProfileTrack(client, queue, song);
    if (client.store?.getGuildSettings?.(queue.id)?.autoplay === true) {
      prefetchAutoplayRelatedSongs(youtubePlugin, song);
    }
    if (!queue.textChannel) return;

    try {
      const embed = createNowPlayingEmbed(queue, song);
      const components = createPlayerButtons(queue, {
        autoplayEnabled: client.store?.getGuildSettings?.(queue.id)?.autoplay === true,
      });
      const message = await queue.textChannel.send({
        embeds: [embed],
        components,
      });

      queue._lastPlayerMessage = message;
    } catch (err) {
      console.error('Error saat mengirim pesan playSong:', err.message);
    }
  });

  distube.on('addSong', async (queue, song) => {
    await recoverSongMetadata(song).catch((error) => {
      console.warn('⚠️ Gagal memulihkan metadata lagu antrean:', error.message);
    });
    recordProfileTrack(client, queue, song);
    if (!queue.textChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('➕ Ditambahkan ke Antrean Playlist')
      .setDescription(`**${formatSongLink(song)}**`)
      .setThumbnail(song.thumbnail || null)
      .addFields(
        { name: '⏱️ Durasi', value: song.formattedDuration || 'N/A', inline: true },
        { name: '👤 Channel', value: song.uploader?.name || song.uploader || 'Unknown', inline: true },
        { name: '📌 Posisi Antrean', value: `#${queue.songs.length}`, inline: true },
      )
      .setFooter({ text: `Diminta oleh ${song.user?.tag || song.user?.username || 'User'}` })
      .setTimestamp();

    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  });

  distube.on('addList', (queue, playlist) => {
    for (const song of playlist.songs || []) {
      recordProfileTrack(client, queue, song);
    }
    if (!queue.textChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('📚 Playlist YouTube Ditambahkan')
      .setDescription(`**[${playlist.name}](${playlist.url})**`)
      .setThumbnail(playlist.thumbnail || null)
      .addFields(
        { name: '🔢 Total Lagu', value: `${playlist.songs.length} lagu`, inline: true },
        { name: '⏱️ Total Durasi', value: playlist.formattedDuration || 'N/A', inline: true },
        { name: '📌 Posisi Antrean', value: `Mulai dari #${queue.songs.length - playlist.songs.length + 1}`, inline: true },
      )
      .setFooter({ text: `Diminta oleh ${playlist.user?.tag || playlist.user?.username || 'User'}` })
      .setTimestamp();

    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  });

  distube.on('finish', async (queue) => {
    if (await autoplayNext(client, distube, youtubePlugin, queue)) return;
    if (!queue.textChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🏁 Pemutaran Selesai')
      .setDescription('Semua lagu dalam antrean playlist telah selesai diputar.');

    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  });

  distube.on('empty', (queue) => {
    if (!queue.textChannel) return;
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('👋 Voice Channel Kosong')
      .setDescription('Semua anggota telah meninggalkan voice channel. Bot menghentikan musik.');

    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  });

  distube.on('error', (error, queue) => {
    client.store?.recordMetric(queue?.id, 'failures');
    console.error('DisTube stream error:', error);
    if (queue && queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Terjadi Kesalahan Streaming')
        .setDescription(`Error: \`${error.message.slice(0, 200)}\``);

      queue.textChannel.send({ embeds: [embed] }).catch(() => {});
    }
  });

  distubeInstance = distube;
  void warmYoutubePipeline(youtubePlugin);
  return distube;
}

export async function closeMusicPlayer() {
  const distube = distubeInstance;
  const provider = poTokenProvider;
  const pool = youtubeProxyPool;
  const relay = youtubeStreamRelay;
  await Promise.allSettled(
    [...(distube?.queues?.collection?.values?.() || [])].map((queue) => queue.stop()),
  );
  poTokenProvider = null;
  songMetadataResolver = null;
  youtubePluginInstance = null;
  youtubeProxyPool = null;
  youtubeStreamRelay = null;
  distubeInstance = null;
  autoplayRelatedCache.clear();
  autoplayRelatedInFlight.clear();

  await relay?.close?.().catch((error) => {
    console.warn('⚠️ Gagal menutup YouTube stream relay:', error.message);
  });
  await provider?.dispose?.().catch((error) => {
    console.warn('⚠️ Gagal menutup PO Token Provider:', error.message);
  });
  await pool?.close?.().catch((error) => {
    console.warn('⚠️ Gagal menutup YouTube proxy pool:', error.message);
  });
}
