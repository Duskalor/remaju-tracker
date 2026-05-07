import * as cheerio from 'cheerio';
import { PaginationInfo } from '../types/remate';
import { logger } from '../logger';

const ROWS_PER_PAGE = 12;

export function extractPaginationInfo(html: string): PaginationInfo {
  const $ = cheerio.load(html);
  const paginator = $('.ui-paginator');

  if (paginator.length === 0) {
    return {
      currentPage: 1,
      totalPages: 1,
      totalRows: $('.ui-datagrid-column .card, .card').length,
      hasNext: false,
    };
  }

  let currentPage = 1;
  const activePage = paginator.find('.ui-paginator-page.ui-state-active, .ui-state-active[role="link"]');
  if (activePage.length > 0) {
    const match = (activePage.attr('aria-label') || activePage.text()).match(/(\d+)/);
    if (match) currentPage = parseInt(match[1], 10);
  }

  let totalPages = 1;
  let totalRows = 0;
  const paginatorText = paginator.text();

  const totalMatch = paginatorText.match(/Total:\s*(\d+)\s*registro/i);
  if (totalMatch) {
    totalRows = parseInt(totalMatch[1], 10);
    totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  } else {
    const paginaMatch = paginatorText.match(/Página\s+(\d+)\s+de\s+(\d+)/i);
    if (paginaMatch) {
      totalPages = parseInt(paginaMatch[2], 10) || 1;
    } else {
      const pagesMatch = paginatorText.match(/Page\s+\d+\s+of\s+(\d+)/i);
      if (pagesMatch) {
        totalPages = parseInt(pagesMatch[1], 10);
      } else {
        const pageButtons = paginator.find('.ui-paginator-page, a[role="link"][aria-label*="Page"]');
        totalPages = pageButtons.length || 1;
        const lastBtn = paginator.find('.ui-paginator-last');
        if (lastBtn.length > 0 && totalPages === 1) {
          const lastPageData = lastBtn.attr('data-page');
          if (lastPageData) totalPages = parseInt(lastPageData, 10) + 1;
        }
      }
    }
  }

  if (totalRows === 0) {
    const statusBar = paginator.find('.ui-paginator-current');
    if (statusBar.length > 0) {
      const match = statusBar.text().match(/(\d+)$/);
      if (match) totalRows = parseInt(match[1], 10);
    }
  }

  const nextButton = paginator.find('.ui-paginator-next:not(.ui-state-disabled)');
  const hasNext = nextButton.length > 0 && currentPage < totalPages;

  return { currentPage, totalPages, totalRows, hasNext };
}
