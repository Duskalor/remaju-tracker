import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const DB_PATH = './data/remates.db';

function testDb() {
  console.log('\n🗄️  DB Inspector');
  console.log('━'.repeat(40));

  if (!existsSync(DB_PATH)) {
    console.log('❌ Archivo no encontrado:', DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Tablas existentes
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  console.log('Tablas:', tables.map(t => t.name).join(', ') || 'ninguna');

  // Count
  const countRow = db.prepare('SELECT COUNT(*) as count FROM remates').get() as { count: number };
  const total = countRow?.count ?? 0;
  console.log(`Registros: ${total}`);

  if (total > 0) {
    // Muestra los últimos 3
    const rows = db.prepare(`
      SELECT expediente, tipo_remate, fecha_remate, estado, scraped_at
      FROM remates ORDER BY scraped_at DESC LIMIT 3
    `).all() as Array<{ expediente: string; tipo_remate: string; fecha_remate: string; estado: string; scraped_at: string }>;
    console.log('\nÚltimos 3 registros:');
    for (const row of rows) {
      console.log('  ', row);
    }
  }

  db.close();
  console.log('');
}

testDb();
