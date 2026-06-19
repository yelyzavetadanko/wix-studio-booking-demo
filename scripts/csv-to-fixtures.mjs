import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'seed-csv');
  const OUT_DIR = path.join(ROOT, 'docs', 'fixtures');

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        q = !q;
      }
      continue;
    }
    if (c === ',' && !q) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function coerceRow(row) {
  const out = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (v === 'true') out[k] = true;
    else if (v === 'false') out[k] = false;
    else if (v !== '' && /^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
  }
  return out;
}

function readCsv(name) {
  const p = path.join(SEED_DIR, name);
  if (!fs.existsSync(p)) {
    console.warn(`skip missing ${name}`);
    return [];
  }
  return parseCsv(fs.readFileSync(p, 'utf8')).map(coerceRow);
}

function writeJson(name, data) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

const rooms = readCsv('rooms-seed.csv').map((r, i) => ({
  _id: `room_${r.roomTypeKey || i}`,
  ...r,
}));

const packageProducts = readCsv('package-products-seed.csv').map((r, i) => ({
  _id: `pkg_${r.packageKey || i}`,
  ...r,
}));

const packageSessions = readCsv('package-sessions-seed-sample.csv').map((r, i) => ({
  _id: `sess_${r.packageKey}_${i}`,
  ...r,
}));

const pricingRules = readCsv('pricing-rules-seed.csv');
const activityCatalog = readCsv('activity-catalog-seed.csv').map((r, i) => ({
  _id: `act_${i}`,
  ...r,
}));

const retreatProducts = readCsv('retreat-products-seed-template.csv').map((r, i) => ({
  _id: `retreat_prod_${i}`,
  ...r,
}));

const retreatSessions = readCsv('retreat-sessions-seed-template.csv').map((r, i) => ({
  _id: `retreat_sess_${i}`,
  ...r,
}));

const inventoryBlocks = readCsv('inventory-blocks-seed-template.csv');

let seedDefaults = {};
const defaultsPath = path.join(SEED_DIR, 'seed-defaults.json');
if (fs.existsSync(defaultsPath)) {
  seedDefaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8'));
}

const theme = {
  accent: '#de7a45',
  bg: 'transparent',
  surface: '#ffffff',
  line: '#e8e2da',
  text: '#2c2825',
  muted: '#756c61',
  error: '#b42318',
};

writeJson('rooms.json', rooms.length ? rooms : seedDefaults.Rooms || []);
writeJson('package-products.json', packageProducts.length ? packageProducts : seedDefaults.PackageProducts || []);
writeJson('package-sessions.json', packageSessions);
writeJson('pricing-rules.json', pricingRules);
writeJson('activity-catalog.json', activityCatalog);
writeJson('retreat-products.json', retreatProducts);
writeJson('retreat-sessions.json', retreatSessions);
writeJson('inventory-blocks.json', inventoryBlocks);
writeJson('inventory-unit-closures.json', []);
writeJson('bookings.json', []);
writeJson('enquiries.json', []);
writeJson('bed-locks.json', []);
writeJson('theme.json', theme);
writeJson('manifest.json', {
  generatedAt: new Date().toISOString(),
  source: 'seed-csv + seed-defaults.json',
  collections: [
    'rooms', 'package-products', 'package-sessions', 'pricing-rules',
    'activity-catalog', 'retreat-products', 'retreat-sessions',
    'inventory-blocks', 'inventory-unit-closures', 'bookings', 'enquiries', 'bed-locks',
  ],
});

console.log('fixtures written to', OUT_DIR);
