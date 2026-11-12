import {
  Client,
  Collection,
  GatewayIntentBits,
  ActivityType,
} from 'discord.js';
import { config } from './config.js';
import { loadFeatures } from './loader.js';
import { initLogger } from './logger.js';
import { openStore } from './storage/database.js';
import { startDashboard } from '../dashboard/server.js';

// Inisialisasi logger file per session (hanya mencatat error)
const logFile = initLogger();
console.log(`📁 Error log session: ${logFile}`);

// Setup client dengan intents lengkap untuk slash, prefix, dan voice
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Registry Command, Aliases, dan Interaction Handlers
export let store = null;
client.commands = new Collection();
client.aliases = new Collection();
client.interactionHandlers = [];
client.store = null;

// Event Ready
client.once('ready', () => {
  console.log(`🤖 Logged in sebagai ${client.user.tag}!`);
  console.log(`📡 Prefix teks: ${config.prefix} (Contoh: ${config.prefix}play atau ${config.prefix}help)`);
  console.log(`⚡ Slash commands aktif (/play, /queue, /ping, dll.)`);

  client.user.setPresence({
    activities: [
      {
        name: `${config.prefix}help | /help 🤖`,
        type: ActivityType.Listening,
      },
    ],
    status: 'online',
  });
});

// Event Interaction (Slash Commands, Buttons, Select Menus)
client.on('interactionCreate', async (interaction) => {
  // 1. Delegasi ke feature interaction handlers (misal tombol musik)
  for (const handler of client.interactionHandlers) {
    try {
      const handled = await handler(interaction, client);
      if (handled) return;
    } catch (err) {
      console.error('Error pada custom interaction handler:', err);
    }
  }

  // 2. Chat Input / Slash Command handling
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command || !command.executeSlash) return;

  client.store?.recordMetric(interaction.guildId, 'commands');

  try {
    await command.executeSlash(interaction, client);
  } catch (error) {
    console.error(`Error saat menjalankan slash command /${interaction.commandName}:`, error);
    const errMessage = {
      content: '⚠️ Terjadi kesalahan saat memproses perintah ini.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMessage).catch(() => {});
    } else {
      await interaction.reply(errMessage).catch(() => {});
    }
  }
});

// Event Message (Prefix Commands)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName) || client.aliases.get(commandName);
  if (!command || !command.executePrefix) return;

  client.store?.recordMetric(message.guildId, 'commands');

  try {
    await command.executePrefix(message, args, client);
  } catch (error) {
    console.error(`Error saat menjalankan command prefix ${config.prefix}${commandName}:`, error);
    message.reply('⚠️ Terjadi kesalahan saat menjalankan perintah tersebut.').catch(() => {});
  }
});

// Global Process Handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Initialize & Boot
export async function start() {
  store = openStore(config.databasePath);
  client.store = store;

  const dashboardServer = config.dashboardEnabled
    ? await startDashboard({ client, store, config })
    : null;

  const shutdown = async () => {
    await closeServer(dashboardServer);
    store?.close();
    client.destroy();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await loadFeatures(client);

  if (!config.token) {
    console.warn('⚠️ DISCORD_TOKEN belum diatur di file .env!');
    console.warn('Isi DISCORD_TOKEN di .env untuk menghubungkan bot ke Discord.');
    return;
  }

  await client.login(config.token);
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}
