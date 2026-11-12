const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Lewati lagu yang sedang diputar ke lagu berikutnya di antrean'),
  aliases: ['next', 's'],

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
      const song = await queue.skip();
      return interaction.reply({
        content: `⏭️ Berhasil melewati lagu! Sekarang memutar: **${song.name}**`,
      });
    } catch (err) {
      if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
        // Jika tidak ada lagu berikutnya, hentikan antrean
        await queue.stop();
        return interaction.reply({
          content: '⏭️ Tidak ada lagu berikutnya di antrean playlist. Pemutaran dihentikan.',
        });
      }
      return interaction.reply({
        content: `⚠️ Gagal melewati lagu: \`${err.message}\``,
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
      const song = await queue.skip();
      return message.reply(`⏭️ Berhasil melewati lagu! Sekarang memutar: **${song.name}**`);
    } catch (err) {
      if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
        await queue.stop();
        return message.reply('⏭️ Tidak ada lagu berikutnya di antrean playlist. Pemutaran dihentikan.');
      }
      return message.reply(`⚠️ Gagal melewati lagu: \`${err.message}\``);
    }
  },
};
