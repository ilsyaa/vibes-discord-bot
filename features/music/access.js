import { PermissionFlagsBits } from 'discord.js';

export function voiceControlError(member, queue) {
  const memberVoice = member?.voice?.channel;
  if (!memberVoice) return '❌ Kamu harus berada di dalam voice channel untuk mengontrol musik!';
  if (queue?.voiceChannel?.id && memberVoice.id !== queue.voiceChannel.id) {
    return `❌ Kamu harus berada di voice channel yang sama dengan bot (<#${queue.voiceChannel.id}>)!`;
  }
  return null;
}

export function canManageMusicSettings(member, settings) {
  if (member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  try {
    if ((BigInt(member?.permissions || 0) & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild) {
      return true;
    }
  } catch {}
  const roleId = settings?.controlRoleId;
  if (!roleId) return false;
  if (member?.roles?.cache?.has?.(roleId)) return true;
  return Array.isArray(member?.roles) && member.roles.includes(roleId);
}
