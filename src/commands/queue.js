const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatRepeatMode } = require('../ui/playerEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Lihat daftar antrean lagu (playlist) yang sedang diputar'),
  aliases: ['q', 'playlist', 'list'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Antrean playlist saat ini kosong!',
        ephemeral: true,
      });
    }

    const embed = buildQueueEmbed(queue);
    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Antrean playlist saat ini kosong!');
    }

    const embed = buildQueueEmbed(queue);
    return message.reply({ embeds: [embed] });
  },
};

function buildQueueEmbed(queue) {
  const currentSong = queue.songs[0];
  const upcomingSongs = queue.songs.slice(1, 11); // Max 10 upcoming

  let description = `**Sedang Diputar:**\n▶️ [${currentSong.name}](${currentSong.url}) | \`${currentSong.formattedDuration}\` (oleh: <@${currentSong.user?.id}>)\n\n`;

  if (upcomingSongs.length > 0) {
    description += '**Daftar Lagu Berikutnya:**\n';
    description += upcomingSongs
      .map((song, index) => {
        return `\`${index + 1}.\` [${song.name}](${song.url}) | \`${song.formattedDuration}\` (oleh: <@${song.user?.id}>)`;
      })
      .join('\n');

    if (queue.songs.length > 11) {
      description += `\n*...dan ${queue.songs.length - 11} lagu lainnya.*`;
    }
  } else {
    description += '*Tidak ada lagu lagi di dalam antrean.*';
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📑 Antrean Playlist - ${queue.voiceChannel?.name || 'Voice'}`)
    .setDescription(description)
    .addFields(
      { name: '🔢 Total Lagu', value: `${queue.songs.length} lagu`, inline: true },
      { name: '⏱️ Total Durasi', value: queue.formattedDuration || 'N/A', inline: true },
      { name: '⏮️ Riwayat Lagu Lalu', value: `${queue.previousSongs.length} lagu`, inline: true },
      { name: '🔁 Loop Mode', value: formatRepeatMode(queue.repeatMode), inline: true },
      { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
    )
    .setFooter({ text: 'Gunakan tombol kontrol di pesan pemutar untuk navigasi cepat' })
    .setTimestamp();
}
