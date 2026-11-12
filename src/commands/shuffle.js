const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Acak urutan lagu di dalam antrean playlist'),
  aliases: ['mix'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || queue.songs.length <= 1) {
      return interaction.reply({
        content: '❌ Tidak cukup lagu di antrean untuk diacak!',
        ephemeral: true,
      });
    }

    await queue.shuffle();
    return interaction.reply('🔀 Antrean lagu berhasil diacak!');
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue || queue.songs.length <= 1) {
      return message.reply('❌ Tidak cukup lagu di antrean untuk diacak!');
    }

    await queue.shuffle();
    return message.reply('🔀 Antrean lagu berhasil diacak!');
  },
};
