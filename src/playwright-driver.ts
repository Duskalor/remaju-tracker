/**
 * Playwright driver for Remaju Scraper
 * Handles browser automation, JSF navigation, and ViewState management
 * FIXED: Correct selectors for datagrid, CAPTCHA handling, proper pagination
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { JsfFormData, PlaywrightConfig, PaginationInfo } from './types/remate';
import { logger } from './logger';
import { config } from './config';

/**
 * Default configuration for Playwright
 */
const DEFAULT_PLAYWRIGHT_CONFIG: PlaywrightConfig = {
  headless: false,
  timeout: 30000,
  retries: 3,
};

/**
 * Wraps Playwright operations with retry logic
 */
export class PlaywrightDriver {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private playwrightConfig: PlaywrightConfig;
  private baseUrl: string = '';

  constructor(customConfig?: Partial<PlaywrightConfig>) {
    this.playwrightConfig = {
      ...DEFAULT_PLAYWRIGHT_CONFIG,
      ...customConfig,
      headless: customConfig?.headless ?? config.headless,
      timeout: customConfig?.timeout ?? config.timeout,
      retries: customConfig?.retries ?? config.retryMax,
    };
  }

  /**
   * Initializes the browser and creates a new page
   */
  async initialize(): Promise<Page> {
    try {
      logger.info('Initializing Playwright browser', {
        headless: this.playwrightConfig.headless,
        timeout: this.playwrightConfig.timeout,
      });

      this.browser = await chromium.launch({
        headless: this.playwrightConfig.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
      });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.playwrightConfig.timeout);

      logger.info('Playwright browser initialized successfully');
      return this.page;
    } catch (error: any) {
      logger.error('Failed to initialize Playwright', { error: error.message });
      throw error;
    }
  }

  /**
   * Navigates to the REMAJU URL and waits for the table to load
   * FIXED: Added CAPTCHA handling and APLICAR button click
   */
  async navigateToRemaju(url?: string): Promise<void> {
    const targetUrl = url || config.remajuUrl;
    this.baseUrl = targetUrl;

    try {
      logger.info(`Navigating to REMAJU: ${targetUrl}`);

      if (!this.page) {
        throw new Error('Page not initialized. Call initialize() first.');
      }

      // Use domcontentloaded instead of networkidle for JSF pages
      const response = await this.page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: this.playwrightConfig.timeout,
      });

      if (!response || !response.ok()) {
        throw new Error(`Failed to load page: ${response?.status()}`);
      }

      // Wait for initial page load
      await this.page.waitForLoadState('domcontentloaded');

      // Click APLICAR button to load results
      logger.info('Clicking APLICAR button to load results...');
      const aplicarButton = this.page.getByRole('button', { name: 'APLICAR' });
      const aplicarVisible = await aplicarButton.isVisible().catch(() => false);

      if (aplicarVisible) {
        await aplicarButton.click();
        logger.info('APLICAR button clicked');

        // Wait for AJAX response after clicking APLICAR
        await this.page
          .waitForResponse(
            (resp) =>
              resp.url().includes('javax.faces') ||
              resp.request().method() === 'POST',
          )
          .catch(() =>
            logger.warn('No JSF response detected after APLICAR click'),
          );

        // Wait for network to be idle (CRITICAL for JSF)
        await this.page.waitForLoadState('networkidle', { timeout: 10000 })
          .catch(() => logger.warn('networkidle timeout after APLICAR click'));

        // Wait a bit for the table to render
        await this.page.waitForTimeout(2000);
      } else {
        logger.warn(
          'APLICAR button not found - page might already have results',
        );
      }

      // Wait for the datagrid to appear (NOT datatable - this is a datagrid!)
      await this.waitForTable();

      // Set rows per page to 12 (as per PRD and user's codegen)
      logger.info('Setting rows per page to 12...');
      const rowsPerPageSelector = this.page.getByLabel('Rows Per Page');
      const rowsSelectorExists = await rowsPerPageSelector
        .isVisible()
        .catch(() => false);

      if (rowsSelectorExists) {
        await rowsPerPageSelector.selectOption('12');

        // Wait for AJAX response after changing rows per page
        await this.page
          .waitForResponse(
            (resp) =>
              resp.url().includes('javax.faces') ||
              resp.request().method() === 'POST',
          )
          .catch(() =>
            logger.warn('No JSF response detected after rows per page change'),
          );

        // Wait for datagrid to update
        await this.page.waitForTimeout(2000);
      }

      logger.info('Successfully navigated to REMAJU and table loaded');
    } catch (error: any) {
      logger.error('Failed to navigate to REMAJU', {
        error: error.message,
        url: targetUrl,
      });
      await this.takeDebugScreenshot('navigation-failed');
      throw error;
    }
  }

  /**
   * Waits for the remates datagrid to be visible
   * FIXED: Using correct selectors for ui-datagrid (not ui-datatable)
   */
  async waitForTable(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      // PrimeFaces datagrid selectors (NOT datatable!)
      // Based on user's codegen: the page uses ui-datagrid with cards
      const datagridSelectors = [
        '.ui-datagrid', // Main datagrid container
        '#formBuscarRemateExterno\\:listaRemate', // Specific ID (escape colon)
        '.ui-datagrid-column .card', // Individual cards inside datagrid
        '.ui-datagrid .ui-datagrid-column', // Datagrid columns
      ];

      let datagridFound = false;
      for (const selector of datagridSelectors) {
        try {
          await this.page.waitForSelector(selector, {
            timeout: this.playwrightConfig.timeout,
          });
          logger.debug(`Datagrid found with selector: ${selector}`);
          datagridFound = true;
          break;
        } catch {
          // Continue to next selector
        }
      }

      if (!datagridFound) {
        // Take screenshot for debugging
        await this.takeDebugScreenshot('datagrid-not-found');
        throw new Error('Remates datagrid not found on page');
      }

      // Additional wait for cards to load inside the datagrid
      // Based on user's codegen: cards have class "card" inside "ui-datagrid-column"
      await this.page
        .waitForSelector('.ui-datagrid-column .card', {
          timeout: 10000,
        })
        .catch(() => logger.warn('No cards found inside datagrid'));

      logger.info('Datagrid with cards successfully loaded');
    } catch (error: any) {
      logger.error('Failed to find remates datagrid', { error: error.message });
      throw error;
    }
  }

  /**
   * Extracts JSF ViewState and form data from the page
   */
  async extractJsfFormData(): Promise<JsfFormData | null> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      const formData = await this.page.evaluate(() => {
        // Find the JSF form (usually the first form with ViewState)
        const form = document.querySelector(
          'form[id*="javax"], form[action]',
        ) as HTMLFormElement;
        if (!form) return null;

        const viewStateInput = form.querySelector(
          'input[name="javax.faces.ViewState"]',
        ) as HTMLInputElement;
        if (!viewStateInput) return null;

        return {
          viewState: viewStateInput.value,
          formId: form.id || '',
          postbackUrl: form.action || window.location.href,
        };
      });

      if (formData) {
        logger.debug('JSF ViewState extracted', { formId: formData.formId });
      } else {
        logger.warn('Could not extract JSF ViewState');
      }

      return formData;
    } catch (error: any) {
      logger.error('Failed to extract JSF form data', { error: error.message });
      return null;
    }
  }

  /**
   * Navigates to a specific page in the PrimeFaces datagrid
   * FIXED: Using role-based selectors for pagination (link with name "Page X")
   */
  async navigateToPage(targetPage: number): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      logger.info(`Navigating to page ${targetPage}`);

      // Wait for paginator to be ready
      const paginatorReady = await this.page
        .waitForSelector('.ui-paginator', {
          timeout: 5000,
        })
        .then(() => true)
        .catch(() => false);

      if (!paginatorReady) {
        logger.warn('Paginator not found - might be single page');
        return false;
      }

      // Based on user's codegen: pagination uses role "link" with name "Page X"
      // Example: await page.getByRole('link', { name: 'Page 2' }).click();
      const pageLink = this.page.getByRole('link', {
        name: `Page ${targetPage}`,
      });
      const linkCount = await pageLink.count();

      if (linkCount === 0) {
        logger.warn(`Page link "Page ${targetPage}" not found`);

        // Alternative: try using paginator page buttons
        const pageButton = this.page
          .locator(`.ui-paginator-page`)
          .filter({ hasText: `${targetPage}` });
        const buttonCount = await pageButton.count();

        if (buttonCount === 0) {
          logger.warn(`No pagination control found for page ${targetPage}`);
          return false;
        }

        // Extract ViewState before navigation (JSF requirement)
        const formData = await this.extractJsfFormData();
        if (!formData) {
          logger.warn('No ViewState found, attempting navigation anyway');
        }

        await pageButton.first().click();
      } else {
        // Extract ViewState before navigation (JSF requirement)
        const formData = await this.extractJsfFormData();
        if (!formData) {
          logger.warn('No ViewState found, attempting navigation anyway');
        }

        await pageLink.click();
      }

      // Wait for JSF AJAX update (PrimeFaces specific)
      await this.page
        .waitForResponse(
          (resp) =>
            resp.url().includes('javax.faces') ||
            resp.url().includes('primefaces') ||
            resp.request().method() === 'POST',
          { timeout: 10000 }
        )
        .catch(() => logger.warn('No JSF response detected'));

      // Wait for network to be idle (CRITICAL for JSF)
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });

      // Wait for datagrid to update (cards to reload)
      await this.page
        .waitForSelector('.ui-datagrid-column .card', {
          timeout: 10000,
        })
        .catch(() => logger.warn('No cards found after pagination'));

      // Additional safety delay (increased from 1000 to 3000)
      await this.page.waitForTimeout(3000);

      logger.info(`Successfully navigated to page ${targetPage}`);
      return true;
    } catch (error: any) {
      logger.error(`Failed to navigate to page ${targetPage}`, {
        error: error.message,
      });

      // Try to recover by reloading the page
      try {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.waitForTable();
        logger.info('Recovered from navigation error by reloading page');
      } catch (reloadError: any) {
        logger.error('Failed to recover from navigation error', {
          error: reloadError.message,
        });
      }

      return false;
    }
  }

  /**
   * Gets the current page HTML content
   */
  async getPageHtml(): Promise<string> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      const html = await this.page.content();
      logger.debug(`Retrieved page HTML (${html.length} chars)`);
      return html;
    } catch (error: any) {
      logger.error('Failed to get page HTML', { error: error.message });
      throw error;
    }
  }

  /**
   * Gets pagination information from the current page
   * FIXED: Updated for datagrid pagination
   */
  async getPaginationInfo(): Promise<PaginationInfo> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      const paginationInfo = await this.page.evaluate(() => {
        const paginator = document.querySelector('.ui-paginator');
        if (!paginator) {
          return {
            currentPage: 1,
            totalPages: 1,
            totalRows: 0,
            hasNext: false,
          };
        }

        // Get current active page - try link with aria-label or text "Page X"
        let currentPage = 1;
        const activeLink = paginator.querySelector(
          '.ui-state-active, .ui-paginator-page.ui-state-active',
        );
        if (activeLink) {
          // Try to get page number from text or aria-label
          const text = activeLink.textContent || '';
          const ariaLabel = activeLink.getAttribute('aria-label') || '';
          const match = (text + ariaLabel).match(/(\d+)/);
          if (match) {
            currentPage = parseInt(match[1], 10);
          }
        }

        // Get total pages - Strategy 0: Look for "Total: X registros" text (HIGHEST PRIORITY)
        // Example: "Total: 234 registros." - This gives us exact total records
        let totalPages = 1;
        let totalRows = 0;
        const paginatorText = paginator.textContent || '';

        const totalMatch = paginatorText.match(/Total:\s*(\d+)\s*registro/i);
        if (totalMatch) {
          totalRows = parseInt(totalMatch[1], 10);
          // Rows per page is 12 (as set in navigateToRemaju)
          const rowsPerPage = 12;
          totalPages = Math.ceil(totalRows / rowsPerPage);
        } else {
          // Strategy 1: Look for "Página X de Y" text (Spanish)
          const paginaMatch = paginatorText.match(/Página\s+(\d+)\s+de\s+(\d+)/i);
          if (paginaMatch) {
            totalPages = parseInt(paginaMatch[2], 10) || 1;
          } else {
            // Strategy 2: Look for "Page X of Y" text (English fallback)
            const pageMatch = paginatorText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
            if (pageMatch) {
              totalPages = parseInt(pageMatch[2], 10) || 1;
            } else {
              // Strategy 3: Count visible page links (fallback - may only show window of 5)
              const pageLinks = paginator.querySelectorAll(
                'a[role="link"][aria-label*="Page"], a.ui-paginator-page',
              );
              totalPages = pageLinks.length || 1;

              // Strategy 4: Check if "next" button is enabled - if so, there are more pages
              const nextButton = paginator.querySelector('.ui-paginator-next:not(.ui-state-disabled)');
              if (nextButton && totalPages === 1) {
                // If we only see 1 page but next is enabled, try to get from last button
                const lastButton = paginator.querySelector('.ui-paginator-last');
                if (lastButton) {
                  const lastPageData = lastButton.getAttribute('data-page');
                  if (lastPageData) {
                    totalPages = parseInt(lastPageData, 10) + 1;
                  }
                }
              }
            }
          }
        }

        // Get total rows info (if not already set from "Total: X registros")
        if (totalRows === 0) {
          const statusBar = paginator.querySelector('.ui-paginator-current');
          if (statusBar) {
            const match = statusBar.textContent?.match(/(\d+)$/);
            if (match) {
              totalRows = parseInt(match[1], 10);
            }
          }
        }

        // Check if there's a "next" button enabled
        const nextButton = paginator.querySelector(
          '.ui-paginator-next:not(.ui-state-disabled)',
        );
        const hasNext = !!nextButton && currentPage < totalPages;

        return {
          currentPage,
          totalPages,
          totalRows,
          hasNext,
        };
      });

      logger.debug('Pagination info extracted', paginationInfo);
      return paginationInfo;
    } catch (error: any) {
      logger.error('Failed to get pagination info', { error: error.message });
      return { currentPage: 1, totalPages: 1, totalRows: 0, hasNext: false };
    }
  }

  /**
   * Takes a screenshot for debugging purposes
   */
  async takeDebugScreenshot(name: string): Promise<string | null> {
    if (!this.page) return null;

    try {
      const screenshotPath = `./logs/${name}-${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Debug screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (error: any) {
      logger.warn('Failed to take debug screenshot', { error: error.message });
      return null;
    }
  }

  /**
   * Closes the browser and cleans up resources
   */
  async close(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }

      if (this.context) {
        await this.context.close();
        this.context = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.info('Playwright browser closed');
    } catch (error: any) {
      logger.error('Error closing Playwright', { error: error.message });
    }
  }

   /**
    * Gets the current Page instance (for advanced operations)
    */
   getPage(): Page | null {
     return this.page;
   }

   /**
    * Gets the current Browser instance
    */
   getBrowser(): Browser | null {
     return this.browser;
   }

   /**
     * Tests pagination detection WITHOUT running full scrape
     * Verifies that "Total: X registros." can be detected
     * Takes screenshot for visual verification
     * FIXED: Now uses .ui-paginator class (PrimeFaces standard) instead of wrong aria-label
     */
    async testPaginationDetection(): Promise<void> {
      logger.info('[TEST] Starting pagination detection test...');
      
      try {
        // Step1: Navigate to REMAJU
        await this.navigateToRemaju();
        
        // Step2: Get pagination text using PrimeFaces paginator class
        // PrimeFaces paginator is usually a <div> with class "ui-paginator"
        const paginatorLocator = this.page!.locator('.ui-paginator');
        const paginatorVisible = await paginatorLocator.isVisible().catch(() => false);
        
        if (!paginatorVisible) {
          logger.warn('[TEST] ❌ Paginator not found with class ".ui-paginator"');
          logger.info('[TEST] Checking if single page (no pagination needed)...');
          
          // Single page scenario - no paginator needed
          const cardCount = await this.page!.locator('.ui-datagrid-column .card').count();
          logger.info(`[TEST] Found ${cardCount} cards on single page`);
          return;
        }
        
        // Step3: Get the ENTIRE paginator text content
        const paginatorText = await paginatorLocator.textContent().catch(() => null);
        logger.info(`[TEST] Raw paginator text: "${paginatorText}"`);
        
        // Step4: Try to find "Total: X registros." pattern (PrimeFaces standard)
        const totalMatch = paginatorText?.match(/Total:\s*(\d+)\s*registro/i);
        
        if (totalMatch) {
          const totalRecords = parseInt(totalMatch[1], 10);
          const rowsPerPage = 12; // As set in navigateToRemaju()
          const totalPages = Math.ceil(totalRecords / rowsPerPage);
          
          logger.info(`[TEST] ✅ Found "Total: ${totalRecords} registros."`);
          logger.info(`[TEST] Calculated total pages: ${totalPages} (${totalRecords} records / ${rowsPerPage} per page)`);
          logger.info(`[TEST] Pagination detection: WORKING`);
        } else {
          logger.warn(`[TEST] ❌ "Total: X registros." NOT FOUND in: "${paginatorText}"`);
          logger.info('[TEST] Trying alternative patterns...');
          
          // Try "Página X de Y" pattern (Spanish)
          const paginaMatch = paginatorText?.match(/Página\s+(\d+)\s+de\s+(\d+)/i);
          if (paginaMatch) {
            logger.info(`[TEST] ✅ Found "Página ${paginaMatch[1]} de ${paginaMatch[2]}"`);
          } else {
            // Fallback: count page buttons
            const pageButtons = await this.page!.locator('.ui-paginator .ui-paginator-page').count();
            logger.info(`[TEST] Found ${pageButtons} page buttons (visible window)`);
          }
          
          // Also try getting pagination info using existing method
          const paginationInfo = await this.getPaginationInfo();
          logger.info('[TEST] Fallback pagination info:', paginationInfo);
        }
        
        // Step5: Take a screenshot for verification
        const screenshotPath = './logs/pagination-test.png';
        await this.page!.screenshot({ path: screenshotPath, fullPage: false });
        logger.info(`[TEST] Screenshot saved to ${screenshotPath}`);
        
        // Step6: Log additional debug info
        const currentUrl = this.page!.url();
        logger.info(`[TEST] Current URL: ${currentUrl}`);
        
        // Get all text content from the paginator area for debugging
        const fullPaginatorText = await this.page!.locator('.ui-paginator').textContent().catch(() => '');
        logger.debug('[TEST] Full paginator text:', { text: fullPaginatorText });
        
        // Also log the HTML structure for debugging
        const paginatorHtml = await this.page!.locator('.ui-paginator').innerHTML().catch(() => '');
        logger.debug('[TEST] Paginator HTML:', { html: paginatorHtml.substring(0, 500) });
        
      } catch (error: any) {
        logger.error('[TEST] Pagination detection test failed', { error: error.message, stack: error.stack });
        await this.takeDebugScreenshot('pagination-test-failed');
        throw error;
      }
    }
       
       const paginationText = await paginationLocator.textContent().catch(() => null);
       logger.info(`[TEST] Raw pagination text: "${paginationText}"`);
       
       // Step 3: Try to find "Total: X registros." pattern
       const totalMatch = paginationText?.match(/Total:\s*(\d+)\s*registro/i);
       
       if (totalMatch) {
         const totalRecords = parseInt(totalMatch[1], 10);
         const rowsPerPage = 12; // As set in navigateToRemaju()
         const totalPages = Math.ceil(totalRecords / rowsPerPage);
         
         logger.info(`[TEST] ✅ Found "Total: ${totalRecords} registros."`);
         logger.info(`[TEST] Calculated total pages: ${totalPages} (${totalRecords} records / ${rowsPerPage} per page)`);
         logger.info(`[TEST] Pagination detection: WORKING`);
       } else {
         logger.warn(`[TEST] ❌ "Total: X registros." NOT FOUND in: "${paginationText}"`);
         logger.info('[TEST] Falling back to button counting...');
         
         // Try to count page buttons as fallback
         const pageButtons = await this.page!.$$('.ui-paginator .ui-paginator-page');
         logger.info(`[TEST] Found ${pageButtons.length} page buttons (visible window)`);
         
         // Also try getting pagination info using existing method
         const paginationInfo = await this.getPaginationInfo();
         logger.info('[TEST] Fallback pagination info:', paginationInfo);
       }
       
       // Step 4: Take a screenshot for verification
       const screenshotPath = './logs/pagination-test.png';
       await this.page!.screenshot({ path: screenshotPath, fullPage: false });
       logger.info(`[TEST] Screenshot saved to ${screenshotPath}`);
       
       // Step 5: Log additional debug info
       const currentUrl = this.page!.url();
       logger.info(`[TEST] Current URL: ${currentUrl}`);
       
       // Try to get all text content from the paginator area
       const paginatorHtml = await this.page!.locator('.ui-paginator').innerHTML().catch(() => '');
       logger.debug('[TEST] Paginator HTML:', { html: paginatorHtml.substring(0, 500) });
       
     } catch (error: any) {
       logger.error('[TEST] Pagination detection test failed', { error: error.message, stack: error.stack });
       await this.takeDebugScreenshot('pagination-test-failed');
       throw error;
     }
   }
}
