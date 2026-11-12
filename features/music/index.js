import { initMusicPlayer } from './player.js';
import { handleMusicButton } from './interactions.js';
import {
  playCommand,
  skipCommand,
  prevCommand,
  queueCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  loopCommand,
  shuffleCommand,
  volumeCommand,
  nowPlayingCommand,
  diagnoseCommand,
} from './commands.js';
export default {
  name: 'Music',
  description: 'Pemutar musik YouTube performa tinggi berbasis Stream Mode FFmpeg',

  // Hook inisialisasi engine DisTube saat bot start
  async init(client) {
    await initMusicPlayer(client);
  },

  // Hook penanganan interaksi tombol (UI Buttons)
  async onInteraction(interaction) {
    return handleMusicButton(interaction);
  },

  // Daftar perintah
  commands: [
    playCommand,
    skipCommand,
    prevCommand,
    queueCommand,
    pauseCommand,
    resumeCommand,
    stopCommand,
    loopCommand,
    shuffleCommand,
    volumeCommand,
    nowPlayingCommand,
    diagnoseCommand,
  ],
};
