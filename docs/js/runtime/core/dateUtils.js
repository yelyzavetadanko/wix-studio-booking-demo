function stripWrappingQuotes(value) {
  const str = String(value || '').trim();
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1).trim();
  }
  return str;
}

export function dateKeyToDate(dateKey, hour = 12) {
  const clean = stripWrappingQuotes(dateKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month, day, hour, 0, 0));
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const clean = stripWrappingQuotes(value);
  const fromKey = dateKeyToDate(clean, 12);
  if (fromKey) return fromKey;
  const parsed = new Date(clean);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toDateKey(d) {
  const date = parseDateLike(d);
  if (!date) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function enumerateDateKeys(startDateKey, endDateKey) {
  const start = dateKeyToDate(startDateKey, 12);
  const end = dateKeyToDate(endDateKey, 12);
  if (!start || !end) return [];
  const keys = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    keys.push(toDateKey(new Date(t)));
  }
  return keys;
}

export function enumerateDateKeysCheckoutExclusive(startDateKey, endDateKey) {
  const start = dateKeyToDate(startDateKey, 12);
  const end = dateKeyToDate(endDateKey, 12);
  if (!start || !end) return [];
  if (end.getTime() <= start.getTime()) return [];
  const keys = [];
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    keys.push(toDateKey(new Date(t)));
  }
  return keys;
}

export function safeJsonParse(json) {
  if (!json || typeof json !== 'string') return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
