const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('prev')
    .setDescription('Putar kembali lagu sebelumnya dari riwayat pemutaran'),
  aliases: ['previous', 'back'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar di server ini!',
        ephemeral: true,
      });
    }

    const memberVoice = interaction.member.voice?.channel;
    if (!memberVoice) {
      return interaction.reply({
        content: '❌ Kamu harus berada di dalam voice channel terlebih dahulu!',
        ephemeral: true,
      });
    }

    try {
      const song = await queue.previous();
      return interaction.reply({
        content: `⏮️ Memutar kembali lagu sebelumnya: **${song.name}**`,
      });
    } catch (err) {
      if (err.errorCode === 'NO_PREVIOUS' || err.message.includes('NO_PREVIOUS')) {
        return interaction.reply({
          content: '❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: `⚠️ Gagal memutar lagu sebelumnya: \`${err.message}\``,
        ephemeral: true,
      });
    }
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Tidak ada musik yang sedang diputar di server ini!');
    }

    const memberVoice = message.member.voice?.channel;
    if (!memberVoice) {
      return message.reply('❌ Kamu harus berada di dalam voice channel terlebih dahulu!');
    }

    try {
      const song = await queue.previous();
      return message.reply(`⏮️ Memutar kembali lagu sebelumnya: **${song.name}**`);
    } catch (err) {
      if (err.errorCode === 'NO_PREVIOUS' || err.message.includes('NO_PREVIOUS')) {
        return message.reply('❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!');
      }
      return message.reply(`⚠️ Gagal memutar lagu sebelumnya: \`${err.message}\``);
    }
  },
};
