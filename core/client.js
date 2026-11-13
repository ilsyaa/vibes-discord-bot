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

const logFile = initLogger();
console.log(`📁 Error log session: ${logFile}`);

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export let store = null;
client.commands = new Collection();
client.aliases = new Collection();
client.interactionHandlers = [];
client.store = null;

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

client.on('interactionCreate', async (interaction) => {
  for (const handler of client.interactionHandlers) {
    try {
      const handled = await handler(interaction, client);
      if (handled) return;
    } catch (err) {
      console.error('Error pada custom interaction handler:', err);
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command || !command.executeSlash) return;

  recordCommandActivity(interaction.user, interaction.guildId);

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

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift()?.toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName) || client.aliases.get(commandName);
  if (!command || !command.executePrefix) return;

  recordCommandActivity(message.author, message.guildId);

  try {
    await command.executePrefix(message, args, client);
  } catch (error) {
    console.error(`Error saat menjalankan command prefix ${config.prefix}${commandName}:`, error);
    message.reply('⚠️ Terjadi kesalahan saat menjalankan perintah tersebut.').catch(() => {});
  }
});

let dashboardServer = null;
let shutdownPromise = null;

process.on('unhandledRejection', (reason) => {
  void handleFatalError(reason);
});

process.on('uncaughtException', (error) => {
  void handleFatalError(error);
});

async function handleFatalError(error) {
  console.error('Fatal process error:', error);
  try {
    await shutdown();
  } finally {
    process.exitCode = 1;
    process.exit();
  }
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await closeServer(dashboardServer);
    dashboardServer = null;
    store?.close();
    store = null;
    client.store = null;
    client.destroy();
  })();
  return shutdownPromise;
}

function recordCommandActivity(user, guildId) {
  if (!guildId || !user?.id || !store) return;

  try {
    store.withTransaction(() => {
      store.recordMetric(guildId, 'commands');
      store.recordUserActivity(
        user.id,
        guildId,
        user.globalName || user.username || user.tag || 'Listener',
        'commands',
      );
    });
  } catch (error) {
    console.error('Command activity metric failed:', error.message);
  }
}

export async function start() {
  store = openStore(config.databasePath, { defaultVolume: config.defaultVolume });
  client.store = store;

  dashboardServer = config.dashboardEnabled
    ? await startDashboard({ client, store, config })
    : null;

  const handleSignal = async () => {
    await shutdown();
    process.exitCode = 0;
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  await loadFeatures(client);

  if (!config.token) {
    console.warn('⚠️ DISCORD_TOKEN belum diatur di file .env!');
    console.warn('Isi DISCORD_TOKEN di .env untuk menghubungkan bot ke Discord.');
    await shutdown();
    return;
  }

  await client.login(config.token);
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}
