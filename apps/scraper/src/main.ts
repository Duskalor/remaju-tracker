import { RemajuScraper } from './scraper';
import { logger } from './logger';

async function main(): Promise<void> {
  const scraper = new RemajuScraper();

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    process.exit(0);
  });

  try {
    const stats = await scraper.run();
    logger.info('Scraper completed', stats);
    process.exit(0);
  } catch (error: any) {
    logger.error('Scraper failed', { error: error.message });
    process.exit(1);
  }
}

main();
