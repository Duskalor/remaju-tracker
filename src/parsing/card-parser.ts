import * as cheerio from 'cheerio';
import { Remate, ParseResult, ParseError } from '../types/remate';
import { logger } from '../logger';

export function parseRematesTable(html: string, sourceUrl: string): ParseResult {
  const errors: ParseError[] = [];
  const remates: Remate[] = [];

  try {
    const $ = cheerio.load(html);
    const allCards = $('.ui-datagrid-column .card, .ui-datagrid .card, .card');

    if (allCards.length === 0) {
      return {
        success: false,
        data: [],
        errors: [{ rowIndex: -1, message: 'No cards found in HTML' }],
        totalRows: 0,
        parsedRows: 0,
      };
    }

    const cards = allCards.filter((_, element) => {
      const $card = $(element);
      const classAttr = $card.attr('class') || '';
      const text = $card.text().toLowerCase();
      return !classAttr.includes('rojo') && !text.includes('filtro') && text.includes('remate n°');
    });

    const totalRows = cards.length;

    if (totalRows === 0) {
      return {
        success: false,
        data: [],
        errors: [{ rowIndex: -1, message: 'No valid remate cards after filtering' }],
        totalRows: 0,
        parsedRows: 0,
      };
    }

    cards.each((index, element) => {
      try {
        const remate = parseCard($(element), $);
        if (remate?.expediente) {
          remate.sourceUrl = sourceUrl;
          remate.scrapedAt = new Date().toISOString();
          remates.push(remate);
        } else {
          errors.push({
            rowIndex: index,
            message: 'Card missing required field: expediente',
            rawHtml: $.html($(element)),
          });
        }
      } catch (error: any) {
        errors.push({ rowIndex: index, message: `Failed to parse card: ${error.message}` });
        logger.warn('Failed to parse card', { cardIndex: index, error: error.message });
      }
    });

    return {
      success: errors.length === 0,
      data: remates,
      errors: errors.length > 0 ? errors : undefined,
      totalRows,
      parsedRows: remates.length,
    };
  } catch (error: any) {
    logger.error('Failed to parse HTML', { error: error.message });
    return {
      success: false,
      data: [],
      errors: [{ rowIndex: -1, message: `HTML parsing failed: ${error.message}` }],
      totalRows: 0,
      parsedRows: 0,
    };
  }
}

function getTextAfterIcon($card: any, $: cheerio.CheerioAPI, iconClass: string): string {
  const icon = $card.find(`i.${iconClass}`).first();
  if (icon.length === 0) return '';

  const parent = icon.parent();
  const html = parent.html() || '';
  const iconHtml = $.html(icon);
  const iconIndex = html.indexOf(iconHtml);
  if (iconIndex === -1) return '';

  const afterIcon = html.substring(iconIndex + iconHtml.length);
  const nextIconMatch = afterIcon.match(/<i[^>]*>/);
  const textHtml = nextIconMatch ? afterIcon.substring(0, nextIconMatch.index) : afterIcon;
  return $('<div>').html(textHtml).text().trim();
}

function parseCard($card: any, $: cheerio.CheerioAPI): Remate {
  const remate: Remate = {};

  try {
    const titleElem = $card.find('span.text-bold.label-danger.h6');
    const titleText = titleElem.text().trim();
    const remateMatch = titleText.match(/Remate N°\s*(\d+)/);
    const remateNum = remateMatch ? remateMatch[1] : '';

    if (remateNum) {
      remate.remate_numero = remateNum;
      remate.expediente = remateNum;
    }

    remate.descripcion = titleText;

    const tipoRemate = getTextAfterIcon($card, $, 'fa-gavel');
    if (tipoRemate) remate.tipo_remate = tipoRemate;

    const ubicacion = getTextAfterIcon($card, $, 'fa-map-marker');
    if (ubicacion) remate.ubicacion = ubicacion;

    const fechaText = getTextAfterIcon($card, $, 'fa-calendar-check-o');
    if (fechaText) remate.fechaPresentacion = fechaText;

    const horaText = getTextAfterIcon($card, $, 'fa-clock-o');
    if (remate.fechaPresentacion && horaText) {
      const parsedDate = parseDate(remate.fechaPresentacion);
      if (parsedDate) remate.fechaPresentacion = `${parsedDate}T${horaText}`;
    }

    const statusElem = $card.find('span.text-bold.titulo').first();
    if (statusElem.length > 0) remate.estado = statusElem.text().trim();

    const tituloElems = $card.find('span.text-bold.titulo');
    if (tituloElems.length > 1) {
      const faseText = tituloElems.last().text().trim();
      if (faseText !== remate.estado) remate.fase = faseText;
    }

    const descElem = $card.find('div.texto-info-scroll label');
    if (descElem.length > 0) remate.bienes = descElem.text().trim();

    const priceDiv = $card.find('div.border-top-buttons');
    if (priceDiv.length > 0) {
      const priceText = priceDiv.find('span.h4').text().trim().replace(/\s+/g, ' ');
      const priceMatch = priceText.match(/([\d,\.]+)/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!isNaN(price)) {
          remate.precioBase = price;
          remate.moneda = 'PEN';
        }
      }
    }

    return remate;
  } catch (error: any) {
    logger.warn('Error parsing card', { error: error.message });
    return remate;
  }
}

function parseDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
    return dateStr;
  } catch {
    return dateStr;
  }
}
