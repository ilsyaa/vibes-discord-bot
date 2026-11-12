const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

async function deployCommands() {
  if (!config.token || !config.clientId) {
    console.error('❌ DISCORD_TOKEN dan CLIENT_ID harus diisi di file .env terlebih dahulu!');
    process.exit(1);
  }

  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
    }
  }

  const rest = new REST({ version: '10' }).setToken(config.token);

  try {
    console.log(`🚀 Mendaftarkan ${commands.length} slash commands ke Discord...`);

    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );

    console.log(`✅ Berhasil mendaftarkan ${data.length} slash commands secara global!`);
  } catch (error) {
    console.error('❌ Gagal mendaftarkan slash commands:', error);
  }
}

if (require.main === module) {
  deployCommands();
}

module.exports = { deployCommands };
