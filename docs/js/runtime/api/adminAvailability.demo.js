import { queryCollection, upsertCollectionRow, getStore, persistDemoStore } from '../store/demoStore.js';
import { listInventoryUnits } from '../core/inventoryUnitRegistry.js';

function toMonthKey(value = '') {
  const raw = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(monthKey = '') {
  const key = toMonthKey(monthKey);
  const [y, m] = key.split('-').map(Number);
  const startDateKey = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endDateKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const days = [];
  for (let d = 1; d <= lastDay; d += 1) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return { monthKey: key, startDateKey, endDateKey, days };
}

function buildOccupancy(days = [], closures = []) {
  const closureByUnitDate = {};
  for (const row of closures) {
    const unitId = String(row.unitId || '').trim();
    const dateKey = String(row.dateKey || '').trim();
    if (!unitId || !dateKey) continue;
    closureByUnitDate[`${unitId}__${dateKey}`] = row.isOpen === false;
  }
  const units = listInventoryUnits();
  const occupancyByTypeDate = {};
  for (const day of days) {
    for (const unit of units) {
      const roomTypeKey = String(unit.roomTypeKey || '').trim();
      const key = `${roomTypeKey}__${day}`;
      if (!occupancyByTypeDate[key]) {
        occupancyByTypeDate[key] = {
          roomTypeKey,
          dateKey: day,
          totalUnits: 0,
          openUnits: 0,
          bookedUsed: 0,
          lockUsed: 0,
          availableUnits: 0,
        };
      }
      occupancyByTypeDate[key].totalUnits += 1;
      const closed = closureByUnitDate[`${unit.unitId}__${day}`] === true;
      if (!closed) occupancyByTypeDate[key].openUnits += 1;
    }
    for (const unit of units) {
      const roomTypeKey = String(unit.roomTypeKey || '').trim();
      const key = `${roomTypeKey}__${day}`;
      occupancyByTypeDate[key].availableUnits = occupancyByTypeDate[key].openUnits;
    }
  }
  return occupancyByTypeDate;
}

export async function loadAdminAvailabilityBootstrap(input = {}) {
  getStore();
  const range = monthRange(input.monthKey || '');
  const closures = queryCollection('inventory-unit-closures').filter(
    (row) => String(row.dateKey || '') >= range.startDateKey && String(row.dateKey || '') <= range.endDateKey
  );
  const occupancyByTypeDate = buildOccupancy(range.days, closures);
  return {
    ok: true,
    monthKey: range.monthKey,
    range,
    units: listInventoryUnits(),
    closures,
    occupancyByTypeDate,
    bookingContextsByTypeDate: {},
  };
}

export async function listAdminAvailabilityMonth(input = {}) {
  return loadAdminAvailabilityBootstrap(input);
}

export async function setAdminInventoryUnitClosure(input = {}) {
  getStore();
  const unitId = String(input.unitId || '').trim();
  const dateKey = String(input.dateKey || '').trim();
  if (!unitId || !dateKey) return { ok: false, message: 'unitId and dateKey are required.' };
  const id = `${unitId}__${dateKey}`;
  upsertCollectionRow('inventory-unit-closures', {
    _id: id,
    unitId,
    dateKey,
    isOpen: input.isOpen !== false,
    source: String(input.source || 'manual').trim(),
    note: String(input.note || '').trim(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true };
}

export async function bulkSetAdminInventoryUnitClosures(input = {}) {
  getStore();
  const roomTypeKey = String(input.roomTypeKey || '').trim().toLowerCase();
  const startDateKey = String(input.startDateKey || '').trim();
  const endDateKey = String(input.endDateKey || '').trim();
  if (!roomTypeKey || !startDateKey || !endDateKey) {
    return { ok: false, message: 'roomTypeKey, startDateKey and endDateKey are required.' };
  }
  const units = listInventoryUnits().filter((u) => String(u.roomTypeKey) === roomTypeKey);
  const dates = [];
  let cur = startDateKey;
  while (cur <= endDateKey) {
    dates.push(cur);
    const d = new Date(`${cur}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  for (const day of dates) {
    for (const unit of units) {
      await setAdminInventoryUnitClosure({
        unitId: unit.unitId,
        dateKey: day,
        isOpen: input.isOpen !== false,
        source: input.source,
        note: input.note,
      });
    }
  }
  return { ok: true, touchedDates: dates.length, touchedUnits: units.length };
}

export async function clearAdminInventoryUnitClosures(input = {}) {
  getStore();
  const roomTypeKey = String(input.roomTypeKey || '').trim().toLowerCase();
  const startDateKey = String(input.startDateKey || '').trim();
  const endDateKey = String(input.endDateKey || '').trim();
  const store = getStore();
  store['inventory-unit-closures'] = (store['inventory-unit-closures'] || []).filter((row) => {
    if (roomTypeKey && String(row.roomTypeKey || '') !== roomTypeKey) {
      const unit = listInventoryUnits().find((u) => u.unitId === row.unitId);
      if (String(unit?.roomTypeKey || '') !== roomTypeKey) return true;
    }
    const dk = String(row.dateKey || '');
    if (startDateKey && dk < startDateKey) return true;
    if (endDateKey && dk > endDateKey) return true;
    return false;
  });
  persistDemoStore();
  return { ok: true };
}

export async function setAdminBookingEarlyCheckout() {
  return { ok: true, message: 'Demo — early checkout recorded locally.' };
}

export async function releaseAdminSessionReserve() {
  return { ok: true, message: 'Demo — reserve release simulated.' };
}

export async function releaseAdminReserveForUnit() {
  return { ok: true, message: 'Demo — unit reserve release simulated.' };
}
