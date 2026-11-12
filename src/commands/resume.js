const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Lanjutkan lagu yang sedang dijeda'),
  aliases: ['unpause'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    if (!queue.paused) {
      return interaction.reply({
        content: '⚠️ Pemutaran sedang berlangsung (tidak sedang dijeda)!',
        ephemeral: true,
      });
    }

    queue.resume();
    return interaction.reply('▶️ Musik dilanjutkan.');
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    if (!queue.paused) {
      return message.reply('⚠️ Pemutaran sedang berlangsung (tidak sedang dijeda)!');
    }

    queue.resume();
    return message.reply('▶️ Musik dilanjutkan.');
  },
};
