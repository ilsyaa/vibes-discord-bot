import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

let errorLogStream = null;
let currentLogFilePath = null;

/**
 * Initializes one timestamped error log for the current process session.
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

  const header = `=== SESSION ERROR LOG STARTED AT ${now.toISOString()} ===\n\n`;
  errorLogStream.write(header);

  const originalConsoleError = console.error;
  errorLogStream.on('error', (error) => {
    originalConsoleError('Error log stream failed:', error);
  });
  console.error = (...args) => {
    const message = redactMessage(util.format(...args));
    originalConsoleError(message);
    if (errorLogStream) {
      const time = new Date().toISOString();
      errorLogStream.write(`[${time}] [ERROR] ${message}\n`);
    }
  };

  process.on('exit', () => {
    if (errorLogStream) {
      errorLogStream.write(`\n=== SESSION CLOSED AT ${new Date().toISOString()} ===\n`);
      errorLogStream.end();
    }
  });

  return currentLogFilePath;
}

function redactMessage(message) {
  return message
    .replace(/("(?:access_token|refresh_token|client_secret|authorization|cookie|token|secret|code)"\s*:\s*)"[^"]*"/giu, '$1"[REDACTED]"')
    .replace(/((?:authorization|cookie|token|secret|code)(?:=|:\s+))([^\s,;&]+)/giu, '$1[REDACTED]');
}

export function logError(error, context = '') {
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error(error);
  }
}
