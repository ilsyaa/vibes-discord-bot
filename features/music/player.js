import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DisTube } from 'distube';
import { YouTubePlugin } from '@distube/youtube';
import { createPoTokenProvider, Client } from '@distube/ytdl-core';
import { EmbedBuilder } from 'discord.js';
import { config } from '../../core/config.js';
import { ProxyPool } from '../../core/proxy-pool.js';
import { createStreamRelay } from '../../core/stream-relay.js';
import { createNowPlayingEmbed, createPlayerButtons } from './ui.js';

let distubeInstance = null;
let youtubeProxyPool = null;
let youtubeStreamRelay = null;
let poTokenProvider = null;

const recordedProfileTracks = new WeakSet();
const autoplayInFlight = new Set();

export function getDisTube() {
  return distubeInstance;
}

function recordProfileTrack(client, queue, song) {
  if (!song || typeof song !== 'object' || recordedProfileTracks.has(song)) return;

  const requester = song.member?.user || song.user || song.playlist?.member?.user;
  if (!requester?.id || !song.url) return;

  try {
    client.store?.recordUserTrack?.({
      userId: requester.id,
      guildId: queue.id,
      displayName: requester.globalName || requester.username || requester.tag || 'Listener',
      title: song.name,
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

async function autoplayNext(client, distube, youtubePlugin, queue) {
  if (!queue?.id || !queue.voiceChannel || !queue.textChannel || autoplayInFlight.has(queue.id)) return false;
  if (!client.store?.getGuildSettings?.(queue.id)?.autoplay) return false;

  const currentSong = queue.previousSongs?.at(-1);
  if (!currentSong) return false;

  autoplayInFlight.add(queue.id);
  try {
    const relatedSongs = await youtubePlugin.getRelatedSongs(currentSong);
    const recommendation = selectAutoplayRecommendation(relatedSongs, queue);
    if (!recommendation) return false;

    await distube.play(queue.voiceChannel, recommendation.url, {
      textChannel: queue.textChannel,
      member: currentSong.member,
    });
    return true;
  } catch (error) {
    console.warn(`Autoplay recommendation failed for guild ${queue.id}:`, error.message);
    return false;
  } finally {
    autoplayInFlight.delete(queue.id);
  }
}

function loadProxySource(proxyFile, inlineProxies) {
  const sources = [];
  if (proxyFile && fs.existsSync(proxyFile)) {
    sources.push(fs.readFileSync(proxyFile, 'utf8'));
  }
  if (inlineProxies) sources.push(inlineProxies);
  return sources.join('\n');
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

  let poToken;
  try {
    poTokenProvider = await createPoTokenProvider({ fetch: fetchThroughProxy });
    poToken = poTokenProvider;
    console.log('🛡️ PO Token Provider berhasil diinisialisasi.');
  } catch (err) {
    console.warn('⚠️ Gagal membuat PO Token Provider:', err.message);
  }

  const youtubePlugin = new YouTubePlugin({
    cookies,
    ytdlOptions: {
      getPoToken: poToken,
      fetch: fetchThroughProxy,
      clients: [
        Client.Tv,
        Client.WebEmbedded,
        Client.Mweb,
        Client.VisionOS,
        Client.WebMusic,
      ],
    },
  });
  youtubeStreamRelay = await createStreamRelay({
    createStream: (source) =>
      youtubePlugin.ytdl.download(source, {
        filter: { hasAudio: true, hasVideo: false },
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        liveBuffer: 40000,
      }),
    onError: (error) => console.warn('YouTube relay stream failed:', error.message),
  });
  youtubePlugin.getStreamURL = async (song) => {
    if (!song?.url) throw new Error('YouTube song URL missing');
    return youtubeStreamRelay.register(song.url);
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
    client.store?.recordMetric(queue.id, 'plays');
    recordProfileTrack(client, queue, song);
    if (!queue.textChannel) return;

    try {
      const embed = createNowPlayingEmbed(queue, song);
      const components = createPlayerButtons(queue);
      const message = await queue.textChannel.send({
        embeds: [embed],
        components,
      });

      queue._lastPlayerMessage = message;
    } catch (err) {
      console.error('Error saat mengirim pesan playSong:', err.message);
    }
  });

  distube.on('addSong', (queue, song) => {
    recordProfileTrack(client, queue, song);
    if (!queue.textChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('➕ Ditambahkan ke Antrean Playlist')
      .setDescription(`**[${song.name}](${song.url})**`)
      .setThumbnail(song.thumbnail || null)
      .addFields(
        { name: '⏱️ Durasi', value: song.formattedDuration || 'N/A', inline: true },
        { name: '👤 Channel', value: song.uploader.name || 'Unknown', inline: true },
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
  return distube;
}

export async function closeMusicPlayer() {
  const provider = poTokenProvider;
  const pool = youtubeProxyPool;
  const relay = youtubeStreamRelay;
  poTokenProvider = null;
  youtubeProxyPool = null;
  youtubeStreamRelay = null;
  distubeInstance = null;

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
