import { Cron } from 'croner';
import { scrapeListing } from './listing/scrape-listing';
import { scrapeDetail } from './detail/scrape-detail';

async function runOnce(mode: string): Promise<void> {
  console.log(`[main] Ejecutando una sola vez: ${mode}`);

  switch (mode) {
    case 'listing':
      await scrapeListing();
      break;
    case 'detail':
      await scrapeDetail();
      break;
    case 'all':
      await scrapeListing();
      await scrapeDetail();
      break;
    default:
      console.error(`[main] Modo desconocido: ${mode}`);
      console.error('       Válidos: listing, detail, all');
      process.exit(1);
  }

  console.log('[main] Run-once completado, saliendo');
  process.exit(0);
}

function startCronJobs(): void {
  const tz = 'America/Lima';

  new Cron('0 3 * * *', { timezone: tz, name: 'listing' }, async () => {
    console.log('[cron:listing] Iniciando');
    try {
      await scrapeListing();
      console.log('[cron:listing] OK');
    } catch (err) {
      console.error('[cron:listing] FALLÓ:', err);
    }
  });

  new Cron('30 3 * * *', { timezone: tz, name: 'detail' }, async () => {
    console.log('[cron:detail] Iniciando');
    try {
      await scrapeDetail();
      console.log('[cron:detail] OK');
    } catch (err) {
      console.error('[cron:detail] FALLÓ:', err);
    }
  });

  console.log('[main] 2 cron jobs programados (timezone: America/Lima)');
  console.log('       listing → 3:00 AM');
  console.log('       detail  → 3:30 AM');
}

async function bootstrap(): Promise<void> {
  const mode = process.argv[2];

  if (mode === 'run-once') {
    const target = process.argv[3];
    if (!target) {
      console.error('[main] Falta especificar qué correr: listing | detail | all');
      process.exit(1);
    }
    await runOnce(target);
    return;
  }

  console.log('[main] Iniciando servicio de scraping...');
  startCronJobs();

  process.on('SIGINT', () => {
    console.log('\n[main] SIGINT recibido, cerrando');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log('[main] SIGTERM recibido, cerrando');
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  console.error('[main] FATAL en bootstrap:', err);
  process.exit(1);
});
