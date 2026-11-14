import { getDisTube, skipWithAutoplay, ensureSongMetadata } from './player.js';
import { clampVolume, formatRepeatMode, createNowPlayingEmbed, createPlayerButtons, formatSongLink, getSongTitle } from './ui.js';
import {
  createPlaylistSelectMenu,
  handlePlaylistSelect,
  saveCurrentSongToLiked,
} from './library.js';

export async function handleMusicButton(interaction, client) {
  if (interaction.isStringSelectMenu?.()) {
    return handlePlaylistSelect(interaction, client);
  }
  if (!interaction.isButton()) return false;
  const { customId, guildId, member } = interaction;
  if (!customId.startsWith('music_')) return false;

  const distube = getDisTube();
  const queue = distube?.getQueue(guildId);

  const memberVoice = member.voice?.channel;
  if (!memberVoice) {
    await interaction.reply({
      content: '❌ Kamu harus berada di dalam voice channel untuk memakai tombol kontrol musik!',
      ephemeral: true,
    });
    return true;
  }

  if (!queue) {
    await interaction.reply({
      content: '❌ Tidak ada musik yang sedang diputar saat ini!',
      ephemeral: true,
    });
    return true;
  }

  try {
    switch (customId) {
      case 'music_like': {
        const result = await saveCurrentSongToLiked(client, guildId, member.user.id);
        await interaction.reply({
          content: result.liked
            ? `❤️ **${result.song.title}** ditambahkan ke lagu yang disukai.`
            : `💔 **${result.song.title}** dihapus dari lagu yang disukai.`,
          ephemeral: true,
        });
        break;
      }

      case 'music_playlist': {
        const playlists = client.store?.listPlaylists?.(member.user.id) || [];
        if (!playlists.length) {
          await interaction.reply({
            content: '❌ Belum ada playlist. Buat playlist dengan `/playlist create` terlebih dahulu.',
            ephemeral: true,
          });
          break;
        }
        await interaction.reply({
          content: 'Pilih playlist untuk menyimpan lagu yang sedang diputar:',
          components: [createPlaylistSelectMenu(playlists)],
          ephemeral: true,
        });
        break;
      }

      case 'music_prev': {
        try {
          const song = await queue.previous();
          await ensureSongMetadata(song);
          await interaction.reply({
            content: `⏮️ **${member.user.username}** memutar kembali lagu sebelumnya: **${getSongTitle(song)}**`,
          });
        } catch (err) {
          await interaction.reply({
            content: '❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!',
            ephemeral: true,
          });
        }
        break;
      }

      case 'music_pause': {
        if (queue.paused) {
          queue.resume();
          await interaction.reply({
            content: `▶️ **${member.user.username}** melanjutkan pemutaran musik.`,
          });
        } else {
          queue.pause();
          await interaction.reply({
            content: `⏸️ **${member.user.username}** menjeda pemutaran musik.`,
          });
        }

        await refreshPlayerMessage(interaction, queue, client);
        break;
      }

      case 'music_skip': {
        await interaction.deferReply();
        try {
          const song = await queue.skip();
          await ensureSongMetadata(song);
          await interaction.editReply({
            content: `⏭️ **${member.user.username}** melewati lagu. Sekarang memutar: **${getSongTitle(song)}**`,
          });
        } catch (err) {
          if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
            await interaction.editReply({ content: '🔍 Mencari rekomendasi autoplay berikutnya...' });
            const song = await skipWithAutoplay(client, queue);
            if (song) {
              await interaction.editReply({
                content: `⏭️ **${member.user.username}** melewati lagu. Sekarang memutar: **${getSongTitle(song)}**`,
              });
            } else {
              await queue.stop();
              await interaction.editReply({
                content: `⏭️ **${member.user.username}** melewati lagu terakhir. Antrean selesai.`,
              });
            }
          } else {
            await interaction.editReply({
              content: `⚠️ Gagal melewati lagu: \`${err.message}\``,
            });
          }
        }
        break;
      }

      case 'music_shuffle': {
        if (queue.songs.length <= 1) {
          await interaction.reply({
            content: '❌ Tidak cukup lagu di antrean untuk diacak!',
            ephemeral: true,
          });
          return true;
        }

        await queue.shuffle();
        await interaction.reply({
          content: `🔀 **${member.user.username}** telah mengacak urutan playlist!`,
        });
        break;
      }

      case 'music_loop': {
        const nextMode = (queue.repeatMode + 1) % 3;
        queue.setRepeatMode(nextMode);

        await interaction.reply({
          content: `🔁 **${member.user.username}** mengubah mode repeat ke: **${formatRepeatMode(nextMode)}**`,
        });

        await refreshPlayerMessage(interaction, queue, client);
        break;
      }

      case 'music_volume_down':
      case 'music_volume_up': {
        const direction = customId === 'music_volume_up' ? 1 : -1;
        const volume = adjustVolume(queue.volume, direction);
        queue.setVolume(volume);
        await interaction.reply({
          content: `🔊 **${member.user.username}** mengubah volume ke **${volume}%**.`,
        });
        await refreshPlayerMessage(interaction, queue, client);
        break;
      }

      case 'music_autoplay': {
        const current = client.store?.ensureGuildSettings?.(guildId) || { autoplay: false };
        const enabled = !current.autoplay;
        const settings = client.store?.updateGuildSettings?.(
          guildId,
          { autoplay: enabled },
          member.user.id,
        ) || { ...current, autoplay: enabled };
        await interaction.reply({
          content: settings.autoplay
            ? '✅ Autoplay YouTube aktif. Bot akan melanjutkan dengan rekomendasi saat antrean habis.'
            : '⏹️ Autoplay YouTube nonaktif. Bot berhenti setelah antrean habis.',
        });
        await refreshPlayerMessage(interaction, queue, client);
        break;
      }

      case 'music_stop': {
        await queue.stop();
        await interaction.reply({
          content: `⏹️ **${member.user.username}** telah menghentikan pemutaran musik.`,
        });
        break;
      }

      case 'music_queue': {
        const currentSong = queue.songs[0];
        const upcomingSongs = queue.songs.slice(1, 6);

        let text = `**Sedang Diputar:** ${formatSongLink(currentSong)} (${currentSong.formattedDuration})\n\n`;
        if (upcomingSongs.length > 0) {
          text += '**Berikutnya:**\n' + upcomingSongs.map((s, i) => `${i + 1}. ${formatSongLink(s)}`).join('\n');
          if (queue.songs.length > 6) text += `\n*...dan ${queue.songs.length - 6} lagu lainnya.*`;
        } else {
          text += '*Tidak ada lagu lanjutan di antrean.*';
        }

        await interaction.reply({
          content: text,
          ephemeral: true,
        });
        break;
      }

      default:
        return false;
    }

    return true;
  } catch (error) {
    console.error('Error button handler:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: `⚠️ Terjadi kesalahan: \`${error.message}\``,
      }).catch(() => {});
    } else if (!interaction.replied) {
      await interaction.reply({
        content: `⚠️ Terjadi kesalahan: \`${error.message}\``,
        ephemeral: true,
      });
    }
    return true;
  }
}

export function adjustVolume(current, direction, step = 10) {
  const delta = direction >= 0 ? Math.abs(step) : -Math.abs(step);
  return clampVolume(clampVolume(current) + delta);
}

async function refreshPlayerMessage(interaction, queue, client) {
  if (!interaction.message || !queue?.songs?.[0]) return;

  await interaction.message.edit({
    embeds: [createNowPlayingEmbed(queue, queue.songs[0])],
    components: createPlayerButtons(queue, {
      autoplayEnabled: client?.store?.getGuildSettings?.(queue.id)?.autoplay === true,
    }),
  }).catch(() => {});
}
