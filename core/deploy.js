import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';

export async function deploy() {
  if (!config.token || !config.clientId) {
    console.error('❌ DISCORD_TOKEN dan CLIENT_ID harus diisi di file .env!');
    process.exit(1);
  }

  const commands = [];
  const featuresPath = path.resolve('features');

  if (fs.existsSync(featuresPath)) {
    const entries = fs.readdirSync(featuresPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(featuresPath, entry.name, 'index.js');
      if (!fs.existsSync(indexPath)) continue;

      try {
        const fileUrl = pathToFileURL(indexPath).href;
        const mod = await import(fileUrl);
        const feature = mod.default || mod;

        if (Array.isArray(feature.commands)) {
          for (const cmd of feature.commands) {
            if (cmd.data) {
              commands.push(cmd.data.toJSON());
            }
          }
        }
      } catch (err) {
        console.error(`Gagal membaca commands dari fitur [${entry.name}]:`, err);
      }
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
    console.error('❌ Gagal deploy slash commands:', error);
  }
}

// Auto deploy if executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy();
}
