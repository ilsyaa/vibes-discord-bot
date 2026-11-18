import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProfileCard } from '../features/general/profile-card.js';

function dimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const fullProfile = {
  summary: { plays: 128, commands: 342, servers: 3 },
  topServers: [
    { name: 'Vibes', plays: 90, commands: 210 },
    { name: 'Lofi Corner', plays: 25, commands: 80 },
    { name: 'Study Hall', plays: 13, commands: 52 },
  ],
  topFriends: [
    { name: 'ilsyaa', plays: 42 },
    { name: 'pajarori', plays: 28 },
  ],
  topTracks: [
    { title: 'Knightica', plays: 12, durationSeconds: 128 },
    { title: 'Lofi Hip Hop Radio', plays: 6, durationSeconds: 9_000 },
    { title: 'Never Gonna Give You Up', plays: 3, durationSeconds: 213 },
  ],
};

test('profile card menghasilkan PNG dengan lebar tetap', async () => {
  const card = dimensions(await renderProfileCard({ displayName: 'User A', profile: fullProfile }));
  assert.equal(card.width, 900);
});

test('profile card menyesuaikan tinggi dengan jumlah baris', async () => {
  const empty = dimensions(await renderProfileCard({ displayName: 'User A', profile: null })).height;
  const full = dimensions(await renderProfileCard({ displayName: 'User A', profile: fullProfile })).height;

  assert.ok(full > empty, `tinggi profil penuh ${full} harus lebih besar dari ${empty}`);
});

test('profile card tahan data rusak dan nama sangat panjang', async () => {
  const card = dimensions(await renderProfileCard({
    displayName: 'N'.repeat(200),
    profile: {
      summary: { plays: Number.NaN, commands: undefined, servers: null },
      topServers: [{ name: '', plays: 0, commands: 0 }],
      topFriends: [{ name: 'x'.repeat(120), plays: 1 }],
      topTracks: [{ title: 'y'.repeat(300), plays: 2, durationSeconds: 0 }],
    },
  }));

  assert.equal(card.width, 900);
  assert.ok(card.height > 0);
});
