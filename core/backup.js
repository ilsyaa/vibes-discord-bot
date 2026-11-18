import fs from 'node:fs';
import path from 'node:path';
import { backup, Database } from 'node:sqlite';
import { config } from './config.js';

export async function backupDatabase({
  sourcePath = config.databasePath,
  backupDir = config.databaseBackupDir,
  retention = config.databaseBackupRetention,
} = {}) {
  if (!sourcePath || sourcePath === ':memory:') {
    throw new Error('DATABASE_PATH must point to a file for backups.');
  }
  if (!Number.isInteger(retention) || retention < 1) {
    throw new Error('DATABASE_BACKUP_RETENTION must be a positive integer.');
  }

  const resolvedSource = path.resolve(sourcePath);
  const resolvedBackupDir = path.resolve(backupDir);
  fs.mkdirSync(resolvedBackupDir, { recursive: true, mode: 0o700 });

  const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const backupPath = path.join(resolvedBackupDir, `vibes-${timestamp}.sqlite`);
  const temporaryPath = `${backupPath}.tmp-${process.pid}`;
  const source = new Database(resolvedSource, {
    readOnly: true,
    timeout: 5000,
    defensive: true,
  });

  try {
    await backup(source, temporaryPath, { rate: 100 });
    const check = new Database(temporaryPath, { readOnly: true, defensive: true });
    try {
      const result = check.prepare('PRAGMA integrity_check').get();
      if (result.integrity_check !== 'ok') throw new Error(`Backup integrity check failed: ${result.integrity_check}`);
    } finally {
      check.close();
    }
    fs.renameSync(temporaryPath, backupPath);
    fs.chmodSync(backupPath, 0o600);
  } finally {
    source.close();
    for (const suffix of ['', '-wal', '-shm']) {
      const temporaryArtifact = `${temporaryPath}${suffix}`;
      if (fs.existsSync(temporaryArtifact)) fs.rmSync(temporaryArtifact, { force: true });
    }
  }

  const backups = fs.readdirSync(resolvedBackupDir)
    .filter((name) => /^vibes-.*\.sqlite$/u.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(retention)) {
    fs.rmSync(path.join(resolvedBackupDir, name), { force: true });
  }

  return { path: backupPath, retained: Math.min(backups.length, retention) };
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  backupDatabase()
    .then(({ path: backupPath, retained }) => {
      console.log(`✅ Database backup created: ${backupPath}`);
      console.log(`🗄️ Retained backups: ${retained}`);
    })
    .catch((error) => {
      console.error(`❌ Database backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}
