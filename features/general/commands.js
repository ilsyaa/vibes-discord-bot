import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { config } from '../../core/config.js';
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

export const profileCommand = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Lihat kartu profil musik dan aktivitasmu'),
  aliases: ['me'],

  async executeSlash(interaction, client) {
    return interaction.reply({ files: [await createProfileAttachment(interaction.user, client)] });
  },

  async executePrefix(message, args, client) {
    return message.reply({ files: [await createProfileAttachment(message.author, client)] });
  },
};

async function createProfileAttachment(user, client) {
  const guilds = [...client.guilds.cache.values()].map((guild) => ({
    id: guild.id,
    name: guild.name,
  }));
  const profile = client.store?.getUserProfile?.(user.id, guilds) || {
    summary: { plays: 0, commands: 0, servers: 0 },
    topServers: [],
    topFriends: [],
    topTracks: [],
  };
  const image = await renderProfileCard({
    displayName: user.globalName || user.username || user.tag,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
    profile,
  });
  return new AttachmentBuilder(image, { name: `vibes-profile-${user.id}.png` });
}

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
  const prefix = config.prefix;
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📖 Daftar Perintah Bot')
    .setDescription(`Bot ini mendukung **Slash Command (/)** dan **Prefix Command (${prefix})**.`)
    .addFields(
      {
        name: '🎵 Musik (YouTube Stream Mode)',
        value: [
          `\`/play <query>\` atau \`${prefix}play <query>\` - Putar judul, link video, atau playlist YouTube`,
          `\`/skip\` atau \`${prefix}skip\` (\`${prefix}next\`, \`${prefix}s\`) - Lewati lagu berikutnya`,
          `\`/prev\` atau \`${prefix}prev\` (\`${prefix}previous\`, \`${prefix}back\`) - Putar lagu sebelumnya`,
          `\`/queue\` atau \`${prefix}queue\` (\`${prefix}q\`, \`${prefix}playlist\`, \`${prefix}list\`) - Lihat antrean musik`,
          `\`/pause\` atau \`${prefix}pause\` - Jeda musik`,
          `\`/resume\` atau \`${prefix}resume\` (\`${prefix}unpause\`) - Lanjutkan musik`,
          `\`/stop\` atau \`${prefix}stop\` (\`${prefix}leave\`, \`${prefix}disconnect\`, \`${prefix}dc\`) - Hentikan musik dan kosongkan antrean`,
          `\`/loop [mode]\` atau \`${prefix}loop [off|song|queue]\` (\`${prefix}repeat\`) - Atur mode pengulangan`,
          `\`/shuffle\` atau \`${prefix}shuffle\` (\`${prefix}mix\`) - Acak antrean musik`,
          `\`/volume <0-100>\` atau \`${prefix}volume <0-100>\` (\`${prefix}vol\`, \`${prefix}v\`) - Atur volume`,
          `\`/autoplay [enabled]\` atau \`${prefix}autoplay [on|off|status]\` (\`${prefix}auto\`) - Atur rekomendasi otomatis`,
          `\`/nowplaying\` atau \`${prefix}nowplaying\` (\`${prefix}np\`, \`${prefix}current\`) - Lihat lagu yang sedang diputar`,
          `\`/diagnose\` atau \`${prefix}diagnose\` (\`${prefix}diag\`, \`${prefix}health\`) - Periksa voice, permission, queue, dan koneksi`,
        ].join('\n'),
      },
      {
        name: '🎶 Shared Music Library',
        value: [
          `\`/library\` atau \`${prefix}library\` (\`${prefix}lib\`) - Buka card library server`,
          `\`/like\` atau \`${prefix}like\` (\`${prefix}love\`, \`${prefix}favorite\`) - Tambah atau hapus like lagu aktif`,
          `\`/liked list|play|shuffle|remove <song-key>\` atau \`${prefix}liked ...\` (\`${prefix}likes\`, \`${prefix}favorites\`) - Kelola liked songs server`,
          `\`/playlist list|create|add|show|play|shuffle|remove|delete\` atau \`${prefix}playlist ...\` (\`${prefix}pl\`) - Kelola shared playlist`,
          '`/playlist add <id> [song-key]` - Tambah lagu aktif atau liked song anggota lain',
          'Card library dapat memutar, shuffle, menambah liked song ke playlist, menghapus lagu, dan menghapus playlist.',
        ].join('\n'),
      },
      {
        name: '🛠️ General / Utilities',
        value: [
          `\`/ping\` atau \`${prefix}ping\` (\`${prefix}pings\`, \`${prefix}latency\`) - Cek latensi bot`,
          `\`/stats\` atau \`${prefix}stats\` (\`${prefix}status\`) - Lihat status operasional dan metrics`,
          `\`/profile\` atau \`${prefix}profile\` (\`${prefix}me\`) - Lihat kartu profil musik personal`,
          `\`/help\` atau \`${prefix}help\` (\`${prefix}h\`, \`${prefix}bantuan\`) - Tampilkan panduan ini`,
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Vibes Discord Bot • Modular Architecture' })
    .setTimestamp();

  return embed;
}
