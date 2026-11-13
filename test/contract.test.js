import assert from 'node:assert/strict';
import test from 'node:test';
import { openStore } from '../core/storage/database.js';
import { createDashboardServer } from '../dashboard/server.js';
import { renderProfileCard } from '../features/general/profile-card.js';
import { autoplayCommand } from '../features/music/commands.js';
import { selectAutoplayRecommendation } from '../features/music/player.js';

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
