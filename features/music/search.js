import {
  ActionRowBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getDisTube, searchYoutube } from './player.js';
import { getSongTitle } from './ui.js';
import { voiceControlError } from './access.js';

export const searchCommand = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Cari YouTube dan pilih lagu yang ingin diputar')
    .addStringOption((option) => option
      .setName('query')
      .setDescription('Judul lagu atau artis')
      .setRequired(true)
      .setMinLength(2)
      .setMaxLength(200)),
  aliases: ['find', 'cari'],

  async executeSlash(interaction, client) {
    const query = interaction.options.getString('query', true).trim();
    const accessError = searchAccessError(interaction, client);
    if (accessError) return interaction.reply({ content: accessError, ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const results = await searchYoutube(query, 5);
      if (!results.length) return interaction.editReply({ content: `❌ Tidak ada hasil untuk **${query}**.` });
      return interaction.editReply(searchPayload(query, results, interaction.user.id));
    } catch (error) {
      console.error('YouTube search failed:', error);
      return interaction.editReply({ content: '⚠️ Pencarian YouTube gagal. Coba lagi beberapa saat.' });
    }
  },

  async executePrefix(message, args, client) {
    const query = args.join(' ').trim();
    if (query.length < 2) return message.reply('❌ Masukkan minimal dua karakter pencarian.');
    const accessError = searchAccessError(message, client);
    if (accessError) return message.reply(accessError);
    const loading = await message.reply(`🔎 Mencari **${query}**...`);
    try {
      const results = await searchYoutube(query, 5);
      if (!results.length) return loading.edit({ content: `❌ Tidak ada hasil untuk **${query}**.`, components: [] });
      return loading.edit(searchPayload(query, results, message.author.id));
    } catch (error) {
      console.error('YouTube search failed:', error);
      return loading.edit({ content: '⚠️ Pencarian YouTube gagal. Coba lagi beberapa saat.', components: [] });
    }
  },
};

export function createSearchMenu(results, userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`music_search_select:${userId}`)
      .setPlaceholder('Pilih satu lagu')
      .addOptions(results.slice(0, 5).map((song) => ({
        label: cleanText(getSongTitle(song), 100),
        description: cleanText([
          song.uploader?.name || song.uploader,
          song.formattedDuration,
        ].filter(Boolean).join(' • ') || 'YouTube', 100),
        value: String(song.url).slice(0, 100),
      }))),
  );
}

export async function handleSearchSelection(interaction, client) {
  if (!interaction.isStringSelectMenu?.() || !interaction.customId.startsWith('music_search_select:')) {
    return false;
  }
  const ownerId = interaction.customId.split(':')[1];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: '❌ Hasil pencarian ini milik pengguna lain.', ephemeral: true });
    return true;
  }
  const accessError = searchAccessError(interaction, client);
  if (accessError) {
    await interaction.reply({ content: accessError, ephemeral: true });
    return true;
  }
  const url = interaction.values[0];
  if (!/^https:\/\/(?:www\.)?youtube\.com\/watch\?/u.test(url)) {
    await interaction.reply({ content: '❌ Hasil pencarian tidak valid.', ephemeral: true });
    return true;
  }

  await interaction.update({ content: '⏳ Menambahkan pilihan ke antrean...', components: [] });
  try {
    const distube = getDisTube();
    const existingQueue = distube.getQueue(interaction.guildId);
    await distube.play(interaction.member.voice.channel, url, {
      textChannel: interaction.channel,
      member: interaction.member,
    });
    if (!existingQueue) {
      const settings = client.store?.ensureGuildSettings?.(interaction.guildId);
      const queue = distube.getQueue(interaction.guildId);
      if (settings && queue?.setVolume) queue.setVolume(settings.defaultVolume);
    }
    await interaction.editReply({ content: '✅ Lagu pilihanmu ditambahkan ke antrean.', components: [] });
  } catch (error) {
    console.error('YouTube search selection failed:', error);
    await interaction.editReply({ content: '⚠️ Lagu pilihan gagal ditambahkan. Coba hasil lain.', components: [] });
  }
  return true;
}

function searchPayload(query, results, userId) {
  return {
    content: `🔎 Pilih hasil untuk **${cleanText(query, 120)}**:`,
    components: [createSearchMenu(results, userId)],
  };
}

function searchAccessError(source, client) {
  const settings = client.store?.getGuildSettings?.(source.guildId);
  if (settings?.musicChannelId && settings.musicChannelId !== source.channelId) {
    return `❌ Gunakan channel musik <#${settings.musicChannelId}>.`;
  }
  const distube = getDisTube();
  const queue = distube?.getQueue(source.guildId);
  const voiceError = voiceControlError(source.member, queue);
  if (voiceError) return voiceError;
  const botVoice = source.guild?.members?.me?.voice?.channel;
  if (botVoice && botVoice.id !== source.member.voice.channel.id) {
    return `❌ Kamu harus berada di voice channel yang sama dengan bot (<#${botVoice.id}>)!`;
  }
  return null;
}

function cleanText(value, length) {
  return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, length) || 'Tanpa judul';
}
