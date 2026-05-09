import Database from 'better-sqlite3';

const DB_PATH = './data/remates.db';

function row(label: string, value: string | number, pad = 28) {
  console.log(`  ${label.padEnd(pad)}: ${value}`);
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(36 - title.length)}`);
}

function report() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const qAll = <T>(sql: string) => db.prepare(sql).all() as T[];
  const qGet = <T>(sql: string) => db.prepare(sql).get() as T | undefined;
  const pluck = (sql: string) => db.prepare(sql).pluck().get() as unknown;

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║         REMAJU — Reporte DB          ║');
  console.log('╚══════════════════════════════════════╝');

  // Totales
  section('Totales');
  const total = pluck('SELECT COUNT(*) FROM remates') as number ?? 0;
  const conFecha = pluck("SELECT COUNT(*) FROM remates WHERE fecha_remate IS NOT NULL AND fecha_remate != ''") as number ?? 0;
  const sinFecha = pluck("SELECT COUNT(*) FROM remates WHERE fecha_remate IS NULL OR fecha_remate = ''") as number ?? 0;
  const ultimo = pluck('SELECT MAX(scraped_at) FROM remates') as string ?? '—';

  row('Total remates', total);
  row('Con fecha', conFecha);
  row('Sin fecha', sinFecha);
  row('Último scrapeado', String(ultimo));

  // Por estado
  section('Por Estado');
  const estados = qAll<{ estado: string; n: number }>(
    `SELECT COALESCE(estado, 'Sin estado') as estado, COUNT(*) as n
     FROM remates GROUP BY estado ORDER BY n DESC LIMIT 10`
  );
  for (const { estado, n } of estados) {
    row(estado, n);
  }

  // Por tipo de remate
  section('Por Tipo de Remate');
  const tipos = qAll<{ tipo: string; n: number }>(
    `SELECT COALESCE(tipo_remate, 'Sin tipo') as tipo, COUNT(*) as n
     FROM remates GROUP BY tipo ORDER BY n DESC LIMIT 10`
  );
  for (const { tipo, n } of tipos) {
    row(tipo, n);
  }

  // Top juzgados
  section('Top 10 Juzgados');
  const juzgados = qAll<{ juzgado: string; n: number }>(
    `SELECT COALESCE(juzgado, 'Sin juzgado') as juzgado, COUNT(*) as n
     FROM remates GROUP BY juzgado ORDER BY n DESC LIMIT 10`
  );
  for (const { juzgado, n } of juzgados) {
    const label = String(juzgado).substring(0, 36);
    row(label, n);
  }

  // Próximos remates (fecha futura)
  section('Próximos Remates');
  const proximos = qAll<{ expediente: string; fecha_remate: string; tipo_remate: string; estado: string }>(
    `SELECT expediente, fecha_remate, tipo_remate, estado
     FROM remates
     WHERE fecha_remate >= date('now')
     ORDER BY fecha_remate ASC LIMIT 5`
  );
  if (proximos?.length) {
    for (const { expediente, fecha_remate, tipo_remate, estado } of proximos) {
      console.log(`  ${fecha_remate}  ${String(expediente).padEnd(20)} ${tipo_remate ?? ''} [${estado ?? ''}]`);
    }
  } else {
    console.log('  Sin remates futuros detectados');
  }

  console.log('\n' + '═'.repeat(40) + '\n');
  db.close();
}

report();
