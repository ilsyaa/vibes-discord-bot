import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nowPlayingContent,
  nowPlayingFileName,
  reactPending,
  settleReaction,
  shouldAutoRefreshPanel,
} from '../features/music/ui.js';

function fakeMessage() {
  const added = [];
  const removed = [];
  return {
    client: { user: { id: 'bot-1' } },
    added,
    removed,
    async react(emoji) {
      added.push(emoji);
      return { users: { remove: async (id) => removed.push([emoji, id]) } };
    },
  };
}

test('play menandai pesan dengan jam lalu menggantinya dengan centang', async () => {
  const message = fakeMessage();
  const pending = await reactPending(message);
  await settleReaction(message, pending, '✅');

  assert.deepEqual(message.added, ['⏳', '✅']);
  assert.deepEqual(message.removed, [['⏳', 'bot-1']]);
});

test('kegagalan mengganti penanda dengan silang tanpa melempar error', async () => {
  const message = fakeMessage();
  const pending = await reactPending(message);
  await settleReaction(message, pending, '❌');

  assert.deepEqual(message.added, ['⏳', '❌']);
});

test('settleReaction tetap jalan bila reaction awal gagal dipasang', async () => {
  const message = { client: { user: { id: 'bot-1' } }, added: [], async react(emoji) { this.added.push(emoji); } };

  await settleReaction(message, null, '❌');

  assert.deepEqual(message.added, ['❌']);
});

test('reactPending mengembalikan null saat bot tidak punya izin reaction', async () => {
  const message = { react: async () => { throw new Error('Missing Permissions'); } };

  assert.equal(await reactPending(message), null);
});

test('panel hanya auto-refresh saat lagu benar-benar berjalan', () => {
  const playing = { paused: false, songs: [{}], _lastPlayerMessage: {} };

  assert.equal(shouldAutoRefreshPanel(playing), true);
  assert.equal(shouldAutoRefreshPanel({ ...playing, paused: true }), false);
  assert.equal(shouldAutoRefreshPanel({ ...playing, songs: [] }), false);
  assert.equal(shouldAutoRefreshPanel({ ...playing, _lastPlayerMessage: null }), false);
  assert.equal(shouldAutoRefreshPanel(null), false);
});

test('konten panel membawa judul dan artist untuk notifikasi', () => {
  assert.equal(
    nowPlayingContent({ name: 'Lofi Hip Hop Radio', uploader: { name: 'Lofi Girl' } }),
    '**Lofi Hip Hop Radio** — Lofi Girl',
  );
  assert.equal(nowPlayingContent({ name: 'Tanpa artist' }), '**Tanpa artist**');
});

test('konten panel menetralkan markdown pada judul', () => {
  const content = nowPlayingContent({ name: 'Promo *GRATIS* @everyone', uploader: { name: 'Scam' } });

  assert.equal(content, '**Promo \\*GRATIS\\* @everyone** — Scam');
  assert.ok(!content.includes('**Promo *GRATIS*'), 'asterisk judul harus di-escape');
});

test('nama file panel mengikuti judul lagu', () => {
  assert.equal(nowPlayingFileName({ name: 'Lofi Hip Hop Radio - 24/7' }), 'lofi-hip-hop-radio-24-7.png');
  assert.equal(nowPlayingFileName({ name: '   ' }), 'now-playing.png');
  assert.equal(nowPlayingFileName({ name: 'Café del Mar' }), 'cafe-del-mar.png');
  assert.ok(nowPlayingFileName({ name: 'x'.repeat(120) }).length <= 64);
});
