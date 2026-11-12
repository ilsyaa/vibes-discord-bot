const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

/**
 * Format repeat mode integer to human readable Indonesian string
 */
function formatRepeatMode(mode) {
  if (mode === 1) return '🔂 Lagu';
  if (mode === 2) return '🔁 Playlist';
  return '❌ Nonaktif';
}

/**
 * Create Now Playing Embed
 */
function createNowPlayingEmbed(queue, song) {
  const isPaused = queue.paused;
  const loopStatus = formatRepeatMode(queue.repeatMode);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Sedang Memutar Musik')
    .setDescription(`**[${song.name}](${song.url})**`)
    .setThumbnail(song.thumbnail || null)
    .addFields(
      { name: '⏱️ Durasi', value: song.formattedDuration || 'Live Stream', inline: true },
      { name: '👤 Channel / Artist', value: song.uploader.name || 'Unknown', inline: true },
      { name: '🎧 Diminta Oleh', value: `<@${song.user?.id}>`, inline: true },
      { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
      { name: '🔁 Loop', value: loopStatus, inline: true },
      { name: '📑 Sisa Antrean', value: `${queue.songs.length - 1} lagu`, inline: true },
    )
    .setFooter({
      text: `Status: ${isPaused ? '⏸️ Dijeda (Paused)' : '▶️ Memutar (Stream Mode Direct)'}`,
    })
    .setTimestamp();
}

/**
 * Create ActionRow buttons for player control
 */
function createPlayerButtons(queue) {
  const isPaused = queue ? queue.paused : false;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_prev')
      .setLabel('Prev')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || queue.previousSongs.length === 0),
    new ButtonBuilder()
      .setCustomId('btn_pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_skip')
      .setLabel('Next')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || queue.songs.length <= 1),
    new ButtonBuilder()
      .setCustomId('btn_shuffle')
      .setLabel('Shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || queue.songs.length <= 2),
    new ButtonBuilder()
      .setCustomId('btn_stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_loop')
      .setLabel('Loop')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_queue')
      .setLabel('Antrean')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

module.exports = {
  createNowPlayingEmbed,
  createPlayerButtons,
  formatRepeatMode,
};
