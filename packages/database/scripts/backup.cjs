/**
 * Backup the SQLite database before destructive operations (db:push, db:generate).
 *
 * Creates a timestamped copy in data/backups/ so you never lose data again.
 */
const { copyFileSync, existsSync, mkdirSync } = require('fs');
const { resolve, dirname } = require('path');

const DB_PATH = resolve(__dirname, '..', '..', '..', 'data', 'remates.db');
const BACKUP_DIR = resolve(dirname(DB_PATH), 'backups');

if (!existsSync(DB_PATH)) {
  console.log('ℹ️  No database found, skipping backup.');
  process.exit(0);
}

if (!existsSync(BACKUP_DIR)) {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .slice(0, 19);

const backupPath = resolve(BACKUP_DIR, `remates-${timestamp}.db`);

try {
  copyFileSync(DB_PATH, backupPath);
  console.log(`✅ Database backed up → data/backups/remates-${timestamp}.db`);
} catch (err) {
  console.error(`❌ Backup failed: ${err.message}`);
  process.exit(1);
}
