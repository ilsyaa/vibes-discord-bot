import { pingCommand, helpCommand, statsCommand } from './commands.js';

export default {
  name: 'General',
  description: 'Fitur dasar utilitas dan panduan bot',
  commands: [pingCommand, helpCommand, statsCommand],
};
