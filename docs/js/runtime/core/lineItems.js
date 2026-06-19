import wixData from '../shims/wixData.js';
import { COLLECTIONS, LINE_ITEM_TYPE } from '../core/config.js';

export async function saveBookingLineItems(bookingId, items, options = {}) {
  const currency = options.currency || 'USD';
  const rows = [];
  for (const item of items || []) {
    const row = await wixData.insert(COLLECTIONS.BOOKING_LINE_ITEMS, {
      bookingId,
      lineType: item.type || LINE_ITEM_TYPE.OTHER,
      label: item.label || '',
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
      currency: item.currency || currency,
      metaJson: item.meta ? JSON.stringify(item.meta) : '',
    });
    rows.push(row);
  }
  return rows;
}

export function sumLineItems(items) {
  return (items || []).reduce((acc, i) => acc + (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0), 0);
}

export function buildAddonLines(toggles, priceMap) {
  const lines = [];
  if (toggles.transfer) {
    lines.push({
      type: LINE_ITEM_TYPE.ADDON_TRANSFER,
      label: 'Airport / Station Transfer',
      quantity: 1,
      unitPrice: priceMap.transfer || 0,
    });
  }
  if (toggles.dinner) {
    lines.push({
      type: LINE_ITEM_TYPE.ADDON_DINNER,
      label: 'Dinner add-on',
      quantity: Number(toggles.dinnerGuests) || 1,
      unitPrice: priceMap.dinner || 0,
    });
  }
  return lines;
}
