import assert from 'node:assert/strict';
import test from 'node:test';
import { formatTime, renderNowPlayingCard } from '../features/music/now-playing-card.js';

const queue = { paused: false, volume: 55, repeatMode: 1, songs: [{}, {}, {}], currentTime: 42 };
const song = { name: 'Lagu pendek', uploader: { name: 'Channel' }, duration: 200, user: { username: 'ilsyaa' } };

function dimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('latin1'), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('now-playing card menghasilkan PNG dengan lebar tetap', async () => {
  const buffer = await renderNowPlayingCard(queue, song);
  const { width } = dimensions(buffer);
  assert.equal(width, 900);
  assert.ok(buffer.length > 1_000);
});

test('now-playing card menambah tinggi saat judul wrap dua baris', async () => {
  const shortCard = dimensions(await renderNowPlayingCard(queue, song)).height;
  const longCard = dimensions(await renderNowPlayingCard(queue, {
    ...song,
    name: 'Judul lagu yang sangat panjang sampai harus dibungkus ke baris kedua dan tetap tidak terpotong di tengah kata',
  })).height;

  assert.ok(longCard > shortCard, `tinggi ${longCard} harus lebih besar dari ${shortCard}`);
});

test('now-playing card merender judul ekstrem tanpa melempar error', async () => {
  const buffer = await renderNowPlayingCard(queue, {
    ...song,
    name: 'x'.repeat(400),
    uploader: null,
    duration: 0,
    user: null,
  });

  assert.equal(dimensions(buffer).width, 900);
});

test('formatTime memformat detik menjadi menit dan jam', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(65), '1:05');
  assert.equal(formatTime(3_661), '1:01:01');
  assert.equal(formatTime(Number.NaN), '0:00');
});
