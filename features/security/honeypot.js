/**
 * Pure honeypot rules. No discord.js import so the decisions stay unit-testable.
 *
 * A honeypot channel is a normal, writable channel that nobody has a reason to
 * post in. Any message there marks the author as a scam bot, so the guard bans
 * them and lets Discord purge their recent history via `deleteMessageSeconds`.
 */

export const DEFAULT_DELETE_WINDOW_SECONDS = 24 * 60 * 60;
export const MAX_DELETE_WINDOW_SECONDS = 7 * 24 * 60 * 60;

/**
 * Guild owner, the bot itself, explicitly exempt users and members holding an
 * exempt role are never punished, otherwise staff mistakes become outages.
 */
export function isExemptAuthor({
  authorId,
  botUserId,
  guildOwnerId,
  memberRoleIds = [],
  exemptRoleIds = [],
  exemptUserIds = [],
}) {
  if (!authorId) return true;
  if (authorId === botUserId) return true;
  if (authorId === guildOwnerId) return true;
  if (exemptUserIds.includes(authorId)) return true;

  return memberRoleIds.some((roleId) => exemptRoleIds.includes(roleId));
}

/**
 * Ban payload. `deleteMessageSeconds` is what makes Discord delete every
 * message the offender sent in the guild inside the window (max 7 days).
 */
export function buildBanOptions({ windowSeconds, reason } = {}) {
  const requested = Number(windowSeconds);
  const seconds = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 0), MAX_DELETE_WINDOW_SECONDS)
    : DEFAULT_DELETE_WINDOW_SECONDS;

  return { deleteMessageSeconds: seconds, reason };
}

/**
 * Kick cannot delete history, so the guard scans channels and must decide which
 * fetched message belongs to the offender and falls inside the purge window.
 */
export function isPurgeableMessage({ authorId, userId, createdAtMs, cutoffMs }) {
  if (authorId !== userId) return false;
  if (!Number.isFinite(createdAtMs)) return false;
  return createdAtMs >= cutoffMs;
}

export function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} menit`;
  if (minutes === 0) return `${hours} jam`;
  return `${hours} jam ${minutes} menit`;
}
