import { pingCommand, helpCommand, statsCommand, profileCommand } from './commands.js';

export default {
  name: 'General',
  description: 'Fitur dasar utilitas dan panduan bot',
  commands: [pingCommand, helpCommand, statsCommand, profileCommand],
};
