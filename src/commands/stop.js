const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Hentikan pemutaran musik, kosongkan antrean, dan keluar dari voice channel'),
  aliases: ['leave', 'disconnect', 'dc'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    await queue.stop();
    return interaction.reply('⏹️ Pemutaran dihentikan dan antrean playlist telah dikosongkan.');
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    await queue.stop();
    return message.reply('⏹️ Pemutaran dihentikan dan antrean playlist telah dikosongkan.');
  },
};
