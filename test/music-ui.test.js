import assert from 'node:assert/strict';
import test from 'node:test';
import { reactPending, settleReaction } from '../features/music/ui.js';

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
