const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  ActivityType,
} = require('discord.js');
const config = require('./config');
const { setupPlayer } = require('./player');
const { handleButtonInteraction } = require('./ui/buttonHandler');

// Inisialisasi Discord Client dengan Intent yang dibutuhkan
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Setup command collections
client.commands = new Collection();
client.aliases = new Collection();

// Memuat semua commands dari direktori ./commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (command.data && command.data.name) {
    client.commands.set(command.data.name, command);

    // Registrasi aliases jika ada
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        client.aliases.set(alias, command);
      }
    }
  }
}

// Setup audio stream engine DisTube dengan YouTube Plugin
const distube = setupPlayer(client);

// Event saat bot siap (Ready)
client.once('ready', () => {
  console.log(`🤖 Logged in sebagai ${client.user.tag}!`);
  console.log(`📡 Prefix teks: ${config.prefix} (Contoh: ${config.prefix}play judul lagu)`);
  console.log(`⚡ Slash command: /play, /skip, /prev, /queue, dll.`);

  // Set status aktivitas bot
  client.user.setPresence({
    activities: [
      {
        name: `${config.prefix}play | /play YouTube 🎵`,
        type: ActivityType.Listening,
      },
    ],
    status: 'online',
  });
});

// Event Handler untuk Interaction (Slash Commands & UI Buttons)
client.on('interactionCreate', async (interaction) => {
  // Tangani interaksi tombol pemutar
  if (interaction.isButton()) {
    const handled = await handleButtonInteraction(interaction, distube);
    if (handled) return;
  }

  // Tangani slash commands
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command || !command.executeSlash) return;

  try {
    await command.executeSlash(interaction, distube);
  } catch (error) {
    console.error(`Error saat mengeksekusi slash command /${interaction.commandName}:`, error);
    const replyPayload = {
      content: '⚠️ Terjadi kesalahan saat menjalankan perintah ini.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyPayload).catch(() => {});
    } else {
      await interaction.reply(replyPayload).catch(() => {});
    }
  }
});

// Event Handler untuk Pesan Prefix (Teks)
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  if (!commandName) return;

  const command = client.commands.get(commandName) || client.aliases.get(commandName);
  if (!command || !command.executePrefix) return;

  try {
    await command.executePrefix(message, args, distube);
  } catch (error) {
    console.error(`Error saat mengeksekusi prefix command ${config.prefix}${commandName}:`, error);
    message.reply('⚠️ Terjadi kesalahan saat menjalankan perintah tersebut.').catch(() => {});
  }
});

// Tangani Unhandled Rejections & Exceptions agar bot tetap stabil
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Jalankan Bot
if (!config.token) {
  console.warn('⚠️ Token bot belum dikonfigurasi di file .env!');
  console.warn('Silakan salin .env.example menjadi .env dan masukkan DISCORD_TOKEN kamu.');
} else {
  client.login(config.token).catch((err) => {
    console.error('❌ Gagal login ke Discord:', err.message);
  });
}
