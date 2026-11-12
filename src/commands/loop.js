const { SlashCommandBuilder } = require('discord.js');
const { formatRepeatMode } = require('../ui/playerEmbed');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Ubah mode pengulangan (Repeat/Loop)')
    .addIntegerOption((option) =>
      option
        .setName('mode')
        .setDescription('Pilih mode loop')
        .setRequired(false)
        .addChoices(
          { name: 'Nonaktif (Off)', value: 0 },
          { name: 'Ulangi Lagu Ini (Song)', value: 1 },
          { name: 'Ulangi Seluruh Antrean (Queue)', value: 2 },
        ),
    ),
  aliases: ['repeat'],

  async executeSlash(interaction, distube) {
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    let mode = interaction.options.getInteger('mode');
    if (mode === null) {
      // Toggle ke mode berikutnya: 0 -> 1 -> 2 -> 0
      mode = (queue.repeatMode + 1) % 3;
    }

    queue.setRepeatMode(mode);
    return interaction.reply(`🔁 Mode pengulangan diubah ke: **${formatRepeatMode(mode)}**`);
  },

  async executePrefix(message, args, distube) {
    const queue = distube.getQueue(message.guildId);

    if (!queue) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    let mode;
    const arg = args[0]?.toLowerCase();

    if (arg === 'off' || arg === '0') mode = 0;
    else if (arg === 'song' || arg === '1' || arg === 'lagu') mode = 1;
    else if (arg === 'queue' || arg === '2' || arg === 'playlist') mode = 2;
    else {
      // Toggle cycle
      mode = (queue.repeatMode + 1) % 3;
    }

    queue.setRepeatMode(mode);
    return message.reply(`🔁 Mode pengulangan diubah ke: **${formatRepeatMode(mode)}**`);
  },
};
