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
export const statsCommand = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Lihat status operasional bot dan resource runtime'),
  aliases: ['status'],

  async executeSlash(interaction, client) {
    return interaction.reply({ embeds: [buildStatsEmbed(client)] });
  },

  async executePrefix(message, args, client) {
    return message.reply({ embeds: [buildStatsEmbed(client)] });
  },
};

function buildStatsEmbed(client) {
  const cachedMembers = [...client.guilds.cache.values()]
    .reduce((total, guild) => total + (guild.memberCount || 0), 0);
  const websocketPing = client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'Belum tersedia';
  const metrics = client.store?.getMetrics?.() || {
    plays: 0,
    skips: 0,
    failures: 0,
    commands: 0,
    days: 0,
  };

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📊 Statistik Operasional Bot')
    .setDescription('Status runtime dan aggregate metrics; raw query tidak disimpan.')
    .addFields(
      { name: '⏱️ Uptime', value: formatDuration(process.uptime() * 1000), inline: true },
      { name: '🏠 Server', value: `${client.guilds.cache.size}`, inline: true },
      { name: '👥 Cached Members', value: `${cachedMembers}`, inline: true },
      { name: '⚡ Discord WS', value: websocketPing, inline: true },
      { name: '💾 RSS Memory', value: formatBytes(process.memoryUsage().rss), inline: true },
      { name: '🧩 Loaded Commands', value: `${client.commands.size}`, inline: true },
      { name: '🎵 Plays', value: `${metrics.plays}`, inline: true },
      { name: '❌ Playback Failures', value: `${metrics.failures}`, inline: true },
      { name: '🗓️ Metric Days', value: `${metrics.days}`, inline: true },
      { name: '🟢 Runtime', value: `Node.js ${process.version}`, inline: false },
    )
    .setFooter({ text: 'Vibes Discord Bot • Operational stats' })
    .setTimestamp();
}

function formatDuration(milliseconds) {
  let seconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    `${seconds}s`,
  ].filter(Boolean).join(' ');
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}


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
          '`/nowplaying` atau `!np` - Informasi lagu yang sedang berputar\n' +
          '`/diagnose` atau `!diagnose` - Diagnostik voice, permission, dan queue',
      },
      {
        name: '🛠️ General / Utilities',
        value:
          '`/ping` atau `!ping` - Cek latensi respons bot\n' +
          '`/stats` atau `!stats` - Lihat status operasional bot\n' +
          '`/help` atau `!help` - Menampilkan panduan bantuan ini',
      },
    )
    .setFooter({ text: 'Vibes Discord Bot • Modular Architecture' })
    .setTimestamp();

  return embed;
}
