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
  autoplayCommand,
  diagnoseCommand,
} from './commands.js';
export default {
  name: 'Music',
  description: 'Pemutar musik YouTube performa tinggi berbasis Stream Mode FFmpeg',

  async init(client) {
    await initMusicPlayer(client);
  },

  async onInteraction(interaction, client) {
    return handleMusicButton(interaction, client);
  },

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
    autoplayCommand,
    diagnoseCommand,
  ],
};
