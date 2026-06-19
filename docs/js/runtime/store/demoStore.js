const STORAGE_KEY = 'wix-booking-demo-store-v1';

let cache = null;

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fixture_load_failed:${url}`);
  return res.json();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export async function initDemoStore(basePath = '../fixtures/') {
  if (cache) return cache;

  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const names = [
    'rooms', 'package-products', 'package-sessions', 'pricing-rules',
    'activity-catalog', 'retreat-products', 'retreat-sessions',
    'inventory-blocks', 'inventory-unit-closures',
    'bookings', 'enquiries', 'bed-locks', 'theme',
  ];

  const entries = await Promise.all(
    names.map(async (name) => [name, await fetchJson(`${prefix}${name}.json`)])
  );

  cache = Object.fromEntries(entries);

  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const key of ['bookings', 'enquiries', 'bed-locks', 'inventory-unit-closures', 'package-sessions', 'retreat-sessions']) {
        if (!Array.isArray(parsed[key])) continue;
        const keepFixtureSeed = (key === 'bookings' || key === 'enquiries') && parsed[key].length === 0;
        if (!keepFixtureSeed) cache[key] = parsed[key];
      }
    }
  } catch (_) {
    /* ignore */
  }

  return cache;
}

export function getStore() {
  if (!cache) throw new Error('demo_store_not_initialized');
  return cache;
}

export function persistDemoStore() {
  if (!cache) return;
  const payload = {
    bookings: cache.bookings,
    enquiries: cache.enquiries,
    'bed-locks': cache['bed-locks'],
    'inventory-unit-closures': cache['inventory-unit-closures'],
    'package-sessions': cache['package-sessions'],
    'retreat-sessions': cache['retreat-sessions'],
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function resetDemoStore() {
  sessionStorage.removeItem(STORAGE_KEY);
  cache = null;
}

export function queryCollection(collectionKey) {
  const store = getStore();
  const rows = store[collectionKey];
  return Array.isArray(rows) ? clone(rows) : [];
}

export function upsertCollectionRow(collectionKey, row) {
  const store = getStore();
  if (!Array.isArray(store[collectionKey])) store[collectionKey] = [];
  const id = String(row._id || row.id || '');
  const idx = store[collectionKey].findIndex((r) => String(r._id || r.id || '') === id);
  if (idx >= 0) store[collectionKey][idx] = { ...store[collectionKey][idx], ...row };
  else store[collectionKey].push(row);
  persistDemoStore();
  return row;
}

export function insertCollectionRow(collectionKey, row) {
  const store = getStore();
  if (!Array.isArray(store[collectionKey])) store[collectionKey] = [];
  const id = row._id || `${collectionKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const next = { ...row, _id: id };
  store[collectionKey].push(next);
  persistDemoStore();
  return next;
}

export function nextDemoId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
