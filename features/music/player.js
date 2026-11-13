import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DisTube } from 'distube';
import { YouTubePlugin } from '@distube/youtube';
import { createPoTokenProvider, Client } from '@distube/ytdl-core';
import { EmbedBuilder } from 'discord.js';
import { createNowPlayingEmbed, createPlayerButtons } from './ui.js';

let distubeInstance = null;
const recordedProfileTracks = new WeakSet();

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

  let poToken;
  try {
    poToken = await createPoTokenProvider();
    console.log('🛡️ PO Token Provider berhasil diinisialisasi.');
  } catch (err) {
    console.warn('⚠️ Gagal membuat PO Token Provider:', err.message);
  }

  const youtubePlugin = new YouTubePlugin({
    cookies,
    ytdlOptions: {
      getPoToken: poToken,
      clients: [
        Client.Tv,
        Client.WebEmbedded,
        Client.Mweb,
        Client.VisionOS,
        Client.WebMusic,
      ],
      highWaterMark: 1 << 25,
      quality: 'highestaudio',
      filter: 'audioonly',
      liveBuffer: 40000,
    },
  });

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

  distube.on('finish', (queue) => {
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
