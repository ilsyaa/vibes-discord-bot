import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getDisTube, skipWithAutoplay, ensureSongMetadata } from './player.js';
import { formatRepeatMode, createNowPlayingEmbed, createPlayerButtons, formatSongLink, getSongTitle } from './ui.js';

export const playCommand = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Putar musik dari YouTube (link video, link playlist, atau judul lagu)')
    .addStringOption((opt) =>
      opt
        .setName('query')
        .setDescription('URL video/playlist YouTube atau judul lagu')
        .setRequired(true),
    ),
  aliases: ['p'],

  async executeSlash(interaction, client) {
    const distube = getDisTube();
    const query = interaction.options.getString('query');
    const member = interaction.member;
    if (!isMusicChannelAllowed(interaction.guildId, interaction.channelId, client)) {
      return interaction.reply({
        content: '❌ Server ini menetapkan channel musik khusus. Gunakan channel yang dikonfigurasi.',
        ephemeral: true,
      });
    }
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
      applyGuildSettings(distube, interaction.guildId, client);

      return interaction.editReply({
        content: `🔍 Memproses permintaan: **${query}**...`,
      });
    } catch (err) {
      console.error('Error /play:', err);
      return interaction.editReply({
        content: `⚠️ Gagal memutar lagu: \`${err.message}\``,
      });
    }
  },

  async executePrefix(message, args, client) {
    const distube = getDisTube();
    if (!args.length) {
      return message.reply('❌ Masukkan link YouTube atau judul lagu! Contoh: `!play lofi beats` atau `!play <link>`');
    }

    const query = args.join(' ');
    if (!isMusicChannelAllowed(message.guildId, message.channelId, client)) {
      return message.reply('❌ Server ini menetapkan channel musik khusus. Gunakan channel yang dikonfigurasi.');
    }
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
      applyGuildSettings(distube, message.guildId, client);
      loadingMsg.delete().catch(() => {});
    } catch (err) {
      console.error('Error prefix play:', err);
      await editLoadingMessage(
        loadingMsg,
        message,
        `⚠️ Gagal memutar lagu: \`${err.message}\``,
      );
    }
  },
};

async function editLoadingMessage(loadingMsg, sourceMessage, content) {
  try {
    await loadingMsg.edit(content);
  } catch {
    await sourceMessage.reply(content).catch(() => {});
  }
}
function applyGuildSettings(distube, guildId, client) {
  try {
    const settings = client.store?.ensureGuildSettings?.(guildId);
    const queue = distube.getQueue(guildId);
    if (!settings || !queue || typeof queue.setVolume !== 'function') return;
    queue.setVolume(settings.defaultVolume);
  } catch (error) {
    console.error('Guild music settings failed:', error.message);
  }
}
function isMusicChannelAllowed(guildId, channelId, client) {
  const settings = client.store?.getGuildSettings?.(guildId);
  return !settings?.musicChannelId || settings.musicChannelId === channelId;
}

export const skipCommand = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Lewati lagu yang sedang diputar ke lagu berikutnya di playlist'),
  aliases: ['next', 's'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    await interaction.deferReply();
    try {
      const song = await queue.skip();
      await ensureSongMetadata(song);
      return interaction.editReply({
        content: `⏭️ Berhasil melewati lagu! Sekarang memutar: **${getSongTitle(song)}**`,
      });
    } catch (err) {
      if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
        await interaction.editReply({ content: '🔍 Mencari rekomendasi autoplay berikutnya...' });
        const song = await skipWithAutoplay(interaction.client, queue);
        if (song) {
          return interaction.editReply({
            content: `⏭️ Berhasil melewati lagu! Sekarang memutar: **${getSongTitle(song)}**`,
          });
        }
        await queue.stop();
        return interaction.editReply({
          content: '⏭️ Tidak ada lagu berikutnya di antrean playlist. Pemutaran dihentikan.',
        });
      }
      return interaction.editReply({
        content: `⚠️ Gagal melewati lagu: \`${err.message}\``,
      });
    }
  },

  async executePrefix(message, _args, client) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    try {
      const song = await queue.skip();
      await ensureSongMetadata(song);
      return message.reply(`⏭️ Berhasil melewati lagu! Sekarang memutar: **${getSongTitle(song)}**`);
    } catch (err) {
      if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
        const song = await skipWithAutoplay(client, queue);
        if (song) return message.reply(`⏭️ Berhasil melewati lagu! Sekarang memutar: **${getSongTitle(song)}**`);
        await queue.stop();
        return message.reply('⏭️ Tidak ada lagu berikutnya di antrean playlist. Pemutaran dihentikan.');
      }
      return message.reply(`⚠️ Gagal melewati lagu: \`${err.message}\``);
    }
  },
};

export const prevCommand = {
  data: new SlashCommandBuilder()
    .setName('prev')
    .setDescription('Putar kembali lagu sebelumnya dari riwayat antrean'),
  aliases: ['previous', 'back'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar!',
        ephemeral: true,
      });
    }

    try {
      const song = await queue.previous();
      await ensureSongMetadata(song);
      return interaction.reply({
        content: `⏮️ Memutar kembali lagu sebelumnya: **${getSongTitle(song)}**`,
      });
    } catch (err) {
      if (err.errorCode === 'NO_PREVIOUS' || err.message.includes('NO_PREVIOUS')) {
        return interaction.reply({
          content: '❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!',
          ephemeral: true,
        });
      }
      return interaction.reply({
        content: `⚠️ Gagal memutar lagu sebelumnya: \`${err.message}\``,
        ephemeral: true,
      });
    }
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Tidak ada musik yang sedang diputar!');
    }

    try {
      const song = await queue.previous();
      await ensureSongMetadata(song);
      return message.reply(`⏮️ Memutar kembali lagu sebelumnya: **${getSongTitle(song)}**`);
    } catch (err) {
      if (err.errorCode === 'NO_PREVIOUS' || err.message.includes('NO_PREVIOUS')) {
        return message.reply('❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!');
      }
      return message.reply(`⚠️ Gagal memutar lagu sebelumnya: \`${err.message}\``);
    }
  },
};

export const queueCommand = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Lihat daftar antrean lagu (playlist) yang sedang diputar'),
  aliases: ['q', 'playlist', 'list'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Antrean playlist saat ini kosong!',
        ephemeral: true,
      });
    }

    return interaction.reply({ embeds: [buildQueueEmbed(queue)] });
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Antrean playlist saat ini kosong!');
    }

    return message.reply({ embeds: [buildQueueEmbed(queue)] });
  },
};

export const pauseCommand = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Jeda lagu yang sedang diputar'),
  aliases: [],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ Tidak ada musik yang sedang diputar!', ephemeral: true });
    }
    if (queue.paused) {
      return interaction.reply({ content: '⚠️ Pemutaran sudah dalam keadaan dijeda!', ephemeral: true });
    }

    queue.pause();
    return interaction.reply('⏸️ Musik berhasil dijeda.');
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar!');
    if (queue.paused) return message.reply('⚠️ Pemutaran sudah dalam keadaan dijeda!');

    queue.pause();
    return message.reply('⏸️ Musik berhasil dijeda.');
  },
};

export const resumeCommand = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Lanjutkan lagu yang sedang dijeda'),
  aliases: ['unpause'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ Tidak ada musik yang sedang diputar!', ephemeral: true });
    }
    if (!queue.paused) {
      return interaction.reply({ content: '⚠️ Pemutaran sedang berlangsung!', ephemeral: true });
    }

    queue.resume();
    return interaction.reply('▶️ Musik dilanjutkan.');
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar!');
    if (!queue.paused) return message.reply('⚠️ Pemutaran sedang berlangsung!');

    queue.resume();
    return message.reply('▶️ Musik dilanjutkan.');
  },
};

export const stopCommand = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Hentikan pemutaran musik, kosongkan antrean, dan keluar dari voice channel'),
  aliases: ['leave', 'disconnect', 'dc'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ Tidak ada musik yang sedang diputar!', ephemeral: true });
    }

    await queue.stop();
    return interaction.reply('⏹️ Pemutaran dihentikan dan antrean playlist telah dikosongkan.');
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar!');

    await queue.stop();
    return message.reply('⏹️ Pemutaran dihentikan dan antrean playlist telah dikosongkan.');
  },
};

export const loopCommand = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Ubah mode repeat / loop')
    .addIntegerOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Pilih mode pengulangan')
        .setRequired(false)
        .addChoices(
          { name: 'Nonaktif (Off)', value: 0 },
          { name: 'Ulangi Lagu Ini (Song)', value: 1 },
          { name: 'Ulangi Seluruh Antrean (Queue)', value: 2 },
        ),
    ),
  aliases: ['repeat'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ Tidak ada musik yang sedang diputar!', ephemeral: true });
    }

    let mode = interaction.options.getInteger('mode');
    if (mode === null) {
      mode = (queue.repeatMode + 1) % 3;
    }

    queue.setRepeatMode(mode);
    return interaction.reply(`🔁 Mode repeat diubah ke: **${formatRepeatMode(mode)}**`);
  },

  async executePrefix(message, args) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar!');

    let mode;
    const arg = args[0]?.toLowerCase();

    if (arg === 'off' || arg === '0') mode = 0;
    else if (arg === 'song' || arg === '1' || arg === 'lagu') mode = 1;
    else if (arg === 'queue' || arg === '2' || arg === 'playlist') mode = 2;
    else {
      mode = (queue.repeatMode + 1) % 3;
    }

    queue.setRepeatMode(mode);
    return message.reply(`🔁 Mode repeat diubah ke: **${formatRepeatMode(mode)}**`);
  },
};

export const shuffleCommand = {
  data: new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Acak urutan lagu di dalam antrean playlist'),
  aliases: ['mix'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || queue.songs.length <= 1) {
      return interaction.reply({
        content: '❌ Tidak cukup lagu di antrean untuk diacak!',
        ephemeral: true,
      });
    }

    await queue.shuffle();
    return interaction.reply('🔀 Antrean lagu berhasil diacak!');
  },

  async executePrefix(message) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue || queue.songs.length <= 1) {
      return message.reply('❌ Tidak cukup lagu di antrean untuk diacak!');
    }

    await queue.shuffle();
    return message.reply('🔀 Antrean lagu berhasil diacak!');
  },
};

export const volumeCommand = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Atur volume pemutaran musik (0 - 100%)')
    .addIntegerOption((opt) =>
      opt
        .setName('percent')
        .setDescription('Tingkat volume dalam persen (0 - 100)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(100),
    ),
  aliases: ['vol', 'v'],

  async executeSlash(interaction) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
      return interaction.reply({ content: '❌ Tidak ada musik yang sedang diputar!', ephemeral: true });
    }

    const volume = interaction.options.getInteger('percent');
    queue.setVolume(volume);
    return interaction.reply(`🔊 Volume berhasil diatur ke **${volume}%**.`);
  },

  async executePrefix(message, args) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue) return message.reply('❌ Tidak ada musik yang sedang diputar!');

    const volume = parseInt(args[0], 10);
    if (isNaN(volume) || volume < 0 || volume > 100) {
      return message.reply('❌ Masukkan angka volume antara 0 sampai 100! Contoh: `!volume 80`');
    }

    queue.setVolume(volume);
    return message.reply(`🔊 Volume berhasil diatur ke **${volume}%**.`);
  },
};

export const autoplayCommand = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Aktifkan rekomendasi YouTube saat antrean habis')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('Aktifkan atau matikan autoplay')
        .setRequired(false),
    ),
  aliases: ['auto'],

  async executeSlash(interaction, client) {
    const enabled = interaction.options.getBoolean('enabled');
    const settings = updateAutoplay(client, interaction.guildId, enabled, interaction.user.id);
    return interaction.reply({
      content: formatAutoplayStatus(settings.autoplay),
      ephemeral: true,
    });
  },

  async executePrefix(message, args, client) {
    const value = (args[0] || 'status').toLowerCase();
    if (!['on', 'off', 'status'].includes(value)) {
      return message.reply('❌ Gunakan `!autoplay on`, `!autoplay off`, atau `!autoplay status`.');
    }

    const enabled = value === 'status' ? null : value === 'on';
    const settings = updateAutoplay(client, message.guildId, enabled, message.author.id);
    return message.reply(formatAutoplayStatus(settings.autoplay));
  },
};

function updateAutoplay(client, guildId, enabled, actorId) {
  const current = client.store?.ensureGuildSettings?.(guildId) || { autoplay: false };
  if (enabled === null) return current;
  return client.store?.updateGuildSettings?.(guildId, { autoplay: enabled }, actorId) || {
    ...current,
    autoplay: enabled,
  };
}

function formatAutoplayStatus(enabled) {
  return enabled
    ? '✅ Autoplay YouTube aktif. Bot akan memilih rekomendasi terkait saat antrean habis.'
    : '⏹️ Autoplay YouTube nonaktif. Bot berhenti setelah antrean habis.';
}

export const nowPlayingCommand = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Tampilkan informasi lagu yang sedang diputar saat ini'),
  aliases: ['np', 'current'],

  async executeSlash(interaction, client) {
    const distube = getDisTube();
    const queue = distube.getQueue(interaction.guildId);

    if (!queue || !queue.songs.length) {
      return interaction.reply({
        content: '❌ Tidak ada musik yang sedang diputar saat ini!',
        ephemeral: true,
      });
    }

    const song = queue.songs[0];
    return interaction.reply({
      embeds: [createNowPlayingEmbed(queue, song)],
      components: createPlayerButtons(queue, {
        autoplayEnabled: client.store?.getGuildSettings?.(queue.id)?.autoplay === true,
      }),
    });
  },

  async executePrefix(message, _args, client) {
    const distube = getDisTube();
    const queue = distube.getQueue(message.guildId);

    if (!queue || !queue.songs.length) {
      return message.reply('❌ Tidak ada musik yang sedang diputar saat ini!');
    }

    const song = queue.songs[0];
    return message.reply({
      embeds: [createNowPlayingEmbed(queue, song)],
      components: createPlayerButtons(queue, {
        autoplayEnabled: client.store?.getGuildSettings?.(queue.id)?.autoplay === true,
      }),
    });
  },
};
export const diagnoseCommand = {
  data: new SlashCommandBuilder()
    .setName('diagnose')
    .setDescription('Periksa voice channel, permission, queue, dan koneksi bot'),
  aliases: ['diag', 'health'],

  async executeSlash(interaction) {
    return interaction.reply({
      embeds: [buildDiagnosticsEmbed(
        interaction.guild,
        interaction.member,
        interaction.channel,
        interaction.client,
      )],
      ephemeral: true,
    });
  },

  async executePrefix(message, args, client) {
    return message.reply({
      embeds: [buildDiagnosticsEmbed(message.guild, message.member, message.channel, client)],
    });
  },
};

function buildDiagnosticsEmbed(guild, member, textChannel, client) {
  const botMember = guild.members.me;
  const userVoice = member?.voice?.channel;
  const botVoice = botMember?.voice?.channel;
  const queue = getDisTube()?.getQueue(guild.id);
  const textPermissions = botMember ? textChannel?.permissionsFor(botMember) : null;
  const voicePermissions = botMember && userVoice ? userVoice.permissionsFor(botMember) : null;
  const websocketPing = client.ws.ping >= 0 ? `${Math.round(client.ws.ping)}ms` : 'Belum tersedia';

  const voiceAlignment = !botVoice
    ? 'ℹ️ Bot belum berada di voice channel.'
    : !userVoice
      ? `ℹ️ Bot berada di <#${botVoice.id}>.`
      : botVoice.id === userVoice.id
        ? `✅ Satu channel: <#${userVoice.id}>`
        : `❌ Bot berada di <#${botVoice.id}>. Join channel yang sama.`;

  const voiceStatus = userVoice
    ? `✅ User: <#${userVoice.id}>`
    : '❌ Join voice channel terlebih dahulu.';

  const queueStatus = queue
    ? `✅ ${queue.songs.length} lagu • ${queue.paused ? 'paused' : 'playing'}`
    : 'ℹ️ Tidak ada queue aktif.';

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🩺 Diagnostik Music Bot')
    .setDescription('Pemeriksaan read-only untuk menemukan penyebab playback gagal.')
    .addFields(
      { name: '🎙️ Voice User', value: voiceStatus, inline: false },
      { name: '🔗 Voice Alignment', value: voiceAlignment, inline: false },
      {
        name: '🔊 Voice Permissions',
        value: userVoice
          ? formatPermissionStatus(voicePermissions, [
            [PermissionFlagsBits.ViewChannel, 'View Channel'],
            [PermissionFlagsBits.Connect, 'Connect'],
            [PermissionFlagsBits.Speak, 'Speak'],
          ])
          : '⚠️ Unknown sampai user join voice channel.',
        inline: false,
      },
      {
        name: '💬 Text Permissions',
        value: formatPermissionStatus(textPermissions, [
          [PermissionFlagsBits.ViewChannel, 'View Channel'],
          [PermissionFlagsBits.SendMessages, 'Send Messages'],
          [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
        ]),
        inline: false,
      },
      { name: '📑 Queue', value: queueStatus, inline: true },
      { name: '⚡ Discord WS', value: websocketPing, inline: true },
    )
    .setFooter({ text: 'Read-only diagnostic • tidak mengubah konfigurasi' })
    .setTimestamp();
}

function formatPermissionStatus(permissions, requiredPermissions) {
  if (!permissions) return '⚠️ Status permission belum tersedia.';

  const missing = requiredPermissions
    .filter(([permission]) => !permissions.has(permission))
    .map(([, name]) => name);

  return missing.length
    ? `❌ Missing: ${missing.join(', ')}`
    : '✅ Semua permission yang dibutuhkan tersedia.';
}


function buildQueueEmbed(queue) {
  const currentSong = queue.songs[0];
  const upcomingSongs = queue.songs.slice(1, 11);

  let description = `**Sedang Diputar:**\n▶️ ${formatSongLink(currentSong)} | \`${currentSong.formattedDuration}\` (oleh: <@${currentSong.user?.id}>)\n\n`;

  if (upcomingSongs.length > 0) {
    description += '**Daftar Lagu Berikutnya:**\n';
    description += upcomingSongs
      .map((song, index) => {
        return `\`${index + 1}.\` ${formatSongLink(song)} | \`${song.formattedDuration}\` (oleh: <@${song.user?.id}>)`;
      })
      .join('\n');

    if (queue.songs.length > 11) {
      description += `\n*...dan ${queue.songs.length - 11} lagu lainnya.*`;
    }
  } else {
    description += '*Tidak ada lagu lagi di dalam antrean.*';
  }

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📑 Antrean Playlist - ${queue.voiceChannel?.name || 'Voice'}`)
    .setDescription(description)
    .addFields(
      { name: '🔢 Total Lagu', value: `${queue.songs.length} lagu`, inline: true },
      { name: '⏱️ Total Durasi', value: queue.formattedDuration || 'N/A', inline: true },
      { name: '⏮️ Riwayat Lagu Lalu', value: `${queue.previousSongs.length} lagu`, inline: true },
      { name: '🔁 Loop Mode', value: formatRepeatMode(queue.repeatMode), inline: true },
      { name: '🔊 Volume', value: `${queue.volume}%`, inline: true },
    )
    .setFooter({ text: 'Gunakan tombol kontrol di pesan pemutar untuk navigasi cepat' })
    .setTimestamp();
}
