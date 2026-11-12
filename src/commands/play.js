const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Putar lagu/playlist dari YouTube (link video, link playlist, atau judul)')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('URL video YouTube, URL playlist YouTube, atau judul lagu')
        .setRequired(true),
    ),
  aliases: ['p'],

  async executeSlash(interaction, distube) {
    const query = interaction.options.getString('query');
    const member = interaction.member;
    const voiceChannel = member.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ Kamu harus berada di dalam voice channel terlebih dahulu!',
        ephemeral: true,
      });
    }

    const botVoice = interaction.guild.members.me?.voice?.channel;
    if (botVoice && botVoice.id !== voiceChannel.id) {
      return interaction.reply({
        content: `❌ Kamu harus berada di voice channel yang sama dengan bot (<#${botVoice.id}>)!`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      await distube.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member,
      });

      return interaction.editReply({
        content: `🔍 Memproses permintaan: **${query}**...`,
      });
    } catch (err) {
      console.error('Error saat menjalankan /play:', err);
      return interaction.editReply({
        content: `⚠️ Gagal memutar lagu: \`${err.message}\``,
      });
    }
  },

  async executePrefix(message, args, distube) {
    if (!args.length) {
      return message.reply('❌ Masukkan link YouTube atau judul lagu! Contoh: `!play lofi beats` atau `!play <link>`');
    }

    const query = args.join(' ');
    const voiceChannel = message.member.voice?.channel;

    if (!voiceChannel) {
      return message.reply('❌ Kamu harus berada di dalam voice channel terlebih dahulu!');
    }

    const botVoice = message.guild.members.me?.voice?.channel;
    if (botVoice && botVoice.id !== voiceChannel.id) {
      return message.reply(`❌ Kamu harus berada di voice channel yang sama dengan bot (<#${botVoice.id}>)!`);
    }

    const loadingMsg = await message.reply(`🔍 Memproses permintaan: **${query}**...`);

    try {
      await distube.play(voiceChannel, query, {
        textChannel: message.channel,
        member: message.member,
      });

      // Hapus pesan loading setelah DisTube memproses
      loadingMsg.delete().catch(() => {});
    } catch (err) {
      console.error('Error saat menjalankan prefix play:', err);
      loadingMsg.edit(`⚠️ Gagal memutar lagu: \`${err.message}\``).catch(() => {});
    }
  },
};
