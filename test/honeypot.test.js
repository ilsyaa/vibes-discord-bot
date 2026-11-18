import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DELETE_WINDOW_SECONDS,
  MAX_DELETE_WINDOW_SECONDS,
  buildBanOptions,
  formatDuration,
  isExemptAuthor,
  isPurgeableMessage,
} from '../features/security/honeypot.js';
import { parseAction, parseIdList } from '../core/config.js';

test('parseIdList menerima daftar dipisah koma/spasi dan menolak sampah', () => {
  assert.deepEqual(parseIdList('123456789012345678, 987654321098765432', 'HONEYPOT_CHANNEL_IDS'), [
    '123456789012345678',
    '987654321098765432',
  ]);
  assert.deepEqual(parseIdList('', 'HONEYPOT_CHANNEL_IDS'), []);
  assert.deepEqual(parseIdList(undefined, 'HONEYPOT_CHANNEL_IDS'), []);
  assert.throws(
    () => parseIdList('123456789012345678, not-an-id', 'HONEYPOT_CHANNEL_IDS'),
    /HONEYPOT_CHANNEL_IDS.*not-an-id/u,
  );
});

test('buildBanOptions memakai default 24 jam dan membawa alasan ban', () => {
  assert.deepEqual(buildBanOptions({ reason: 'honeypot' }), {
    deleteMessageSeconds: DEFAULT_DELETE_WINDOW_SECONDS,
    reason: 'honeypot',
  });
});

test('buildBanOptions membatasi window ke rentang 0..7 hari', () => {
  assert.equal(buildBanOptions({ windowSeconds: 999_999 }).deleteMessageSeconds, MAX_DELETE_WINDOW_SECONDS);
  assert.equal(buildBanOptions({ windowSeconds: -5 }).deleteMessageSeconds, 0);
  assert.equal(buildBanOptions({ windowSeconds: 3_600.9 }).deleteMessageSeconds, 3_600);
  assert.equal(buildBanOptions({ windowSeconds: Number.NaN }).deleteMessageSeconds, DEFAULT_DELETE_WINDOW_SECONDS);
});

test('isExemptAuthor melindungi owner, bot sendiri, role dan user pengecualian', () => {
  const base = {
    botUserId: '111111111111111111',
    guildOwnerId: '222222222222222222',
    exemptRoleIds: ['333333333333333333'],
    exemptUserIds: ['444444444444444444'],
  };

  assert.equal(isExemptAuthor({ ...base, authorId: base.botUserId }), true);
  assert.equal(isExemptAuthor({ ...base, authorId: base.guildOwnerId }), true);
  assert.equal(isExemptAuthor({ ...base, authorId: '444444444444444444' }), true);
  assert.equal(
    isExemptAuthor({ ...base, authorId: '555555555555555555', memberRoleIds: ['333333333333333333'] }),
    true,
  );
  assert.equal(
    isExemptAuthor({ ...base, authorId: '555555555555555555', memberRoleIds: ['999999999999999999'] }),
    false,
  );
  assert.equal(isExemptAuthor({ ...base, authorId: '' }), true);
});

test('isExemptAuthor mendukung banyak role pengecualian sekaligus', () => {
  const exemptRoleIds = ['111111111111111111', '222222222222222222', '333333333333333333'];

  assert.equal(
    isExemptAuthor({
      authorId: '999999999999999999',
      exemptRoleIds,
      memberRoleIds: ['444444444444444444', '333333333333333333'],
    }),
    true,
  );
  assert.equal(
    isExemptAuthor({
      authorId: '999999999999999999',
      exemptRoleIds,
      memberRoleIds: ['444444444444444444', '555555555555555555'],
    }),
    false,
  );
  assert.equal(isExemptAuthor({ authorId: '999999999999999999', exemptRoleIds, memberRoleIds: [] }), false);
});

test('formatDuration menghasilkan label waktu yang dipakai log', () => {
  assert.equal(formatDuration(86_400), '24 jam');
  assert.equal(formatDuration(5_400), '1 jam 30 menit');
  assert.equal(formatDuration(600), '10 menit');
  assert.equal(formatDuration(0), '0 menit');
});

test('parseAction hanya menerima ban, kick, atau ban-kick', () => {
  assert.equal(parseAction(undefined), 'ban');
  assert.equal(parseAction(''), 'ban');
  assert.equal(parseAction('KICK'), 'kick');
  assert.equal(parseAction(' ban '), 'ban');
  assert.equal(parseAction('Ban-Kick'), 'ban-kick');
  assert.throws(() => parseAction('timeout'), /HONEYPOT_ACTION/u);
  assert.throws(() => parseAction('banunban'), /HONEYPOT_ACTION/u);
});

test('isPurgeableMessage menyaring penulis dan batas waktu', () => {
  const cutoffMs = 1_000_000;

  assert.equal(isPurgeableMessage({ authorId: '42', userId: '42', createdAtMs: cutoffMs, cutoffMs }), true);
  assert.equal(isPurgeableMessage({ authorId: '42', userId: '42', createdAtMs: cutoffMs + 1, cutoffMs }), true);
  assert.equal(isPurgeableMessage({ authorId: '42', userId: '42', createdAtMs: cutoffMs - 1, cutoffMs }), false);
  assert.equal(isPurgeableMessage({ authorId: '7', userId: '42', createdAtMs: cutoffMs + 1, cutoffMs }), false);
  assert.equal(isPurgeableMessage({ authorId: '42', userId: '42', createdAtMs: Number.NaN, cutoffMs }), false);
});
