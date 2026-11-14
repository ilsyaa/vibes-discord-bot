import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config, validateRuntimeConfig } from './config.js';

export async function deploy() {
  validateRuntimeConfig({ requireClientId: true });

  const featuresPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../features');
  if (!fs.existsSync(featuresPath)) {
    throw new Error(`Feature directory tidak ditemukan: ${featuresPath}`);
  }

  const commands = [];
  const entries = fs.readdirSync(featuresPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const indexPath = path.join(featuresPath, entry.name, 'index.js');
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Feature [${entry.name}] tidak memiliki index.js`);
    }

    const feature = (await import(pathToFileURL(indexPath).href)).default;
    if (!feature || !Array.isArray(feature.commands)) continue;

    for (const command of feature.commands) {
      if (!command?.data?.name || typeof command.data.toJSON !== 'function') {
        throw new Error(`Command tidak valid pada feature [${entry.name}]`);
      }
      commands.push(command.data.toJSON());
    }
  }

  const commandNames = commands.map((command) => command.name);
  const duplicateNames = commandNames.filter((name, index) => commandNames.indexOf(name) !== index);
  if (commands.length === 0) throw new Error('Tidak ada slash command yang ditemukan; deploy dibatalkan.');
  if (duplicateNames.length > 0) {
    throw new Error(`Nama slash command duplikat: ${[...new Set(duplicateNames)].join(', ')}`);
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const guildId = process.env.GUILD_ID;

  if (guildId) {
    console.log(`🚀 Mendaftarkan ${commands.length} slash commands ke GUILD (${guildId}) [Instan]...`);
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, guildId),
      { body: commands },
    );
    console.log(`✅ Berhasil mendaftarkan ${data.length} slash commands ke server target!`);
    return;
  }

  console.log(`🚀 Mendaftarkan ${commands.length} slash commands secara GLOBAL...`);
  const data = await rest.put(
    Routes.applicationCommands(config.clientId),
    { body: commands },
  );
  console.log(`✅ Berhasil mendaftarkan ${data.length} slash commands secara global!`);
  console.log('💡 Tip: Pendaftaran global butuh waktu sinkronisasi cache Discord. Gunakan GUILD_ID di .env agar muncul instan saat development.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch((error) => {
    console.error('❌ Gagal deploy slash commands:', error);
    process.exitCode = 1;
  });
}
