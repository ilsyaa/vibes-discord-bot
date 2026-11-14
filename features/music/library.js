import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

export async function saveCurrentSongToLiked(client, guildId, userId, displayName) {
  const song = await resolveCurrentSong(guildId);
  if (!song) throw new Error('Tidak ada lagu yang sedang diputar saat ini.');
  return client.store.toggleLikedSong(
    validateUserId(guildId),
    validateUserId(userId),
    normalizeSong(song),
    validateDisplayName(displayName),
  );
}

export async function saveCurrentSongToPlaylist(client, guildId, userId, playlistId, displayName) {
  const song = await resolveCurrentSong(guildId);
  if (!song) throw new Error('Tidak ada lagu yang sedang diputar saat ini.');
  return client.store.addPlaylistSong(
    validateUserId(guildId),
    validatePlaylistId(playlistId),
    normalizeSong(song),
    validateUserId(userId),
    validateDisplayName(displayName),
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
      .setPlaceholder('Pilih shared playlist')
      .addOptions(options),
  );
}

export async function handlePlaylistSelect(interaction, client) {
  if (!interaction.isStringSelectMenu?.() || interaction.customId !== 'music_playlist_select') return false;

  try {
    const playlistId = validatePlaylistId(interaction.values?.[0]);
    const result = await saveCurrentSongToPlaylist(
      client,
      interaction.guildId,
      interaction.user.id,
      playlistId,
      interaction.user.globalName || interaction.user.username,
    );
    await interaction.update({
      content: `✅ **${result.title}** disimpan ke shared playlist.`,
      components: [],
    });
  } catch (error) {
    const payload = { content: `⚠️ ${friendlyError(error)}`, components: [] };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.update(payload).catch(() => {});
  }
  return true;
}
export async function handleLibraryInteraction(interaction, client) {
  const customId = interaction.customId || '';
  if (!customId.startsWith('library_')) return false;

  const guildId = validateUserId(interaction.guildId);
  const userId = validateUserId(interaction.user?.id);
  const store = client.store;
  try {
    if (interaction.isStringSelectMenu?.()) {
      if (customId === 'library_playlist_select') {
        await showPlaylistPanel(interaction, store, guildId, interaction.values?.[0]);
      } else if (customId.startsWith('library_playlist_add_liked_select:')) {
        const playlistId = validatePlaylistId(customId.split(':')[1]);
        const songs = store.listLikedSongs(guildId);
        const song = songs[Number(interaction.values?.[0])];
        if (!song) throw new Error('Liked song tidak ditemukan.');
        const displayName = interaction.user.globalName || interaction.user.username;
        store.addPlaylistSong(guildId, playlistId, normalizeSong(song), userId, validateDisplayName(displayName));
        await showPlaylistPanel(interaction, store, guildId, playlistId);
      } else if (customId === 'library_liked_remove_select') {
        const songs = store.listLikedSongs(guildId);
        const song = songs[Number(interaction.values?.[0])];
        if (!song) throw new Error('Lagu tidak ditemukan.');
        store.removeLikedSong(guildId, userId, song.songKey);
        await showLikedPanel(interaction, store, guildId);
      } else if (customId.startsWith('library_playlist_remove_select:')) {
        const playlistId = customId.split(':')[1];
        const songs = store.listPlaylistSongs(guildId, validatePlaylistId(playlistId));
        const song = songs[Number(interaction.values?.[0])];
        if (!song) throw new Error('Lagu tidak ditemukan.');
        store.removePlaylistSong(guildId, validatePlaylistId(playlistId), song.songKey);
        await showPlaylistPanel(interaction, store, guildId, playlistId);
      } else {
        return false;
      }
      return true;
    }

    if (!interaction.isButton()) return false;
    if (customId === 'library_home') {
      await interaction.update(libraryHomePayload(store, guildId, userId));
    } else if (customId === 'library_liked') {
      await showLikedPanel(interaction, store, guildId);
    } else if (customId === 'library_play_liked' || customId === 'library_shuffle_liked') {
      const songs = store.listLikedSongs(guildId);
      if (!songs.length) throw new Error('Koleksi lagu yang disukai masih kosong.');
      const selected = customId === 'library_shuffle_liked' ? shuffleSongs(songs) : songs;
      await playCollection(interaction, selected, client, true);
    } else if (customId === 'library_liked_remove') {
      const songs = store.listLikedSongs(guildId);
      await interaction.update({
        embeds: [buildLikedEmbed(songs)],
        components: [createRemoveSongMenu('library_liked_remove_select', songs), libraryBackButtons()],
      });
    } else if (customId === 'library_playlists') {
      await showPlaylistList(interaction, store, guildId);
    } else if (customId.startsWith('library_playlist_play:') || customId.startsWith('library_playlist_shuffle:')) {
      const playlistId = validatePlaylistId(customId.split(':')[1]);
      const songs = store.listPlaylistSongs(guildId, playlistId);
      if (!songs.length) throw new Error('Playlist ini masih kosong.');
      const selected = customId.startsWith('library_playlist_shuffle:')
        ? shuffleSongs(songs)
        : songs;
      await playCollection(interaction, selected, client, true);
    } else if (customId.startsWith('library_playlist_add_liked:')) {
      const playlistId = validatePlaylistId(customId.split(':')[1]);
      const playlist = store.getPlaylist(guildId, playlistId);
      if (!playlist) throw new Error('Playlist tidak ditemukan.');
      const songs = store.listLikedSongs(guildId);
      if (!songs.length) throw new Error('Belum ada liked song di server ini.');
      await interaction.update({
        embeds: [buildPlaylistSongsEmbed(playlist, store.listPlaylistSongs(guildId, playlistId))],
        components: [createLikedSongMenu(`library_playlist_add_liked_select:${playlistId}`, songs), playlistBackButtons(playlistId)],
      });
    } else if (customId.startsWith('library_playlist_remove:')) {
      const playlistId = validatePlaylistId(customId.split(':')[1]);
      const playlist = store.getPlaylist(guildId, playlistId);
      if (!playlist) throw new Error('Playlist tidak ditemukan.');
      const songs = store.listPlaylistSongs(guildId, playlistId);
      await interaction.update({
        embeds: [buildPlaylistSongsEmbed(playlist, songs)],
        components: [createRemoveSongMenu(`library_playlist_remove_select:${playlistId}`, songs), playlistBackButtons(playlistId)],
      });
    } else if (customId.startsWith('library_playlist_delete:')) {
      store.deletePlaylist(guildId, validatePlaylistId(customId.split(':')[1]));
      await interaction.update(libraryHomePayload(store, guildId, userId));
    } else {
      return false;
    }
  } catch (error) {
    const payload = { content: `⚠️ ${friendlyError(error)}`, components: [] };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload).catch(() => {});
    else await interaction.update(payload).catch(() => {});
  }
  return true;
}

async function showLibraryCard(source, client, ephemeral) {
  const guildId = validateUserId(source.guildId);
  const userId = validateUserId(source.user?.id || source.author?.id);
  return reply(source, { ...libraryHomePayload(client.store, guildId, userId), ephemeral });
}

function libraryHomePayload(store, guildId, userId) {
  const liked = store.listLikedSongs(guildId);
  const playlists = store.listPlaylists(guildId);
  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎵 Music Library')
      .setDescription('Kelola liked songs dan shared playlist server dari card ini.')
      .addFields(
        { name: '❤️ Liked Songs', value: `${liked.length} lagu`, inline: true },
        { name: '🎶 Playlist', value: `${playlists.length} playlist`, inline: true },
      )],
    components: [libraryHomeButtons()],
  };
}

function libraryHomeButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('library_liked').setLabel('Liked Songs').setEmoji('❤️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('library_play_liked').setLabel('Play Liked').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('library_shuffle_liked').setLabel('Shuffle Liked').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('library_playlists').setLabel('Playlists').setEmoji('🎶').setStyle(ButtonStyle.Secondary),
  );
}

async function showLikedPanel(interaction, store, guildId) {
  const songs = store.listLikedSongs(guildId);
  await interaction.update({
    embeds: [buildLikedEmbed(songs)],
    components: [libraryLikedButtons(), libraryBackButtons()],
  });
}

function libraryLikedButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('library_play_liked').setLabel('Play').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('library_shuffle_liked').setLabel('Shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('library_liked_remove').setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  );
}

async function showPlaylistList(interaction, store, guildId) {
  const playlists = store.listPlaylists(guildId);
  await interaction.update({
    embeds: [buildPlaylistEmbed(playlists)],
    components: playlists.length
      ? [createLibraryPlaylistMenu(playlists), libraryBackButtons()]
      : [libraryBackButtons()],
  });
}

async function showPlaylistPanel(interaction, store, guildId, playlistId) {
  const id = validatePlaylistId(playlistId);
  const playlist = store.getPlaylist(guildId, id);
  if (!playlist) throw new Error('Playlist tidak ditemukan.');
  await interaction.update({
    embeds: [buildPlaylistSongsEmbed(playlist, store.listPlaylistSongs(guildId, id))],
    components: [playlistActionButtons(id), libraryBackButtons()],
  });
}

function createLibraryPlaylistMenu(playlists) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('library_playlist_select')
      .setPlaceholder('Pilih playlist')
      .addOptions(playlists.slice(0, 25).map((playlist) => ({
        label: `${playlist.name} (${playlist.songCount || 0})`.slice(0, 100),
        value: String(playlist.playlistId),
      }))),
  );
}

function createRemoveSongMenu(customId, songs) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Pilih lagu yang akan dihapus')
      .addOptions(songs.slice(0, 25).map((song, index) => ({
        label: getSongTitle(song).slice(0, 100),
        value: String(index),
      }))),
  );
}
function createLikedSongMenu(customId, songs) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder('Pilih liked song untuk ditambahkan')
      .addOptions(songs.slice(0, 25).map((song, index) => ({
        label: getSongTitle(song).slice(0, 100),
        value: String(index),
        description: `${song.likedBy?.length || 0} like`,
      }))),
  );
}

function playlistActionButtons(playlistId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`library_playlist_play:${playlistId}`).setLabel('Play').setEmoji('▶️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`library_playlist_shuffle:${playlistId}`).setLabel('Shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`library_playlist_add_liked:${playlistId}`).setLabel('Add Liked').setEmoji('❤️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`library_playlist_remove:${playlistId}`).setLabel('Remove').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`library_playlist_delete:${playlistId}`).setLabel('Delete').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
}

function libraryBackButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('library_home').setLabel('Library').setEmoji('📚').setStyle(ButtonStyle.Secondary),
  );
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
    .setDescription('Kelola shared playlist server ini')
    .addSubcommand((sub) => sub.setName('list').setDescription('Tampilkan shared playlist'))
    .addSubcommand((sub) => sub.setName('create').setDescription('Buat shared playlist baru').addStringOption((opt) => opt.setName('name').setDescription('Nama playlist').setRequired(true).setMaxLength(MAX_PLAYLIST_NAME)))
    .addSubcommand((sub) => sub.setName('add').setDescription('Tambahkan lagu aktif atau liked song').addIntegerOption((opt) => opt.setName('playlist_id').setDescription('ID playlist').setRequired(true).setMinValue(1)).addStringOption((opt) => opt.setName('song_key').setDescription('Opsional: URL atau kunci liked song')))
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
export const libraryCommand = {
  data: new SlashCommandBuilder().setName('library').setDescription('Buka shared music library server'),
  aliases: ['lib'],
  async executeSlash(interaction, client) {
    return showLibraryCard(interaction, client, true);
  },
  async executePrefix(message, _args, client) {
    return showLibraryCard(message, client, false);
  },
};

async function executeLike(source, client, ephemeral) {
  try {
    const userId = source.user?.id || source.author?.id;
    const displayName = source.user?.globalName || source.user?.username || source.author?.username || source.author?.tag;
    const result = await saveCurrentSongToLiked(client, source.guildId, userId, displayName);
    const content = result.liked
      ? `❤️ **${result.song.title}** ditambahkan ke liked songs.`
      : `💔 **${result.song.title}** dihapus dari liked songs.`;
    return reply(source, { content, ephemeral });
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function executeLikedAction(source, client, action, ephemeral, args = []) {
  const guildId = source.guildId;
  const userId = source.user?.id || source.author?.id;
  try {
    const store = client.store;
    if (!store) throw new Error('Penyimpanan musik belum tersedia.');
    const songs = store.listLikedSongs(validateUserId(guildId));
    if (action === 'remove') {
      const key = validateSongKey(args[0]);
      const removed = store.removeLikedSong(validateUserId(guildId), validateUserId(userId), key);
      return reply(source, { content: removed ? '✅ Like kamu dihapus.' : '❌ Like tidak ditemukan.', ephemeral });
    }
    if (action === 'play' || action === 'shuffle') {
      if (!songs.length) throw new Error('Liked songs di server ini masih kosong.');
      const selected = action === 'shuffle' ? shuffleSongs(songs) : songs;
      return playCollection(source, selected, client, ephemeral);
    }
    return reply(source, { embeds: [buildLikedEmbed(songs)], ephemeral });
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function executePlaylistAction(source, client, action, values, ephemeral) {
  const guildId = source.guildId;
  const userId = source.user?.id || source.author?.id;
  const displayName = source.user?.globalName || source.user?.username || source.author?.username || source.author?.tag;
  try {
    const store = client.store;
    if (!store) throw new Error('Penyimpanan musik belum tersedia.');
    if (action === 'create') {
      const name = validatePlaylistName(values.name);
      const playlist = store.createPlaylist(validateUserId(guildId), validateUserId(userId), name, validateDisplayName(displayName));
      return reply(source, { content: `✅ Playlist **${playlist.name}** dibuat oleh **${playlist.createdByName}** dengan ID \`${playlist.playlistId}\`.`, ephemeral });
    }
    if (action === 'list') return reply(source, { embeds: [buildPlaylistEmbed(store.listPlaylists(validateUserId(guildId)))], ephemeral });

    const playlistId = validatePlaylistId(values.playlistId);
    const playlist = store.getPlaylist(validateUserId(guildId), playlistId);
    if (!playlist) throw new Error('Playlist tidak ditemukan.');
    if (action === 'add') {
      let song;
      if (values.songKey) {
        const requestedKey = validateSongKey(values.songKey);
        const likedSong = store.listLikedSongs(validateUserId(guildId))
          .find((candidate) => candidate.songKey === requestedKey || candidate.url === requestedKey);
        if (!likedSong) throw new Error('Liked song tidak ditemukan di server ini.');
        song = store.addPlaylistSong(
          validateUserId(guildId),
          playlistId,
          normalizeSong(likedSong),
          validateUserId(userId),
          validateDisplayName(displayName),
        );
      } else {
        song = await saveCurrentSongToPlaylist(client, guildId, userId, playlistId, displayName);
      }
      return reply(source, { content: `✅ **${song.title}** ditambahkan oleh **${song.addedByName || displayName}**.`, ephemeral });
    }
    if (action === 'show') {
      return reply(source, { embeds: [buildPlaylistSongsEmbed(playlist, store.listPlaylistSongs(validateUserId(guildId), playlistId))], ephemeral });
    }
    if (action === 'delete') {
      const deleted = store.deletePlaylist(validateUserId(guildId), playlistId);
      return reply(source, { content: deleted ? '✅ Shared playlist dihapus.' : '❌ Playlist tidak ditemukan.', ephemeral });
    }
    if (action === 'remove') {
      const removed = store.removePlaylistSong(validateUserId(guildId), playlistId, validateSongKey(values.songKey));
      return reply(source, { content: removed ? '✅ Lagu dihapus dari shared playlist.' : '❌ Lagu tidak ditemukan di playlist.', ephemeral });
    }

    const songs = store.listPlaylistSongs(validateUserId(guildId), playlistId);
    if (!songs.length) throw new Error('Playlist ini masih kosong.');
    const selected = action === 'shuffle' ? shuffleSongs(songs) : songs;
    if (action !== 'play' && action !== 'shuffle') throw new Error('Aksi playlist tidak dikenal.');
    return playCollection(source, selected, client, ephemeral);
  } catch (error) {
    return reply(source, { content: `⚠️ ${friendlyError(error)}`, ephemeral: true });
  }
}

async function playCollection(source, songs, client, ephemeral) {
  const settings = client.store?.getGuildSettings?.(source.guildId);
  if (settings?.musicChannelId && settings.musicChannelId !== source.channelId) {
    throw new Error(`Server ini menetapkan channel musik khusus. Gunakan channel <#${settings.musicChannelId}>.`);
  }
  const voiceChannel = source.member?.voice?.channel;
  if (!voiceChannel) throw new Error('Kamu harus berada di dalam voice channel terlebih dahulu.');
  const botVoice = source.guild?.members?.me?.voice?.channel;
  if (botVoice && botVoice.id !== voiceChannel.id) throw new Error(`Kamu harus berada di voice channel yang sama dengan bot (<#${botVoice.id}>).`);

  const distube = getDisTube();
  if (!distube) throw new Error('Pemutar musik belum siap.');
  const textChannel = source.channel;
  const member = source.member;
  const loading = `🔍 Memproses ${songs.length} lagu dari shared library...`;
  const isInteraction = source.isChatInputCommand?.() || source.isButton?.();
  if (isInteraction) {
    if (!source.deferred && !source.replied) await source.deferReply({ ephemeral });
    await source.editReply({ content: loading });
    try {
      for (const song of songs) await distube.play(voiceChannel, song.url, { textChannel, member });
      applyGuildPlaybackSettings(distube, client, source.guildId);
      return source.editReply({ content: `✅ Menambahkan ${songs.length} lagu ke antrean.` });
    } catch (error) {
      return source.editReply({ content: `⚠️ Gagal memutar koleksi: ${friendlyError(error)}` });
    }
  }

  try {
    for (const song of songs) await distube.play(voiceChannel, song.url, { textChannel, member });
    applyGuildPlaybackSettings(distube, client, source.guildId);
    return source.reply({ content: `✅ Menambahkan ${songs.length} lagu ke antrean.` });
  } catch (error) {
    return source.reply({ content: `⚠️ Gagal memutar koleksi: ${friendlyError(error)}` });
  }
}
function applyGuildPlaybackSettings(distube, client, guildId) {
  const settings = client.store?.ensureGuildSettings?.(guildId);
  const queue = distube.getQueue(guildId);
  if (settings && queue?.setVolume) queue.setVolume(settings.defaultVolume);
}

async function resolveCurrentSong(guildId) {
  const song = getCurrentSong(guildId);
  if (!song) return null;
  await ensureSongMetadata(song);
  return song;
}

function buildLikedEmbed(songs) {
  const description = songs.length
    ? songs.map((song, index) => {
      const likedBy = song.likedBy?.map((liker) => liker.displayName).join(', ') || 'Tidak diketahui';
      return `\`${index + 1}.\` ${formatSongLink(song)} — ❤️ ${likedBy}`;
    }).join('\n')
    : '*Belum ada liked song di server ini.*';
  return new EmbedBuilder().setColor(0xED4245).setTitle('❤️ Liked Songs Server').setDescription(description.slice(0, 4096));
}

function buildPlaylistEmbed(playlists) {
  const description = playlists.length
    ? playlists.map((playlist) => `\`${playlist.playlistId ?? playlist.id}\` • **${playlist.name}** — ${playlist.songCount || 0} lagu (dibuat oleh ${playlist.createdByName || 'unknown'})`).join('\n')
    : '*Belum ada shared playlist.*';
  return new EmbedBuilder().setColor(0x5865F2).setTitle('🎶 Shared Playlists').setDescription(description.slice(0, 4096));
}

function buildPlaylistSongsEmbed(playlist, songs) {
  const description = songs.length
    ? songs.map((song, index) => `\`${index + 1}.\` ${formatSongLink(song)} — ditambahkan oleh ${song.addedByName || 'unknown'}`).join('\n')
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
function validateDisplayName(value) {
  const name = stringValue(value).replace(/\s+/g, ' ');
  if (!name || name.length > 200) throw new TypeError('Display name tidak valid.');
  return name;
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
