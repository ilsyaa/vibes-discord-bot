import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';

export function formatRepeatMode(mode) {
  if (mode === 1) return '🔂 Lagu';
  if (mode === 2) return '🔁 Playlist';
  return '❌ Nonaktif';
}

export function getSongTitle(song, fallback = 'Judul tidak tersedia') {
  const candidates = [
    song?.name,
    song?.title,
    song?.metadata?.title,
    song?.info?.videoDetails?.title,
    song?.videoDetails?.title,
  ];
  const title = candidates.find((value) => typeof value === 'string' && value.trim());
  return title?.trim() || fallback;
}
export function formatSongLink(song) {
  const title = getSongTitle(song)
    .replaceAll('\\', '\\\\')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
  return `[${title}](${song.url})`;
}

export function createNowPlayingEmbed(queue, song) {
  const isPaused = queue.paused;
  const loopStatus = formatRepeatMode(queue.repeatMode);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Sedang Memutar Musik (YouTube Stream)')
    .setDescription(`**${formatSongLink(song)}**`)
    .addFields(
      { name: '⏱️ Durasi', value: song.formattedDuration || 'Live Stream', inline: true },
      { name: '👤 Channel / Artist', value: song.uploader?.name || 'Unknown', inline: true },
      { name: '🎧 Diminta Oleh', value: `<@${song.user?.id}>`, inline: true },
      { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
      { name: '🔁 Loop', value: loopStatus, inline: true },
      { name: '📑 Sisa Antrean', value: `${queue.songs.length - 1} lagu`, inline: true },
    )
    .setFooter({
      text: `Status: ${isPaused ? '⏸️ Dijeda (Paused)' : '▶️ Memutar (Direct Opus Stream)'}`,
    })
    .setTimestamp();
}

export function clampVolume(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

export function createPlayerButtons(queue, { autoplayEnabled = false } = {}) {
  const isPaused = queue ? queue.paused : false;
  const volume = clampVolume(queue?.volume);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_prev')
      .setLabel('Prev')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || queue.previousSongs.length === 0),
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('Next')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || (queue.songs.length <= 1 && !autoplayEnabled)),
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setLabel('Shuffle')
      .setEmoji('🔀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || queue.songs.length <= 2),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setLabel('Loop')
      .setEmoji('🔁')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_volume_down')
      .setLabel('-10%')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || volume <= 0),
    new ButtonBuilder()
      .setCustomId('music_autoplay')
      .setLabel(autoplayEnabled ? 'Auto: On' : 'Auto: Off')
      .setEmoji('🔄')
      .setStyle(autoplayEnabled ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!queue),
    new ButtonBuilder()
      .setCustomId('music_volume_up')
      .setLabel('+10%')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!queue || volume >= 100),
    new ButtonBuilder()
      .setCustomId('music_queue')
      .setLabel('Antrean')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_like')
      .setLabel('Like')
      .setEmoji('❤️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_playlist')
      .setLabel('Playlist')
      .setEmoji('🎶')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, row3];
}
