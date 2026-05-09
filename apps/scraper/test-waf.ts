import { BrowserClient } from './src/browser/client';
import { config } from './src/config';

const BLOCK_SIGNALS = [
  'access denied',
  'forbidden',
  'blocked',
  'captcha',
  'robot',
  'cloudflare',
  'attention required',
  'too many requests',
  'rate limit',
];

async function testWaf() {
  const client = new BrowserClient();

  console.log('\n🔍 WAF Detection Test');
  console.log('━'.repeat(40));
  console.log(`URL: ${config.remajuUrl}\n`);

  let page;
  try {
    page = await client.initialize();
  } catch (err: any) {
    console.error('❌ Browser failed to start:', err.message);
    process.exit(1);
  }

  try {
    const response = await page.goto(config.remajuUrl, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeout,
    });

    const status = response?.status() ?? 0;
    const title = await page.title();
    const bodyText = (await page.locator('body').innerText().catch(() => '')).toLowerCase();

    console.log(`Status : ${status}`);
    console.log(`Title  : ${title}`);

    // Check block signals
    const triggered = BLOCK_SIGNALS.filter(
      (s) => title.toLowerCase().includes(s) || bodyText.includes(s)
    );

    if (status >= 400 || triggered.length > 0) {
      console.log('\n❌ FLAGGED');
      if (triggered.length > 0) {
        console.log(`   Block signals found: ${triggered.join(', ')}`);
      }
      await page.screenshot({ path: './logs/waf-blocked.png', fullPage: true });
      console.log('   Screenshot saved: ./logs/waf-blocked.png');
      return;
    }

    // Check if real content loaded
    const hasAplicar = await page.getByRole('button', { name: 'APLICAR' }).isVisible().catch(() => false);
    const hasDatagrid = await page.locator('.ui-datagrid').isVisible().catch(() => false);

    if (hasAplicar || hasDatagrid) {
      console.log('\n✅ NOT FLAGGED — real content loaded');
      if (hasAplicar) console.log('   APLICAR button visible');
      if (hasDatagrid) console.log('   Datagrid visible');
    } else {
      console.log('\n⚠️  AMBIGUOUS — no block detected but content not found');
      console.log('   Check the screenshot for details');
      await page.screenshot({ path: './logs/waf-ambiguous.png', fullPage: true });
      console.log('   Screenshot saved: ./logs/waf-ambiguous.png');
    }
  } catch (err: any) {
    console.error('\n❌ Error during test:', err.message);
    await page.screenshot({ path: './logs/waf-error.png', fullPage: true }).catch(() => {});
    console.log('   Screenshot saved: ./logs/waf-error.png');
  } finally {
    await client.close();
    console.log('');
  }
}

testWaf();
