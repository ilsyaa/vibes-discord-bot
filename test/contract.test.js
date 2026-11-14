import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { openStore } from '../core/storage/database.js';
import { createDashboardServer } from '../dashboard/server.js';
import { renderProfileCard } from '../features/general/profile-card.js';
import { autoplayCommand } from '../features/music/commands.js';
import { adjustVolume } from '../features/music/interactions.js';
import {
  selectAutoplayRecommendation,
  startPoTokenProvider,
  warmYoutubePipeline,
  hydrateSongMetadata,
} from '../features/music/player.js';
import {
  clampVolume,
  createPlayerButtons,
  createNowPlayingEmbed,
  formatSongLink,
  getSongTitle,
} from '../features/music/ui.js';

import { ProxyPool } from '../core/proxy-pool.js';
import { createStreamRelay } from '../core/stream-relay.js';
import {
  createPlaylistSelectMenu,
  likeCommand,
  likedCommand,
  normalizeSong,
  playlistCommand,
} from '../features/music/library.js';


test('empty YouTube song names recover from fetched metadata', () => {
  const song = {
    name: '',
    url: 'https://www.youtube.com/watch?v=video-id',
  };

  hydrateSongMetadata(song, { videoDetails: { title: 'Recovered title' } });

  assert.equal(getSongTitle(song), 'Recovered title');
  assert.match(
    createNowPlayingEmbed(
      { paused: false, repeatMode: 0, volume: 50, songs: [song] },
      song,
    ).toJSON().description,
    /\[Recovered title\]\(https:\/\/www\.youtube\.com\/watch\?v=video-id\)/u,
  );
});

test('song links escape markdown delimiters', () => {
  assert.equal(
    formatSongLink({
      name: 'A [B] \\ C',
      url: 'https://youtube.example/video',
    }),
    '[A \\[B\\] \\\\ C](https://youtube.example/video)',
  );
});

test('profile activity persists, ranks, and rolls back invalid settings', () => {
  const store = openStore(':memory:', { defaultVolume: 80 });
  assert.deepEqual(store.ensureGuildSettings('guild-a').defaultVolume, 80);

  store.recordUserActivity('user-a', 'guild-a', 'User A', 'commands', 2);
  store.recordUserActivity('user-b', 'guild-a', 'User B', 'plays', 3);
  store.recordUserTrack({
    userId: 'user-a',
    guildId: 'guild-a',
    displayName: 'User A',
    title: 'Track A',
    url: 'https://youtube.example/track-a',
    durationSeconds: 120,
  });

  const profile = store.getUserProfile('user-a', [{ id: 'guild-a', name: 'Vibes' }]);
  assert.equal(profile.summary.commands, 2);
  assert.equal(profile.summary.plays, 1);
  assert.equal(profile.topFriends[0].name, 'User B');
  assert.equal(profile.topTracks[0].title, 'Track A');

  assert.throws(() => store.updateGuildSettings('rollback', { defaultVolume: -1 }));
  assert.equal(store.getGuildSettings('rollback'), null);
  store.close();
});

test('personal liked songs and playlists persist with owner isolation', () => {
  const store = openStore(':memory:');
  const songA = {
    songKey: 'video-a',
    url: 'https://youtube.example/a',
    title: 'Track A',
    durationSeconds: 120,
    thumbnail: '',
    uploader: 'Artist A',
  };
  const songB = { ...songA, songKey: 'video-b', url: 'https://youtube.example/b', title: 'Track B' };

  assert.equal(store.toggleLikedSong('user-a', songA).liked, true);
  assert.deepEqual(store.listLikedSongs('user-a'), [songA]);
  assert.equal(store.toggleLikedSong('user-a', songA).liked, false);
  assert.deepEqual(store.listLikedSongs('user-a'), []);

  const playlist = store.createPlaylist('user-a', 'Favorites');
  assert.equal(store.addPlaylistSong('user-a', playlist.playlistId, songA).title, 'Track A');
  assert.equal(store.addPlaylistSong('user-a', playlist.playlistId, songB).title, 'Track B');
  assert.equal(store.addPlaylistSong('user-a', playlist.playlistId, songA).title, 'Track A');
  assert.deepEqual(store.listPlaylistSongs('user-a', playlist.playlistId), [songA, songB]);
  assert.deepEqual(store.listPlaylistSongs('user-b', playlist.playlistId), []);
  assert.equal(store.removePlaylistSong('user-a', playlist.playlistId, 'video-a'), true);
  assert.deepEqual(store.listPlaylistSongs('user-a', playlist.playlistId), [songB]);
  assert.equal(store.deletePlaylist('user-b', playlist.playlistId), false);
  assert.equal(store.deletePlaylist('user-a', playlist.playlistId), true);
  assert.equal(store.getPlaylist('user-a', playlist.playlistId), null);
  store.close();
});

test('dashboard binds OAuth callback to the initiating browser', async () => {
  const store = openStore(':memory:');
  const config = {
    dashboardPublicUrl: 'http://127.0.0.1:8787',
    dashboardClientId: 'client-id',
    dashboardClientSecret: 'client-secret',
    dashboardSessionSecret: 'session-secret',
  };
  const server = createDashboardServer({
    config,
    store,
    client: { isReady: () => false, guilds: { cache: new Map() } },
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const login = await fetch(`http://127.0.0.1:${port}/auth/login`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.match(login.headers.get('set-cookie') || '', /vibes_oauth_state=/u);

  const state = new URL(login.headers.get('location')).searchParams.get('state');
  const callback = await fetch(
    `http://127.0.0.1:${port}/auth/callback?state=${state}&code=invalid`,
    { redirect: 'manual' },
  );
  assert.equal(callback.status, 400);

  await new Promise((resolve) => server.close(resolve));
  store.close();
});

test('profile card renders a PNG', async () => {
  const image = await renderProfileCard({
    displayName: 'User A',
    profile: {
      summary: { plays: 1, commands: 2, servers: 1 },
      topServers: [{ name: 'Vibes', plays: 1, commands: 2 }],
      topFriends: [],
      topTracks: [{ title: 'Track A', plays: 1, durationSeconds: 120 }],
    },
  });

  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('autoplay command persists an explicit opt-in', async () => {
  let settings = { autoplay: false };
  const store = {
    ensureGuildSettings() {
      return settings;
    },
    updateGuildSettings(guildId, patch, actorId) {
      settings = { ...settings, ...patch, guildId, actorId };
      return settings;
    },
  };
  const replies = [];
  const message = {
    guildId: 'guild-a',
    author: { id: 'user-a' },
    reply(value) {
      replies.push(value);
      return Promise.resolve(value);
    },
  };

  await autoplayCommand.executePrefix(message, ['on'], { store });
  assert.equal(settings.autoplay, true);
  assert.match(replies[0], /aktif/u);
});

test('autoplay recommendation skips live, long, and already played tracks', () => {
  const recommendation = selectAutoplayRecommendation(
    [
      { id: 'current', url: 'https://youtube.example/current', duration: 180, isLive: false },
      { id: 'live', url: 'https://youtube.example/live', duration: 180, isLive: true },
      { id: 'long', url: 'https://youtube.example/long', duration: 3600, isLive: false },
      { id: 'next', url: 'https://youtube.example/next', duration: 210, isLive: false },
    ],
    {
      songs: [{ id: 'current' }],
      previousSongs: [{ id: 'played-before' }],
    },
  );
  assert.equal(recommendation.id, 'next');
});

test('player controls expose autoplay and bounded volume buttons', () => {
  const rows = createPlayerButtons(
    { paused: false, volume: 50, previousSongs: [], songs: [{}] },
    { autoplayEnabled: true },
  );
  const buttons = rows.flatMap((row) => row.toJSON().components);
  assert.deepEqual(buttons.map((button) => button.custom_id), [
    'music_prev',
    'music_pause',
    'music_skip',
    'music_shuffle',
    'music_stop',
    'music_loop',
    'music_volume_down',
    'music_autoplay',
    'music_volume_up',
    'music_queue',
    'music_like',
    'music_playlist',
  ]);
  assert.equal(buttons.find((button) => button.custom_id === 'music_autoplay').label, 'Auto: On');
  assert.equal(buttons.find((button) => button.custom_id === 'music_skip').disabled, false);
  assert.equal(buttons.find((button) => button.custom_id === 'music_volume_down').disabled, false);
  assert.equal(clampVolume(-10), 0);
  assert.equal(clampVolume(150), 100);
  assert.equal(adjustVolume(0, -1), 0);
  assert.equal(adjustVolume(100, 1), 100);
  assert.equal(adjustVolume(50, 1), 60);
});
test('personal music commands and save menu expose the library UX', () => {
  assert.equal(likeCommand.data.name, 'like');
  assert.equal(likedCommand.data.name, 'liked');
  assert.equal(playlistCommand.data.name, 'playlist');
  assert.equal(normalizeSong({
    id: 'video-a',
    url: 'https://youtube.example/a',
    name: 'Track A',
    duration: 60,
  }).songKey, 'https://youtube.example/a');
  const menu = createPlaylistSelectMenu([{ playlistId: 1, name: 'Favorites', songCount: 2 }]).toJSON();
  assert.equal(menu.components[0].custom_id, 'music_playlist_select');
  assert.equal(menu.components[0].options[0].value, '1');
});


test('po token provider retries then gives up without blocking startup', async () => {
  let calls = 0;
  const provider = await startPoTokenProvider(async () => {}, {
    attempts: 4,
    delays: [0],
    create: async () => {
      calls += 1;
      if (calls < 3) throw new Error('PO token minting failed');
      return { dispose: async () => {} };
    },
  });
  assert.equal(calls, 3);
  assert.equal(typeof provider.dispose, 'function');

  let failures = 0;
  const unavailable = await startPoTokenProvider(async () => {}, {
    attempts: 2,
    delays: [0],
    create: async () => {
      failures += 1;
      throw new Error('PO token minting failed');
    },
  });
  assert.equal(unavailable, null);
  assert.equal(failures, 2);
});

test('warm-up falls through to the next seed video', async () => {
  const seen = [];
  const youtubePlugin = {
    ytdl: {
      async getInfo(url) {
        seen.push(url);
        if (seen.length === 1) throw new Error('probe failed');
        return { videoDetails: { id: 'second' } };
      },
    },
  };
  assert.equal(await warmYoutubePipeline(youtubePlugin, { ids: ['first', 'second'] }), true);
  assert.deepEqual(seen, [
    'https://www.youtube.com/watch?v=first',
    'https://www.youtube.com/watch?v=second',
  ]);

  const failing = { ytdl: { async getInfo() { throw new Error('down'); } } };
  assert.equal(await warmYoutubePipeline(failing, { ids: ['only'] }), false);
});

test('proxy pool rotates leases and applies cooldown after each response', async () => {
  let now = 0;
  const used = [];
  const pool = new ProxyPool({
    proxies: ['192.0.2.10:8000:user:pass', '192.0.2.11:8000:user:pass'],
    cooldownMs: 1_000,
    failureCooldownMs: 5_000,
    now: () => now,
    agentFactory: (uri) => ({ uri, close: async () => {} }),
    fetch: async (_input, init) => {
      used.push(new URL(init.dispatcher.uri).hostname);
      return new Response('ok');
    },
  });

  await (await pool.fetch('https://youtube.example/player')).text();
  await (await pool.fetch('https://youtube.example/player')).text();
  assert.deepEqual(used, ['192.0.2.10', '192.0.2.11']);
  assert.equal(pool.snapshot().coolingDown, 2);

  now = 1_000;
  await (await pool.fetch('https://youtube.example/player')).text();
  assert.equal(used[2], '192.0.2.10');
  await pool.close();
});

test('proxy sessions pin one lease across media range requests', async () => {
  let now = 0;
  const used = [];
  const pool = new ProxyPool({
    proxies: ['192.0.2.20:8000:user:pass', '192.0.2.21:8000:user:pass'],
    cooldownMs: 1_000,
    failureCooldownMs: 5_000,
    now: () => now,
    agentFactory: (uri) => ({ uri, close: async () => {} }),
    fetch: async (_input, init) => {
      used.push(new URL(init.dispatcher.uri).hostname);
      return new Response('range');
    },
  });

  const session = await pool.createSession();
  await (await session.fetch('https://youtube.example/media')).text();
  await (await session.fetch('https://youtube.example/media')).text();
  assert.deepEqual(used, ['192.0.2.20', '192.0.2.20']);
  await session.close();
  assert.equal(pool.snapshot().coolingDown, 1);
  await pool.close();
});

test('proxy pool applies the failure cooldown to blocked responses', async () => {
  const pool = new ProxyPool({
    proxies: ['192.0.2.12:8000:user:pass'],
    cooldownMs: 1_000,
    failureCooldownMs: 5_000,
    agentFactory: (uri) => ({ uri, close: async () => {} }),
    fetch: async () => new Response('blocked', { status: 403 }),
  });

  await (await pool.fetch('https://youtube.example/player')).text();
  assert.deepEqual(pool.snapshot(), {
    total: 1,
    available: 0,
    busy: 0,
    coolingDown: 1,
    failures: 1,
  });
  await pool.close();
});

test('proxy pool releases a failed response when its body is cancelled', async () => {
  const pool = new ProxyPool({
    proxies: ['192.0.2.13:8000:user:pass'],
    cooldownMs: 1_000,
    failureCooldownMs: 5_000,
    agentFactory: (uri) => ({ uri, close: async () => {} }),
    fetch: async () => new Response('blocked', { status: 403 }),
  });

  const response = await pool.fetch('https://youtube.example/oembed');
  await response.body.cancel();

  assert.deepEqual(pool.snapshot(), {
    total: 1,
    available: 0,
    busy: 0,
    coolingDown: 1,
    failures: 1,
  });
  await pool.close();
});

test('stream relay serves one local URL from a fresh source stream', async () => {
  const relay = await createStreamRelay({
    ttlMs: 1_000,
    createStream: async () => Readable.from(['relay-ok']),
  });
  try {
    const response = await fetch(relay.register('video-source'));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'relay-ok');
  } finally {
    await relay.close();
  }
});
