const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Atur volume pemutaran musik (1 - 100%)')
    .addIntegerOption((option) =>
      option
        .setName('percent')
        .setDescription('Tingkat volume dalam persen (1 - 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100),
    ),
  aliases: ['vol', 'v'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    const volume = interaction.options.getInteger('percent');
    queue.setVolume(volume);

    return interaction.reply(`🔊 Volume berhasil diatur ke **${volume}%**.`);
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    const volume = parseInt(args[0], 10);
    if (isNaN(volume) || volume < 1 || volume > 100) {
      return message.reply('❌ Masukkan angka volume antara 1 sampai 100! Contoh: `!volume 80`');
    }

    queue.setVolume(volume);
    return message.reply(`🔊 Volume berhasil diatur ke **${volume}%**.`);
  },
};
