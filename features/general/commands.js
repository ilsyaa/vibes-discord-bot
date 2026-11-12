import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Cek latensi bot dan koneksi Discord Gateway'),
  aliases: ['pings', 'latency'],

  async executeSlash(interaction, client) {
    const sent = await interaction.reply({
      content: '🏓 Mengukur latensi...',
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const websocket = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 Bot Latency', value: `\`${roundtrip}ms\``, inline: true },
        { name: '⚡ Discord API (WS)', value: `\`${websocket}ms\``, inline: true },
      )
      .setTimestamp();

    return interaction.editReply({ content: null, embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const sent = await message.reply('🏓 Mengukur latensi...');
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;
    const websocket = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('🏓 Pong!')
      .addFields(
        { name: '📡 Bot Latency', value: `\`${roundtrip}ms\``, inline: true },
        { name: '⚡ Discord API (WS)', value: `\`${websocket}ms\``, inline: true },
      )
      .setTimestamp();

    return sent.edit({ content: null, embeds: [embed] });
  },
};

export const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Tampilkan seluruh daftar perintah yang tersedia di bot'),
  aliases: ['h', 'bantuan'],

  async executeSlash(interaction, client) {
    const embed = buildHelpEmbed(client);
    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const embed = buildHelpEmbed(client);
    return message.reply({ embeds: [embed] });
  },
};

function buildHelpEmbed(client) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📖 Daftar Perintah Bot')
    .setDescription('Bot ini mendukung **Slash Command (/)** dan **Prefix Command (!)**.')
    .addFields(
      {
        name: '🎵 Musik (YouTube Stream Mode)',
        value:
          '`/play [query]` atau `!play [query]` - Putar musik dari judul, link video, atau playlist\n' +
          '`/skip` atau `!skip` (`!next`) - Lewati ke lagu berikutnya\n' +
          '`/prev` atau `!prev` - Putar kembali lagu sebelumnya dari history\n' +
          '`/queue` atau `!queue` (`!q`) - Lihat antrean playlist yang sedang diputar\n' +
          '`/pause` & `/resume` - Jeda / Lanjutkan musik\n' +
          '`/stop` atau `!stop` - Matikan musik dan bersihkan antrean\n' +
          '`/loop` atau `!loop` - Atur pengulangan (off / song / queue)\n' +
          '`/shuffle` atau `!shuffle` - Acak antrean lagu\n' +
          '`/volume [1-100]` atau `!volume [1-100]` - Atur volume suara\n' +
          '`/nowplaying` atau `!np` - Informasi lagu yang sedang berputar',
      },
      {
        name: '🛠️ General / Utilities',
        value:
          '`/ping` atau `!ping` - Cek latensi respons bot\n' +
          '`/help` atau `!help` - Menampilkan panduan bantuan ini',
      },
    )
    .setFooter({ text: 'Vibes Discord Bot • Modular Architecture' })
    .setTimestamp();

  return embed;
}
