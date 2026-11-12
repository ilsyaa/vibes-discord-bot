const { SlashCommandBuilder } = require('discord.js');
const { createNowPlayingEmbed, createPlayerButtons } = require('../ui/playerEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Tampilkan informasi lagu yang sedang diputar saat ini'),
  aliases: ['np', 'current'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar saat ini!',
        ephemeral: true,
      });
    }

    const song = queue.songs[0];
    const embed = createNowPlayingEmbed(queue, song);
    const components = createPlayerButtons(queue);

    return interaction.reply({
      embeds: [embed],
      components,
    });
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Tidak ada musik yang sedang diputar saat ini!');
    }

    const song = queue.songs[0];
    const embed = createNowPlayingEmbed(queue, song);
    const components = createPlayerButtons(queue);

    return message.reply({
      embeds: [embed],
      components,
    });
  },
};
