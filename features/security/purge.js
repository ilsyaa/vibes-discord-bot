import { ChannelType, PermissionsBitField } from 'discord.js';
import { isPurgeableMessage } from './honeypot.js';

const PURGEABLE_CHANNEL_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const PAGE_SIZE = 100;
const BULK_DELETE_LIMIT = 100;

const REQUIRED_PERMISSIONS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.ReadMessageHistory,
  PermissionsBitField.Flags.ManageMessages,
];

/**
 * Delete every message from `userId` newer than `cutoffMs` across the guild.
 *
 * Needed because the kick endpoint has no `delete_message_seconds` equivalent;
 * Discord only offers history wiping as part of a ban. Channels the bot cannot
 * read are skipped, so the ban path stays the stronger option.
 */
export async function purgeUserMessages({ guild, userId, cutoffMs, botMember }) {
  const summary = { channelsScanned: 0, channelsSkipped: 0, deleted: 0, failures: 0 };
  const me = botMember ?? guild.members.me;

  const channels = [...(guild.channels.cache?.values() ?? [])].filter((channel) => {
    if (!PURGEABLE_CHANNEL_TYPES.has(channel.type)) return false;
    const permissions = channel.permissionsFor?.(me);
    return Boolean(permissions?.has(REQUIRED_PERMISSIONS));
  });
  summary.channelsSkipped = (guild.channels.cache?.size ?? 0) - channels.length;

  for (const channel of channels) {
    summary.channelsScanned += 1;
    try {
      const ids = await collectMessageIds({ channel, userId, cutoffMs });
      summary.deleted += await deleteMessages(channel, ids);
    } catch {
      summary.failures += 1;
    }
  }

  return summary;
}

async function collectMessageIds({ channel, userId, cutoffMs }) {
  const ids = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: PAGE_SIZE, ...(before ? { before } : {}) });
    if (batch.size === 0) break;

    let reachedOlderMessages = false;
    for (const message of batch.values()) {
      if (isPurgeableMessage({
        authorId: message.author?.id,
        userId,
        createdAtMs: message.createdTimestamp,
        cutoffMs,
      })) {
        ids.push(message.id);
      } else if (message.author?.id === userId) {
        // Messages arrive newest-first, so the first hit outside the window ends the scan.
        reachedOlderMessages = true;
      }
    }

    if (reachedOlderMessages || batch.size < PAGE_SIZE) break;
    before = batch.last()?.id;
    if (!before) break;
  }

  return ids;
}

async function deleteMessages(channel, ids) {
  let deleted = 0;

  for (let index = 0; index < ids.length; index += BULK_DELETE_LIMIT) {
    const chunk = ids.slice(index, index + BULK_DELETE_LIMIT);
    if (chunk.length === 1) {
      await channel.messages.delete(chunk[0]);
      deleted += 1;
      continue;
    }

    const removed = await channel.bulkDelete(chunk, true);
    deleted += removed.size;
  }

  return deleted;
}
