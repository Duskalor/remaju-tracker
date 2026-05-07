import { Page } from 'playwright';
import { logger } from '../logger';

export async function simulateMouseMovement(page: Page, selector?: string): Promise<void> {
  if (selector) {
    const element = await page.$(selector);
    if (element) {
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.move(
          box.x + box.width / 2 + (Math.random() - 0.5) * 10,
          box.y + box.height / 2 + (Math.random() - 0.5) * 10,
          { steps: 5 + Math.floor(Math.random() * 10) }
        );
        return;
      }
    }
  }
  await page.mouse.move(
    Math.random() * 800 + 100,
    Math.random() * 600 + 100,
    { steps: 5 + Math.floor(Math.random() * 10) }
  );
}

export async function simulateScroll(page: Page): Promise<void> {
  const scrollAmount = Math.floor(Math.random() * 500) + 100;
  await page.evaluate((amount) => {
    window.scrollBy({ top: amount, behavior: 'smooth' });
  }, scrollAmount);
  await page.waitForTimeout(300 + Math.random() * 500);
  logger.info(`[BEHAVIOR] Scroll: ${scrollAmount}px`);
}

export function getRandomDelay(min: number = 2000, max: number = 7000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
