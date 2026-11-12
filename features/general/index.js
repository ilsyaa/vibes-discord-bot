import { pingCommand, helpCommand } from './commands.js';

export default {
  name: 'General',
  description: 'Fitur dasar utilitas dan panduan bot',
  commands: [pingCommand, helpCommand],
};
