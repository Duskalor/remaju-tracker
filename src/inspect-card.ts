/**
 * Temporary inspection script to capture the EXACT HTML structure of a REMAJU card
 * This script launches a visible browser, navigates to REMAJU, and logs the raw HTML
 * of the first card found in the datagrid.
 * 
 * Usage: npm run build && node dist/inspect-card.js
 * Or: ts-node src/inspect-card.ts
 */

import { chromium, Browser, Page } from 'playwright';
import { config } from './config';

async function inspectCard() {
  let browser: Browser | null = null;

  try {
    console.log('\n========== REMAJU CARD HTML INSPECTOR ==========\n');
    console.log('Launching browser (visible mode)...\n');

    // Launch browser in visible mode
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });

    const page: Page = await context.newPage();
    await page.setDefaultTimeout(30000);

    const targetUrl = config.remajuUrl || 'https://remaju.pj.gob.pe/remaju/paginas/buscarRemateExterno.jsf';

    console.log(`Navigating to: ${targetUrl}\n`);

    // Navigate to REMAJU
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    if (!response || !response.ok()) {
      throw new Error(`Failed to load page: ${response?.status()}`);
    }

    await page.waitForLoadState('domcontentloaded');

    // Click APLICAR button
    console.log('Looking for APLICAR button...\n');
    const aplicarButton = page.getByRole('button', { name: 'APLICAR' });
    const aplicarVisible = await aplicarButton.isVisible().catch(() => false);

    if (aplicarVisible) {
      console.log('Clicking APLICAR button...\n');
      await aplicarButton.click();

      // Wait for AJAX response
      await page
        .waitForResponse(
          (resp) =>
            resp.url().includes('javax.faces') ||
            resp.request().method() === 'POST',
          { timeout: 10000 }
        )
        .catch(() => console.log('No JSF response detected (continuing anyway)...\n'));

      // Wait for network idle
      await page.waitForLoadState('networkidle', { timeout: 10000 })
        .catch(() => console.log('networkidle timeout (continuing anyway)...\n'));

      // Wait for datagrid to render
      await page.waitForTimeout(2000);
    } else {
      console.log('APLICAR button not found - page might already have results\n');
    }

    // Wait for datagrid with cards to appear
    console.log('Waiting for datagrid to load...\n');

    const datagridSelectors = [
      '.ui-datagrid-column .card',
      '.ui-datagrid .card',
      '.card',
    ];

    let cardFound = false;
    for (const selector of datagridSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        console.log(`Cards found with selector: ${selector}\n`);
        cardFound = true;
        break;
      } catch {
        // Continue to next selector
      }
    }

    if (!cardFound) {
      console.log('No cards found! Taking debug screenshot...\n');
      await page.screenshot({ path: './logs/no-cards-found.png', fullPage: true });
      throw new Error('No cards found in the datagrid');
    }

    // Wait a bit more for cards to fully render
    await page.waitForTimeout(1000);

    // Extract the HTML of the FIRST card
    console.log('Extracting HTML of the FIRST card...\n');
    
    let firstCardHtml: string | null = null;
    
    // Try method 1: page.$eval
    try {
      firstCardHtml = await page.$eval('.ui-datagrid-column .card', 
        (el) => el.outerHTML
      );
    } catch (err: any) {
      console.log('Method 1 failed, trying alternative...\n');
    }
    
    // Try method 2: page.$$ and evaluate
    if (!firstCardHtml) {
      try {
        console.log('Trying alternative extraction method...\n');
        const allCards = await page.$$('.ui-datagrid-column .card, .ui-datagrid .card, .card');
        if (allCards.length > 0) {
          firstCardHtml = await allCards[0].evaluate((el: any) => el.outerHTML);
        }
      } catch (err: any) {
        console.error('Method 2 also failed:', err.message);
      }
    }

    if (!firstCardHtml) {
      throw new Error('Could not extract card HTML');
    }

    // Log the EXACT HTML to console
    console.log('='.repeat(80));
    console.log('EXACT HTML OF FIRST REMAJU CARD:');
    console.log('='.repeat(80));
    console.log(firstCardHtml);
    console.log('='.repeat(80));
    console.log('\n');

    // Also save to a file for easier viewing
    const fs = require('fs');
    const outputPath = './logs/card-html-inspection.txt';
    
    // Ensure logs directory exists
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }
    
    fs.writeFileSync(outputPath, firstCardHtml, 'utf-8');
    console.log(`Raw HTML also saved to: ${outputPath}\n`);

    // Now let's analyze the structure
    console.log('='.repeat(80));
    console.log('ANALYSIS:');
    console.log('='.repeat(80));
    
    // Check for "Expediente:" in the HTML
    const hasExpediente = firstCardHtml.toLowerCase().includes('expediente');
    console.log(`- Contains "Expediente:": ${hasExpediente ? 'YES' : 'NO'}`);
    
    // Extract and show where "Expediente:" appears
    if (hasExpediente) {
      const expedienteIndex = firstCardHtml.toLowerCase().indexOf('expediente');
      const surroundingHtml = firstCardHtml.substring(
        Math.max(0, expedienteIndex - 100),
        Math.min(firstCardHtml.length, expedienteIndex + 200)
      );
      console.log('\nContext around "Expediente":');
      console.log('-'.repeat(40));
      console.log(surroundingHtml);
      console.log('-'.repeat(40));
    }

    // Count various HTML elements
    const strongCount = (firstCardHtml.match(/<strong/gi) || []).length;
    const bCount = (firstCardHtml.match(/<b>/gi) || []).length;
    const spanCount = (firstCardHtml.match(/<span/gi) || []).length;
    const divCount = (firstCardHtml.match(/<div/gi) || []).length;
    
    console.log(`\nHTML Element counts in this card:`);
    console.log(`  - <strong>: ${strongCount}`);
    console.log(`  - <b>: ${bCount}`);
    console.log(`  - <span>: ${spanCount}`);
    console.log(`  - <div>: ${divCount}`);

    // Extract a sample pattern for Expediente using regex
    const expedientePattern = firstCardHtml.match(/expediente[^<]*[:\s]*([^<]+)/i);
    if (expedientePattern) {
      console.log(`\nExtracted Expediente pattern: ${expedientePattern[0].trim()}`);
    }

    // Look for specific patterns that might indicate label-value pairs
    console.log('\nSearching for label-value patterns...');
    const labelPatterns = firstCardHtml.match(/<(?:strong|b|span|div)[^>]*>[^<]*:[^<]*<\/(?:strong|b|span|div)>/gi);
    if (labelPatterns && labelPatterns.length > 0) {
      console.log('Found label patterns:');
      labelPatterns.forEach((pattern: string, idx: number) => {
        console.log(`  ${idx + 1}. ${pattern}`);
      });
    } else {
      console.log('No standard label patterns found. Checking raw text...');
      const textContent = firstCardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`Card text content: ${textContent.substring(0, 300)}...`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('BROWSER WILL REMAIN OPEN FOR INSPECTION');
    console.log('Press Ctrl+C to close the browser and exit.');
    console.log('='.repeat(80) + '\n');

    // Keep process alive so browser stays open
    await new Promise(() => {
      // This promise never resolves - keeps process running
    });

  } catch (error: any) {
    console.error('\nERROR:', error.message);
    console.error(error.stack);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

// Run the inspection
inspectCard().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
