import { config } from '../../core/config.js';
import { logError } from '../../core/logger.js';
import { buildBanOptions, formatDuration, isExemptAuthor } from './honeypot.js';
import { purgeUserMessages } from './purge.js';

const pendingBans = new Set();

export default {
  name: 'Security',
  description: 'Honeypot: pesan di channel jebakan otomatis memicu ban/kick dan purge riwayat',
  init(client) {
    if (config.honeypotChannelIds.length === 0) {
      console.log('🛡️ Fitur Security dimuat, tetapi HONEYPOT_CHANNEL_IDS belum diisi.');
      return;
    }

    console.log(
      `🛡️ Honeypot aktif di ${config.honeypotChannelIds.length} channel (purge ${formatDuration(
        config.honeypotDeleteWindowSeconds,
      )}).`,
    );

    client.on('messageCreate', (message) => {
      void handleHoneypotMessage(message, client);
    });
  },
};

/**
 * Ban anyone who writes in a honeypot channel and let Discord delete their
 * messages inside the configured window. Exposed for manual testing.
 */
export async function handleHoneypotMessage(message, client) {
  if (!message.inGuild()) return;
  if (message.author?.id === client.user?.id) return;
  if (!config.honeypotChannelIds.includes(message.channelId)) return;

  const guild = message.guild;
  const authorId = message.author.id;
  if (pendingBans.has(authorId)) return;

  // Roles on message.member can be an empty cache without the GuildMembers
  // intent, so fetch the member over REST before trusting role exemptions.
  const member =
    (await guild.members.fetch({ user: authorId, force: true }).catch(() => null)) ?? message.member ?? null;
  const exempt = isExemptAuthor({
    authorId,
    botUserId: client.user?.id,
    guildOwnerId: guild.ownerId,
    memberRoleIds: member ? [...member.roles.cache.keys()] : [],
    exemptRoleIds: config.honeypotExemptRoleIds,
    exemptUserIds: config.honeypotExemptUserIds,
  });
  if (exempt) return;

  pendingBans.add(authorId);
  const mention = `<@${authorId}>`;
  const window = formatDuration(config.honeypotDeleteWindowSeconds);

  try {
    // Clear the trap channel immediately; the rest is handled per action.
    await message.delete().catch(() => {});

    if (message.webhookId) {
      await report(
        client,
        `Pesan webhook di <#${message.channelId}> dihapus. Webhook tidak bisa diban, periksa integrasi webhook server.`,
      );
      return;
    }

    const reason = `Honeypot: mengirim pesan di #${message.channel?.name ?? message.channelId}`;

    if (config.honeypotAction === 'kick') {
      await punishByKick({ guild, authorId, reason, mention, window, client });
    } else if (config.honeypotAction === 'ban-kick') {
      await punishByBanKick({ guild, authorId, reason, mention, window, client });
    } else {
      await guild.bans.create(
        authorId,
        buildBanOptions({ windowSeconds: config.honeypotDeleteWindowSeconds, reason }),
      );
      await report(client, `${mention} diban otomatis dari **${guild.name}** dan pesan ${window} terakhir dihapus.`);
    }
  } catch (error) {
    logError(error, 'honeypot');
    await report(client, `Gagal memproses ${mention} setelah memicu honeypot: ${error.message}`);
  } finally {
    pendingBans.delete(authorId);
  }
}

const UNBAN_DELAY_MS = 1_500;

/**
 * Ban-unban combo: the ban call makes Discord delete the offender's recent
 * messages server-side (kick has no such option), then the member is unbanned.
 */
async function punishByBanKick({ guild, authorId, reason, mention, window, client }) {
  await guild.bans.create(authorId, buildBanOptions({ windowSeconds: config.honeypotDeleteWindowSeconds, reason }));

  await new Promise((resolve) => setTimeout(resolve, UNBAN_DELAY_MS));

  try {
    await guild.bans.remove(authorId, `${reason} (auto-unban)`);
    await report(
      client,
      `${mention} diban sementara lalu di-unban dari **${guild.name}** dan pesan ${window} terakhir dihapus.`,
    );
  } catch (error) {
    logError(error, 'honeypot-unban');
    await report(
      client,
      `${mention} TETAP TERBAN di **${guild.name}** karena unban gagal: ${error.message}. Pesan ${window} terakhir sudah dihapus.`,
    );
  }
}

async function punishByKick({ guild, authorId, reason, mention, window, client }) {
  let kickError = null;
  try {
    await guild.members.kick(authorId, reason);
  } catch (error) {
    kickError = error;
    logError(error, 'honeypot-kick');
  }

  const summary = await purgeUserMessages({
    guild,
    userId: authorId,
    cutoffMs: Date.now() - config.honeypotDeleteWindowSeconds * 1_000,
  });

  const purgeInfo =
    `${summary.deleted} pesan (${window} terakhir) dihapus dari ${summary.channelsScanned} channel` +
    (summary.failures > 0 ? `, ${summary.failures} channel gagal diproses.` : '.');
  const kickInfo = kickError ? `Kick ${mention} gagal (${kickError.message}).` : `${mention} di-kick dari **${guild.name}**.`;

  await report(client, `${kickInfo} ${purgeInfo}`);
  return summary;
}

async function report(client, content) {
  console.log(`🛡️ ${content}`);

  const channelId = config.honeypotLogChannelId;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send({ content, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    logError(error, 'honeypot-log');
  }
}
