import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

let errorLogStream = null;
let currentLogFilePath = null;

/**
 * Inisialisasi file error log untuk sesi eksekusi saat ini.
 * Format: logs/errors-YYYY-MM-DD-HH-mm-ss.log dan symlink / copy ke logs/latest-error.log
 */
export function initLogger() {
  const logsDir = path.resolve('logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  currentLogFilePath = path.join(logsDir, `errors-${timestamp}.log`);
  errorLogStream = fs.createWriteStream(currentLogFilePath, { flags: 'a' });

  // Tulis header session
  const header = `=== SESSION ERROR LOG STARTED AT ${now.toISOString()} ===\n\n`;
  errorLogStream.write(header);

  // Hook console.error agar tetap tampil di terminal DAN tercatat ke file log sesi
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // 1. Tampilkan tetap di terminal
    originalConsoleError(...args);

    // 2. Format & tulis hanya ke error log
    if (errorLogStream) {
      const time = new Date().toISOString();
      const message = util.format(...args);
      errorLogStream.write(`[${time}] [ERROR] ${message}\n`);
    }
  };

  // Pastikan stream ditutup rapi saat exit
  process.on('exit', () => {
    if (errorLogStream) {
      errorLogStream.write(`\n=== SESSION CLOSED AT ${new Date().toISOString()} ===\n`);
      errorLogStream.end();
    }
  });

  return currentLogFilePath;
}

export function logError(error, context = '') {
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error(error);
  }
}
