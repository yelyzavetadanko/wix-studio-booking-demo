import { queryCollection, upsertCollectionRow, getStore, persistDemoStore } from '../store/demoStore.js';
import { listInventoryUnits, getInventoryUnitsByRoomType } from '../core/inventoryUnitRegistry.js';
import { formatBookingStatusLabel, listDemoBookingsCollection, parseJsonField } from './adminDemoHelpers.js';

const ROOM_TYPES = ['dorm', 'single', 'double'];
const DEMO_MONTH = '2026-07';
const FINAL_STATUSES = new Set(['confirmed', 'manually_paid']);
const ACTIVE_STATUSES = new Set([
  'pending_admin_review',
  'awaiting_manual_payment',
  'manually_paid',
  'payment_pending',
  'confirmed',
  'pending_hold',
]);

function toMonthKey(value = '') {
  const raw = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  return DEMO_MONTH;
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

function isDateInStayRange(day, start, end) {
  return day >= start && day < end;
}

function enumerateOverlapDays(days, start, end) {
  return days.filter((day) => isDateInStayRange(day, start, end));
}

function buildClosuresMap(rows = []) {
  const map = {};
  for (const row of rows) {
    const unitId = String(row.unitId || '').trim();
    const dateKey = String(row.dateKey || '').trim();
    if (!unitId || !dateKey) continue;
    map[`${unitId}__${dateKey}`] = {
      unitId,
      roomTypeKey: String(row.roomTypeKey || '').trim(),
      dateKey,
      isOpen: row.isOpen !== false,
      source: String(row.source || 'manual').trim(),
      note: String(row.note || '').trim(),
      guestName: String(row.guestName || '').trim(),
      guestPhone: String(row.guestPhone || '').trim(),
      guestEmail: String(row.guestEmail || '').trim(),
      reserveReleaseActive: row.reserveReleaseActive === true,
      reserveReleaseType: String(row.reserveReleaseType || '').trim().toLowerCase(),
      reserveReleaseSessionId: String(row.reserveReleaseSessionId || '').trim(),
    };
  }
  return map;
}

function buildBookingUsage(days, bookings) {
  const usageByTypeDate = {};
  const contextsByTypeDate = {};
  const packageDormUsage = {};
  const retreatDormUsage = {};

  for (const booking of bookings) {
    const status = String(booking.status || '').trim().toLowerCase();
    if (!ACTIVE_STATUSES.has(status) || status === 'pending_hold') continue;
    const start = String(booking.startDate || booking.checkInDate || '').trim();
    const end = String(booking.endDate || booking.checkOutDate || '').trim();
    if (!start || !end) continue;
    const overlap = enumerateOverlapDays(days, start, end);
    if (!overlap.length) continue;

    const flow = String(booking.bookingFlow || '').trim().toLowerCase();
    const guestCount = Math.max(0, Number(booking.guestCount || 0));
    if (flow.startsWith('package_') || flow === 'retreats') {
      for (const day of overlap) {
        const key = `dorm__${day}`;
        packageDormUsage[key] = Number(packageDormUsage[key] || 0) + (flow.startsWith('package_') ? guestCount : 0);
        retreatDormUsage[key] = Number(retreatDormUsage[key] || 0) + (flow === 'retreats' ? guestCount : 0);
      }
    }

    const selections = parseJsonField(booking.roomTypeSelections, [{ roomTypeKey: 'dorm', quantity: guestCount || 1 }]);
    for (const line of selections) {
      const roomTypeKey = String(line.roomTypeKey || '').trim().toLowerCase();
      const qty = Math.max(0, Number(line.quantity || 0));
      if (!roomTypeKey || !qty) continue;
      for (const day of overlap) {
        const key = `${roomTypeKey}__${day}`;
        usageByTypeDate[key] = Number(usageByTypeDate[key] || 0) + qty;
        if (!Array.isArray(contextsByTypeDate[key])) contextsByTypeDate[key] = [];
        contextsByTypeDate[key].push({
          bookingId: String(booking.bookingId || booking._id || ''),
          roomTypeKey,
          quantity: qty,
          releasedQuantity: 0,
          effectiveQuantity: qty,
          startDateKey: start,
          endDateKey: end,
          status,
          statusLabel: formatBookingStatusLabel(status),
          bookingFlow: flow,
          bookingFlowLabel: flow === 'surf_stay' ? 'Surf & Stay' : flow === 'bnb' ? 'B&B' : flow,
          guestName: String(booking.guestName || '').trim(),
          guestPhone: String(booking.guestPhone || '').trim(),
          guestEmail: String(booking.guestEmail || '').trim(),
          isFinal: FINAL_STATUSES.has(status),
        });
      }
    }
  }

  return { usageByTypeDate, contextsByTypeDate, packageDormUsage, retreatDormUsage };
}

function buildLockUsage(days, locks) {
  const map = {};
  const now = Date.now();
  for (const lock of locks) {
    if (String(lock.status || '') !== 'active') continue;
    const expires = new Date(lock.expiresAt || 0).getTime();
    if (Number.isFinite(expires) && expires <= now) continue;
    const roomTypeKey = String(lock.roomTypeKey || '').trim().toLowerCase();
    const start = String(lock.startDate || '').slice(0, 10);
    const end = String(lock.endDate || '').slice(0, 10);
    const qty = Math.max(0, Number(lock.quantityBeds || 0));
    if (!roomTypeKey || !start || !end || !qty) continue;
    for (const day of enumerateOverlapDays(days, start, end)) {
      const key = `${roomTypeKey}__${day}`;
      map[key] = Number(map[key] || 0) + qty;
    }
  }
  return map;
}

function buildPackagePreblocks(days, sessions, productsByKey) {
  const preblockByTypeDate = {};
  const preblockContexts = {};
  for (const session of sessions) {
    const start = String(session.sessionStartDate || '').trim();
    const end = String(session.sessionEndDate || '').trim();
    const preBlocked = Math.max(0, Number(session.preBlockedDormBeds || productsByKey[session.packageKey]?.preBlockedDormBeds || 0));
    if (!start || !end || !preBlocked) continue;
    for (const day of enumerateOverlapDays(days, start, end)) {
      const key = `dorm__${day}`;
      preblockByTypeDate[key] = Number(preblockByTypeDate[key] || 0) + preBlocked;
      if (!Array.isArray(preblockContexts[key])) preblockContexts[key] = [];
      preblockContexts[key].push({
        reserveType: 'package',
        reserveSessionId: String(session._id || ''),
        reserveSessionBusinessId: String(session.packageKey || ''),
        effectiveQuantity: preBlocked,
        isFinal: false,
      });
    }
  }
  return { preblockByTypeDate, preblockContexts };
}

function buildRetreatPreblocks(days, sessions) {
  const preblockByTypeDate = {};
  const preblockContexts = {};
  for (const session of sessions) {
    const start = String(session.sessionStartDate || '').trim();
    const end = String(session.sessionEndDate || '').trim();
    const preBlocked = Math.max(0, Number(session.preBlockedDormBeds || 4));
    if (!start || !end || !preBlocked) continue;
    for (const day of enumerateOverlapDays(days, start, end)) {
      const key = `dorm__${day}`;
      preblockByTypeDate[key] = Number(preblockByTypeDate[key] || 0) + preBlocked;
      if (!Array.isArray(preblockContexts[key])) preblockContexts[key] = [];
      preblockContexts[key].push({
        reserveType: 'retreat',
        reserveSessionId: String(session._id || ''),
        reserveSessionBusinessId: String(session.retreatSessionId || session.retreatKey || ''),
        effectiveQuantity: preBlocked,
        isFinal: false,
      });
    }
  }
  return { preblockByTypeDate, preblockContexts };
}

function buildOccupancyByTypeDate(days, closuresMap, usageByTypeDate, lockUsage, packagePreblock, packageBooked, retreatPreblock, retreatBooked) {
  const out = {};
  for (const roomTypeKey of ROOM_TYPES) {
    const units = getInventoryUnitsByRoomType(roomTypeKey);
    const baseCount = units.length;
    out[roomTypeKey] = {};
    for (const day of days) {
      let openUnits = 0;
      for (const unit of units) {
        const closure = closuresMap[`${unit.unitId}__${day}`];
        if (!closure || closure.isOpen !== false) openUnits += 1;
      }
      const key = `${roomTypeKey}__${day}`;
      const bookedUsedRaw = Number(usageByTypeDate[key] || 0);
      const packagePre = roomTypeKey === 'dorm' ? Number(packagePreblock[key] || 0) : 0;
      const retreatPre = roomTypeKey === 'dorm' ? Number(retreatPreblock[key] || 0) : 0;
      const packageBook = roomTypeKey === 'dorm' ? Number(packageBooked[key] || 0) : 0;
      const retreatBook = roomTypeKey === 'dorm' ? Number(retreatBooked[key] || 0) : 0;
      const lockUsed = Number(lockUsage[key] || 0);
      const bookedUsed = roomTypeKey === 'dorm'
        ? Math.max(0, bookedUsedRaw - packageBook - retreatBook) + packagePre + retreatPre
        : bookedUsedRaw;
      out[roomTypeKey][day] = {
        baseUnits: baseCount,
        openUnits,
        manualClosed: Math.max(0, baseCount - openUnits),
        bookedUsedRaw,
        packagePreblock: packagePre,
        retreatPreblock: retreatPre,
        packageBooked: packageBook,
        retreatBooked: retreatBook,
        bookedUsed,
        lockUsed,
        availableUnits: Math.max(0, openUnits - bookedUsed - lockUsed),
      };
    }
  }
  return out;
}

export async function loadAdminAvailabilityBootstrap(input = {}) {
  getStore();
  const range = monthRange(input.monthKey || DEMO_MONTH);
  const closureRows = queryCollection('inventory-unit-closures');
  const closuresMap = buildClosuresMap(closureRows);
  const bookings = listDemoBookingsCollection();
  const locks = queryCollection('bed-locks');
  const packageSessions = queryCollection('package-sessions');
  const retreatSessions = queryCollection('retreat-sessions');
  const productsByKey = Object.fromEntries(
    queryCollection('package-products').map((row) => [String(row.packageKey || ''), row])
  );

  const { usageByTypeDate, contextsByTypeDate, packageDormUsage, retreatDormUsage } = buildBookingUsage(
    range.days,
    bookings
  );
  const lockUsage = buildLockUsage(range.days, locks);
  const packageBlocks = buildPackagePreblocks(range.days, packageSessions, productsByKey);
  const retreatBlocks = buildRetreatPreblocks(range.days, retreatSessions);

  const bookingContextsByTypeDate = { ...contextsByTypeDate };
  for (const [key, rows] of Object.entries(packageBlocks.preblockContexts)) {
    bookingContextsByTypeDate[key] = [...(bookingContextsByTypeDate[key] || []), ...rows];
  }
  for (const [key, rows] of Object.entries(retreatBlocks.preblockContexts)) {
    bookingContextsByTypeDate[key] = [...(bookingContextsByTypeDate[key] || []), ...rows];
  }

  const occupancyByTypeDate = buildOccupancyByTypeDate(
    range.days,
    closuresMap,
    usageByTypeDate,
    lockUsage,
    packageBlocks.preblockByTypeDate,
    packageDormUsage,
    retreatBlocks.preblockByTypeDate,
    retreatDormUsage
  );

  return {
    ok: true,
    monthKey: range.monthKey,
    range,
    units: listInventoryUnits(),
    closures: Object.values(closuresMap),
    occupancyByTypeDate,
    bookingContextsByTypeDate,
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
  const unit = listInventoryUnits().find((row) => row.unitId === unitId);
  const id = `${unitId}__${dateKey}`;
  upsertCollectionRow('inventory-unit-closures', {
    _id: id,
    unitId,
    dateKey,
    roomTypeKey: unit?.roomTypeKey || '',
    isOpen: input.isOpen !== false,
    source: String(input.source || 'manual').trim(),
    note: String(input.note || '').trim(),
    guestName: String(input.guestName || '').trim(),
    guestPhone: String(input.guestPhone || '').trim(),
    guestEmail: String(input.guestEmail || '').trim(),
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
  const units = getInventoryUnitsByRoomType(roomTypeKey);
  let cur = startDateKey;
  const dates = [];
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
    const unit = listInventoryUnits().find((u) => u.unitId === row.unitId);
    if (roomTypeKey && String(unit?.roomTypeKey || '') !== roomTypeKey) return true;
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
