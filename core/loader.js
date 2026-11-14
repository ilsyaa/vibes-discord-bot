import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Scan and load all modules under features/ directory.
 * Each feature directory can export:
 * - commands: array of command objects { data, aliases?, executeSlash?, executePrefix? }
 * - onInteraction: async function(interaction, client) => boolean (handled or not)
 * - init: async function(client) => void (setup listeners, players, cron, etc)
 */
export async function loadFeatures(client) {
  const featuresPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../features');
  if (!fs.existsSync(featuresPath)) {
    return;
  }

  const entries = fs.readdirSync(featuresPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const featureDir = path.join(featuresPath, entry.name);
    const featureIndexPath = path.join(featureDir, 'index.js');

    if (!fs.existsSync(featureIndexPath)) continue;

    try {
      const fileUrl = pathToFileURL(featureIndexPath).href;
      const featureModule = await import(fileUrl);
      const feature = featureModule.default || featureModule;

      console.log(`📦 Memuat fitur: [${feature.name || entry.name}]`);

      if (typeof feature.init === 'function') {
        await feature.init(client);
      }

      if (typeof feature.onInteraction === 'function') {
        client.interactionHandlers.push(feature.onInteraction);
      }

      if (Array.isArray(feature.commands)) {
        for (const cmd of feature.commands) {
          if (!cmd.data || !cmd.data.name) continue;

          client.commands.set(cmd.data.name, cmd);

          if (Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) {
              client.aliases.set(alias, cmd);
            }
          }
        }
      }
    } catch (err) {
      console.error(`❌ Gagal memuat fitur [${entry.name}]:`, err);
      throw err;
    }
  }
}
