const fs = require('fs');
const path = require('path');
const { DisTube } = require('distube');
const { YouTubePlugin } = require('@distube/youtube');
const { EmbedBuilder } = require('discord.js');
const { createNowPlayingEmbed, createPlayerButtons } = require('./ui/playerEmbed');
const config = require('./config');

function setupPlayer(client) {
  // Load YouTube cookies if available (optional, helps prevent YouTube 403 / bot checks)
  let cookies;
  const cookiePath = path.join(process.cwd(), 'cookies.json');
  if (fs.existsSync(cookiePath)) {
    try {
      cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      console.log('✅ YouTube cookies.json berhasil dimuat.');
    } catch (err) {
      console.warn('⚠️ Gagal mem-parsing cookies.json:', err.message);
    }
  }

  // Initialize YouTube Plugin with high-performance stream settings
  const youtubePlugin = new YouTubePlugin({
    cookies,
    ytdlOptions: {
      highWaterMark: 1 << 25, // 32MB stream buffer
      quality: 'highestaudio',
      filter: 'audioonly',
      liveBuffer: 40000,
    },
  });

  // Initialize DisTube instance
  const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    savePreviousSongs: true, // Enables queue.previous() functionality
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

  // DisTube Events
  distube.on('playSong', async (queue, song) => {
    if (!queue.textChannel) return;

    try {
      const embed = createNowPlayingEmbed(queue, song);
      const components = createPlayerButtons(queue);
      const message = await queue.textChannel.send({
        embeds: [embed],
        components,
      });

      // Simpan reference message untuk kontrol tombol jika diperlukan
      queue._lastPlayerMessage = message;
    } catch (err) {
      console.error('Error saat mengirim pesan playSong:', err.message);
    }
  });

  distube.on('addSong', (queue, song) => {
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
    if (!queue.textChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0xFEE75C)
      .setTitle('📚 Playlist YouTube Ditambahkan')
      .setDescription(`**[${playlist.name}](${playlist.url})**`)
      .setThumbnail(playlist.thumbnail || null)
      .addFields(
        { name: '🔢 Total Lagu', value: `${playlist.songs.length} lagu`, inline: true },
        { name: '⏱️ Total Durasi', value: playlist.formattedDuration || 'N/A', inline: true },
        { name: '📌 Posisi Antrean', value: `Dimulai dari #${queue.songs.length - playlist.songs.length + 1}`, inline: true },
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
      .setDescription('Semua anggota telah meninggalkan voice channel. Bot menghentikan pemutaran.');

    queue.textChannel.send({ embeds: [embed] }).catch(() => {});
  });

  distube.on('error', (error, queue, song) => {
    console.error('DisTube error:', error);
    if (queue && queue.textChannel) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('⚠️ Terjadi Kesalahan Saat Streaming')
        .setDescription(`Error: \`${error.message.slice(0, 200)}\``);

      queue.textChannel.send({ embeds: [embed] }).catch(() => {});
    }
  });

  distube.on('disconnect', (queue) => {
    console.log(`Bot terputus dari voice channel di guild: ${queue.id}`);
  });

  return distube;
}

module.exports = { setupPlayer };
