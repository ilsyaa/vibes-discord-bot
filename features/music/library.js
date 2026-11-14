import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getDisTube, ensureSongMetadata } from './player.js';
import { formatSongLink, getSongTitle } from './ui.js';

const MAX_PLAYLIST_NAME = 64;
const MAX_SONG_KEY = 512;

export function normalizeSong(song) {
  if (!song || typeof song !== 'object') throw new TypeError('Song is required');

  const url = stringValue(song.url);
  const songKey = stringValue(song.songKey || url || song.id || song.videoId);
  const title = getSongTitle(song, '').trim();
  if (!url || !songKey || !title) throw new TypeError('Song must include a URL, key, and title');
  if (songKey.length > MAX_SONG_KEY) throw new RangeError('Song key is too long');

  const duration = song.durationSeconds ?? song.duration ?? song.lengthSeconds ?? 0;
  const durationSeconds = Number.isFinite(Number(duration)) ? Math.max(0, Math.round(Number(duration))) : 0;
  const thumbnail = stringValue(song.thumbnail || song.thumbnailUrl);
  const uploader = typeof song.uploader === 'string'
    ? song.uploader.trim()
    : stringValue(song.uploader?.name || song.uploader?.username || song.author);

  return { songKey, url, title, durationSeconds, thumbnail, uploader };
}

export function getCurrentSong(guildId) {
  return getDisTube()?.getQueue(guildId)?.songs?.[0] || null;
}

export async function saveCurrentSongToLiked(client, guildId, userId) {
  const song = await resolveCurrentSong(guildId);
  if (!song) throw new Error('Tidak ada lagu yang sedang diputar saat ini.');
  return client.store.toggleLikedSong(validateUserId(userId), normalizeSong(song));
}

export async function saveCurrentSongToPlaylist(client, guildId, userId, playlistId) {
  const song = await resolveCurrentSong(guildId);
  if (!song) throw new Error('Tidak ada lagu yang sedang diputar saat ini.');
  return client.store.addPlaylistSong(
    validateUserId(userId),
    validatePlaylistId(playlistId),
    normalizeSong(song),
  );
}

export function createPlaylistSelectMenu(playlists) {
  const options = playlists.slice(0, 25).map((playlist) => ({
    label: `${playlist.name} (${playlist.songCount || 0})`.slice(0, 100),
    value: String(playlist.playlistId ?? playlist.id),
    description: 'Simpan lagu yang sedang diputar',
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('music_playlist_select')
      .setPlaceholder('Pilih playlist pribadi')
      .addOptions(options),
  );
}

export async function handlePlaylistSelect(interaction, client) {
  if (!interaction.isStringSelectMenu?.() || interaction.customId !== 'music_playlist_select') return false;

  try {
    const playlistId = validatePlaylistId(interaction.values?.[0]);
    const result = await saveCurrentSongToPlaylist(client, interaction.guildId, interaction.user.id, playlistId);
    await interaction.update({
      content: `✅ **${result.title}** disimpan ke playlist pribadi.`,
      components: [],
    });
  } catch (error) {
    const payload = { content: `⚠️ ${friendlyError(error)}`, components: [] };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.update(payload).catch(() => {});
  }
  return true;
}

export const likeCommand = {
  data: new SlashCommandBuilder().setName('like').setDescription('Simpan atau hapus lagu yang sedang diputar dari lagu disukai'),
  aliases: ['love', 'favorite'],
  async executeSlash(interaction, client) {
    return executeLike(interaction, client, true);
  },
  async executePrefix(message, _args, client) {
    return executeLike(message, client, false);
  },
};

export const likedCommand = {
  data: new SlashCommandBuilder()
    .setName('liked')
    .setDescription('Kelola koleksi lagu yang kamu sukai')
    .addSubcommand((sub) => sub.setName('list').setDescription('Tampilkan lagu yang disukai'))
    .addSubcommand((sub) => sub.setName('play').setDescription('Putar semua lagu yang disukai'))
    .addSubcommand((sub) => sub.setName('shuffle').setDescription('Acak dan putar lagu yang disukai'))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Hapus lagu dari koleksi').addStringOption((opt) => opt.setName('song_key').setDescription('URL atau kunci lagu').setRequired(true))),
  aliases: ['likes', 'favorites'],
  async executeSlash(interaction, client) {
    const action = interaction.options.getSubcommand?.() || 'list';
    const args = action === 'remove' ? [interaction.options.getString('song_key')] : [];
    return executeLikedAction(interaction, client, action, true, args);
  },
  async executePrefix(message, args, client) {
    return executeLikedAction(message, client, args[0]?.toLowerCase() || 'list', false, args.slice(1));
  },
};

export const playlistCommand = {
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Kelola playlist musik pribadimu')
    .addSubcommand((sub) => sub.setName('list').setDescription('Tampilkan playlist pribadi'))
    .addSubcommand((sub) => sub.setName('create').setDescription('Buat playlist baru').addStringOption((opt) => opt.setName('name').setDescription('Nama playlist').setRequired(true).setMaxLength(MAX_PLAYLIST_NAME)))
    .addSubcommand((sub) => sub.setName('add').setDescription('Simpan lagu yang sedang diputar').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub.setName('show').setDescription('Tampilkan isi playlist').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub.setName('play').setDescription('Putar playlist').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub.setName('shuffle').setDescription('Acak dan putar playlist').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)))
    .addSubcommand((sub) => sub.setName('remove').setDescription('Hapus lagu dari playlist').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)).addStringOption((opt) => opt.setName('song_key').setDescription('URL atau kunci lagu').setRequired(true)))
    .addSubcommand((sub) => sub.setName('delete').setDescription('Hapus playlist').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1))),
  aliases: ['pl', 'personalplaylist'],
  async executeSlash(interaction, client) {
    const action = interaction.options.getSubcommand?.() || 'list';
    const playlistId = interaction.options.getInteger?.('playlist_id');
    const songKey = interaction.options.getString?.('song_key');
    const name = interaction.options.getString?.('name');
    return executePlaylistAction(interaction, client, action, { playlistId, songKey, name }, true);
  },
  async executePrefix(message, args, client) {
    const action = args[0]?.toLowerCase() || 'list';
    const playlistId = args[1];
    const value = args.slice(2).join(' ');
    return executePlaylistAction(message, client, action, {
      playlistId,
      songKey: value,
      name: args.slice(1).join(' '),
    }, false);
  },
};

async function executeLike(source, client, ephemeral) {
  try {
    const result = await saveCurrentSongToLiked(client, source.guildId, source.user?.id || source.author?.id);
    const content = result.liked
      ? `❤️ **${result.song.title}** ditambahkan ke lagu yang disukai.`
      : `💔 **${result.song.title}** dihapus dari lagu yang disukai.`;
    return reply(source, { content, ephemeral });
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function executeLikedAction(source, client, action, ephemeral, args = []) {
  const userId = source.user?.id || source.author?.id;
  try {
    const store = client.store;
    if (!store) throw new Error('Penyimpanan musik belum tersedia.');
    const songs = store.listLikedSongs(validateUserId(userId));
    if (action === 'remove') {
      const key = validateSongKey(args[0]);
      const removed = store.removeLikedSong(validateUserId(userId), key);
      return reply(source, { content: removed ? '✅ Lagu dihapus dari koleksi.' : '❌ Lagu tidak ditemukan di koleksi.', ephemeral });
    }
    if (action === 'play' || action === 'shuffle') {
      if (!songs.length) throw new Error('Koleksi lagu yang disukai masih kosong.');
      const selected = action === 'shuffle' ? shuffleSongs(songs) : songs;
      return playCollection(source, selected, client, ephemeral);
    }
    return reply(source, { embeds: [buildLikedEmbed(songs)], ephemeral });
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function executePlaylistAction(source, client, action, values, ephemeral) {
  const userId = source.user?.id || source.author?.id;
  try {
    const store = client.store;
    if (!store) throw new Error('Penyimpanan musik belum tersedia.');
    if (action === 'create') {
      const name = validatePlaylistName(values.name);
      const playlist = store.createPlaylist(validateUserId(userId), name);
      return reply(source, { content: `✅ Playlist **${playlist.name}** dibuat dengan ID \`${playlist.playlistId ?? playlist.id}\`.`, ephemeral });
    }
    if (action === 'list') return reply(source, { embeds: [buildPlaylistEmbed(store.listPlaylists(validateUserId(userId)))], ephemeral });

    const playlistId = validatePlaylistId(values.playlistId);
    const playlist = store.getPlaylist(validateUserId(userId), playlistId);
    if (!playlist) throw new Error('Playlist tidak ditemukan.');
    if (action === 'add') {
      const song = await saveCurrentSongToPlaylist(client, source.guildId, userId, playlistId);
      return reply(source, { content: `✅ **${song.title}** disimpan ke playlist.`, ephemeral });
    }
    if (action === 'show') {
      return reply(source, { embeds: [buildPlaylistSongsEmbed(playlist, store.listPlaylistSongs(validateUserId(userId), playlistId))], ephemeral });
    }
    if (action === 'delete') {
      const deleted = store.deletePlaylist(validateUserId(userId), playlistId);
      return reply(source, { content: deleted ? '✅ Playlist dihapus.' : '❌ Playlist tidak ditemukan.', ephemeral });
    }
    if (action === 'remove') {
      const removed = store.removePlaylistSong(validateUserId(userId), playlistId, validateSongKey(values.songKey));
      return reply(source, { content: removed ? '✅ Lagu dihapus dari playlist.' : '❌ Lagu tidak ditemukan di playlist.', ephemeral });
    }

    const songs = store.listPlaylistSongs(validateUserId(userId), playlistId);
    if (!songs.length) throw new Error('Playlist ini masih kosong.');
    const selected = action === 'shuffle' ? shuffleSongs(songs) : songs;
    if (action !== 'play' && action !== 'shuffle') throw new Error('Aksi playlist tidak dikenal.');
    return playCollection(source, selected, client, ephemeral);
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function playCollection(source, songs, client, ephemeral) {
  const voiceChannel = source.member?.voice?.channel;
  if (!voiceChannel) throw new Error('Kamu harus berada di dalam voice channel terlebih dahulu.');
  const botVoice = source.guild?.members?.me?.voice?.channel;
  if (botVoice && botVoice.id !== voiceChannel.id) throw new Error(`Kamu harus berada di voice channel yang sama dengan bot (<#${botVoice.id}>).`);

  const distube = getDisTube();
  if (!distube) throw new Error('Pemutar musik belum siap.');
  const textChannel = source.channel;
  const member = source.member;
  const loading = `🔍 Memproses ${songs.length} lagu dari koleksi pribadi...`;
  if (source.isChatInputCommand?.()) await source.deferReply({ ephemeral });
  else {
    const message = await source.reply(loading);
    try {
      for (const song of songs) await distube.play(voiceChannel, song.url, { textChannel, member });
      await message.edit(`✅ Menambahkan ${songs.length} lagu ke antrean.`);
    } catch (error) {
      await message.edit(`⚠️ Gagal memutar koleksi: ${friendlyError(error)}`).catch(() => {});
    }
    return message;
  }

  try {
    for (const song of songs) await distube.play(voiceChannel, song.url, { textChannel, member });
    return source.editReply({ content: `✅ Menambahkan ${songs.length} lagu ke antrean.` });
  } catch (error) {
    return source.editReply({ content: `⚠️ Gagal memutar koleksi: ${friendlyError(error)}` });
  }
}

async function resolveCurrentSong(guildId) {
  const song = getCurrentSong(guildId);
  if (!song) return null;
  await ensureSongMetadata(song);
  return song;
}

function buildLikedEmbed(songs) {
  const description = songs.length
    ? songs.map((song, index) => `\`${index + 1}.\` ${formatSongLink(song)}`).join('\n')
    : '*Belum ada lagu yang disukai.*';
  return new EmbedBuilder().setColor(0xED4245).setTitle('❤️ Lagu yang Disukai').setDescription(description.slice(0, 4096));
}

function buildPlaylistEmbed(playlists) {
  const description = playlists.length
    ? playlists.map((playlist) => `\`${playlist.playlistId ?? playlist.id}\` • **${playlist.name}** — ${playlist.songCount || 0} lagu`).join('\n')
    : '*Belum ada playlist pribadi.*';
  return new EmbedBuilder().setColor(0x5865F2).setTitle('🎶 Playlist Pribadi').setDescription(description.slice(0, 4096));
}

function buildPlaylistSongsEmbed(playlist, songs) {
  const description = songs.length
    ? songs.map((song, index) => `\`${index + 1}.\` ${formatSongLink(song)}`).join('\n')
    : '*Playlist ini masih kosong.*';
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎶 ${playlist.name}`)
    .setDescription(description.slice(0, 4096));
}

function shuffleSongs(songs) {
  const copy = [...songs];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function validateUserId(value) {
  const id = stringValue(value);
  if (!id || id.length > 100 || /[\0-\x1F\x7F]/.test(id)) throw new TypeError('User ID tidak valid.');
  return id;
}

function validatePlaylistId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('ID playlist tidak valid.');
  return id;
}

function validateSongKey(value) {
  const key = stringValue(value);
  if (!key || key.length > MAX_SONG_KEY || /[\0-\x1F\x7F]/.test(key)) throw new TypeError('Kunci lagu tidak valid.');
  return key;
}

function validatePlaylistName(value) {
  const name = stringValue(value).replace(/\s+/g, ' ');
  if (!name || name.length > MAX_PLAYLIST_NAME) throw new TypeError(`Nama playlist harus 1-${MAX_PLAYLIST_NAME} karakter.`);
  return name;
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function friendlyError(error) {
  const message = String(error?.message || error || 'Operasi gagal.').replace(/[\\`]/g, "'");
  if (/UNIQUE|duplicate|already exists/i.test(message)) return 'Nama atau lagu tersebut sudah ada.';
  return message.slice(0, 300);
}

function reply(source, payload) {
  if (source.isChatInputCommand?.()) {
    if (source.deferred || source.replied) return source.editReply(payload);
    return source.reply(payload);
  }
  const { ephemeral: _ephemeral, ...messagePayload } = payload;
  return source.reply(messagePayload);
}
