const { createNowPlayingEmbed, createPlayerButtons, formatRepeatMode } = require('./playerEmbed');

async function handleButtonInteraction(interaction, distube) {
  if (!interaction.isButton()) return false;

  const { customId, guildId, member } = interaction;
  if (!customId.startsWith('btn_')) return false;

  const queue = distube.getQueue(guildId);

  // Check voice channel membership
  const memberVoice = member.voice?.channel;
  if (!memberVoice) {
    await interaction.reply({
      content: '❌ Kamu harus berada di dalam voice channel untuk menggunakan tombol kontrol!',
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
      case 'btn_prev': {
        try {
          const song = await queue.previous();
          await interaction.reply({
            content: `⏮️ **${member.user.username}** memutar kembali lagu sebelumnya: **${song.name}**`,
          });
        } catch (err) {
          await interaction.reply({
            content: '❌ Tidak ada lagu sebelumnya dalam riwayat pemutaran!',
            ephemeral: true,
          });
        }
        break;
      }

      case 'btn_pause': {
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

        // Update original player message embed & buttons if possible
        if (interaction.message && queue.songs[0]) {
          await interaction.message.edit({
            embeds: [createNowPlayingEmbed(queue, queue.songs[0])],
            components: createPlayerButtons(queue),
          }).catch(() => {});
        }
        break;
      }

      case 'btn_skip': {
        try {
          const song = await queue.skip();
          await interaction.reply({
            content: `⏭️ **${member.user.username}** melewati lagu. Sekarang memutar: **${song.name}**`,
          });
        } catch (err) {
          if (err.errorCode === 'NO_UP_NEXT' || err.message.includes('NO_UP_NEXT')) {
            await queue.stop();
            await interaction.reply({
              content: `⏭️ **${member.user.username}** melewati lagu terakhir. Antrean selesai.`,
            });
          } else {
            await interaction.reply({
              content: `⚠️ Gagal melewati lagu: \`${err.message}\``,
              ephemeral: true,
            });
          }
        }
        break;
      }

      case 'btn_shuffle': {
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

      case 'btn_loop': {
        const nextMode = (queue.repeatMode + 1) % 3;
        queue.setRepeatMode(nextMode);

        await interaction.reply({
          content: `🔁 **${member.user.username}** mengubah mode repeat ke: **${formatRepeatMode(nextMode)}**`,
        });

        if (interaction.message && queue.songs[0]) {
          await interaction.message.edit({
            embeds: [createNowPlayingEmbed(queue, queue.songs[0])],
            components: createPlayerButtons(queue),
          }).catch(() => {});
        }
        break;
      }

      case 'btn_stop': {
        await queue.stop();
        await interaction.reply({
          content: `⏹️ **${member.user.username}** telah menghentikan pemutaran musik.`,
        });
        break;
      }

      case 'btn_queue': {
        const currentSong = queue.songs[0];
        const upcomingSongs = queue.songs.slice(1, 6); // Preview top 5

        let text = `**Sedang Diputar:** [${currentSong.name}](${currentSong.url}) (${currentSong.formattedDuration})\n\n`;
        if (upcomingSongs.length > 0) {
          text += '**Berikutnya:**\n' + upcomingSongs.map((s, i) => `${i + 1}. [${s.name}](${s.url})`).join('\n');
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
    console.error('Error saat menangani button interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `⚠️ Terjadi kesalahan saat memproses tombol: \`${error.message}\``,
        ephemeral: true,
      });
    }
    return true;
  }
}

module.exports = { handleButtonInteraction };
