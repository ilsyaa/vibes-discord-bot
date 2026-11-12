const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Jeda lagu yang sedang diputar'),
  aliases: [],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    if (queue.paused) {
      return interaction.reply({
        content: '⚠️ Pemutaran sudah dalam keadaan dijeda (paused)!',
        ephemeral: true,
      });
    }

    queue.pause();
    return interaction.reply('⏸️ Musik berhasil dijeda.');
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    if (queue.paused) {
      return message.reply('⚠️ Pemutaran sudah dalam keadaan dijeda (paused)!');
    }

    queue.pause();
    return message.reply('⏸️ Musik berhasil dijeda.');
  },
};
