import { BrowserClient } from './src/browser/client';
import { RemajuNavigator } from './src/browser/navigator';
import { parseRematesTable } from './src/parsing/card-parser';
import { config } from './src/config';

const MAX_PAGES = 5;

// Radware's specific block page signature — tight, not generic words like "captcha"
const BLOCK_SIGNALS = [
  'unauthorized request blocked',
  'radware',
  'bot manager',
];

function isBlocked(html: string): string | null {
  const lower = html.toLowerCase();
  return BLOCK_SIGNALS.find((s) => lower.includes(s)) ?? null;
}

async function testPagination() {
  const client = new BrowserClient();

  console.log('\n📄 Pagination WAF Test');
  console.log('━'.repeat(40));
  console.log(`URL   : ${config.remajuUrl}`);
  console.log(`Pages : up to ${MAX_PAGES}\n`);

  await client.initialize();
  const page = client.getPage();
  const navigator = new RemajuNavigator(client);

  try {
    // Page 1
    await navigator.navigateToRemaju();
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= MAX_PAGES) {
      const html = await navigator.getPageHtml();
      const blockSignal = isBlocked(html);

      // Primary check: real content must be present
      const hasDatagrid = await page.locator('.ui-datagrid').isVisible().catch(() => false);

      if (!hasDatagrid || blockSignal) {
        const reason = blockSignal ? `"${blockSignal}"` : 'datagrid not found';
        console.log(`Page ${currentPage}: ❌ BLOCKED — ${reason}`);
        await navigator.takeDebugScreenshot(`blocked-page-${currentPage}`);
        console.log(`           Screenshot saved: ./logs/blocked-page-${currentPage}-*.png`);
        break;
      }

      const parsed = parseRematesTable(html, config.remajuUrl);
      const records = parsed.data?.length ?? 0;
      console.log(`Page ${currentPage}: ✅ OK — ${records} registros`);

      const pagination = await navigator.getPaginationInfo();
      hasMore = pagination.hasNext;

      if (hasMore && currentPage < MAX_PAGES) {
        const ok = await navigator.navigateToPage(currentPage + 1);
        if (!ok) {
          console.log(`\n⚠️  Navigator couldn't move to page ${currentPage + 1}`);
          break;
        }
        currentPage++;
      } else {
        break;
      }
    }

    console.log('\n' + '━'.repeat(40));
    if (currentPage === MAX_PAGES || !hasMore) {
      console.log(`✅ Passed ${currentPage} page(s) without WAF block\n`);
    }
  } catch (err: any) {
    console.error('\n❌ Unexpected error:', err.message);
    await navigator.takeDebugScreenshot('pagination-error');
  } finally {
    await client.close();
  }
}

testPagination();
