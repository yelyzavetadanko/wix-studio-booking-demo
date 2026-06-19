import wixData from '../shims/wixData.js';
import {
  COLLECTIONS,
  BOOKING_STATUS,
  BOOKING_ACTIVE_INVENTORY_STATUSES,
  RETREAT_OCCUPIED_STATUSES,
  ROOM_KEYS,
} from '../core/config.js';
import { enumerateDateKeysCheckoutExclusive, safeJsonParse, toDateKey } from '../core/dateUtils.js';
import { normalizeRoomRow, allocationQuantityForLock } from '../core/inventoryHelpers.js';
import { getPreBlockedDormBeds } from '../core/packageRules.js';
import { validatePackageBookingExtended } from '../core/packageValidation.js';

const ACTIVE_BOOKING = BOOKING_ACTIVE_INVENTORY_STATUSES;
const PACKAGE_RESERVE_STATUSES = ['open', 'closed', 'sold_out'];
const RETREAT_RESERVE_STATUSES = ['open', 'closed', 'sold_out'];

function isDateWithinStayRange(dateKey = '', startDateKey = '', endDateKey = '') {
  const day = String(dateKey || '').trim();
  const start = String(startDateKey || '').trim();
  const end = String(endDateKey || '').trim();
  if (!day || !start || !end) return false;
  return day >= start && day < end;
}

export async function getRoomsMap() {
  const items = await fetchAll(wixData.query(COLLECTIONS.ROOMS));
  const map = {};
  for (const item of items) {
    map[item.roomTypeKey] = normalizeRoomRow(item);
  }
  return map;
}

async function getReservedDormBedsForStayOnDate(dateKey) {
  const sessions = await fetchAll(
    wixData.query(COLLECTIONS.PACKAGE_SESSIONS).hasSome('status', PACKAGE_RESERVE_STATUSES)
  );
  const packageKeys = [...new Set(sessions.map((row) => String(row.packageKey || '').trim()).filter(Boolean))];
  const productRes = packageKeys.length
    ? await wixData.query(COLLECTIONS.PACKAGE_PRODUCTS).hasSome('packageKey', packageKeys).limit(1000).find()
    : { items: [] };
  const productByKey = new Map((productRes.items || []).map((row) => [String(row.packageKey || ''), row]));

  let reserved = 0;
  for (const session of sessions) {
    const s = toDateKey(session.sessionStartDate);
    const e = toDateKey(session.sessionEndDate);
    if (!isDateWithinStayRange(dateKey, s, e)) continue;

    const prod = productByKey.get(String(session.packageKey || '')) || null;
    reserved += getPreBlockedDormBeds(session, prod);
  }
  const released = await getReleasedReserveBedsOnDate(dateKey, 'package');
  return Math.max(0, reserved - released);
}

async function getReservedDormBedsForRetreatOnDate(dateKey) {
  const sessions = await fetchAll(
    wixData.query(COLLECTIONS.RETREAT_SESSIONS).hasSome('status', RETREAT_RESERVE_STATUSES)
  );
  let reserved = 0;
  for (const session of sessions) {
    const s = toDateKey(session.sessionStartDate);
    const e = toDateKey(session.sessionEndDate);
    if (!isDateWithinStayRange(dateKey, s, e)) continue;
    const preBlockedDormBeds = Math.max(0, Number(session.preBlockedDormBeds || 0));
    reserved += preBlockedDormBeds;
  }
  const released = await getReleasedReserveBedsOnDate(dateKey, 'retreat');
  return Math.max(0, reserved - released);
}

// Returns true when a retreat session covering `dateKey` is configured to lock the
// entire house (Dihya / Anzar by default). When this is the case, every other
// booking flow (BnB, Surf Stay, Beach Reset, Roots & Ritual, Surf & Soul) must
// see zero capacity for dorm/single/double on that date so the property is fully
// reserved for the retreat. The retreat upgrade flow itself uses
// `bookingContext === 'retreat'` and is not affected by this lockout.
async function isRetreatFullHouseLockedOnDate(dateKey) {
  const sessions = await fetchAll(
    wixData.query(COLLECTIONS.RETREAT_SESSIONS).hasSome('status', RETREAT_RESERVE_STATUSES)
  );
  for (const session of sessions) {
    const s = toDateKey(session.sessionStartDate);
    const e = toDateKey(session.sessionEndDate);
    if (!isDateWithinStayRange(dateKey, s, e)) continue;
    // Default to true when the field is absent so existing Dihya/Anzar sessions
    // immediately benefit from the new behaviour without a data migration.
    const blocksFullHouse = session.blocksFullHouse !== false;
    if (blocksFullHouse) return true;
  }
  return false;
}

async function getReleasedReserveBedsOnDate(dateKey, reserveType = '') {
  const safeDateKey = String(dateKey || '').trim();
  const safeType = String(reserveType || '').trim().toLowerCase();
  if (!safeDateKey || (safeType !== 'package' && safeType !== 'retreat')) return 0;
  const rows = await fetchAll(
    wixData
      .query(COLLECTIONS.INVENTORY_UNIT_CLOSURES)
      .eq('dateKey', safeDateKey)
      .eq('reserveReleaseActive', true)
      .eq('reserveReleaseType', safeType),
    1000
  );
  const unique = new Set();
  for (const row of rows || []) {
    const unitId = String(row?.unitId || '').trim();
    const sessionId = String(row?.reserveReleaseSessionId || '').trim();
    if (!unitId || !sessionId) continue;
    unique.add(`${unitId}__${sessionId}`);
  }
  return unique.size;
}

async function getDormBookedForFlowOnDate(dateKey, mode = 'package') {
  const rows = await fetchAll(wixData.query(COLLECTIONS.BOOKINGS).hasSome('status', ACTIVE_BOOKING));
  let booked = 0;
  for (const booking of rows) {
    const status = String(booking.status || '').trim().toLowerCase();
    if (status === BOOKING_STATUS.PENDING_HOLD) continue;
    const s = toDateKey(booking.startDate);
    const e = toDateKey(booking.endDate);
    if (!isDateWithinStayRange(dateKey, s, e)) continue;
    const flow = String(booking.bookingFlow || '').trim().toLowerCase();
    const isPackage = flow.startsWith('package_');
    const isRetreat = flow === 'retreats' || String(booking.retreatSessionId || '').trim() !== '';
    if (mode === 'package' && !isPackage) continue;
    if (mode === 'retreat' && !isRetreat) continue;
    booked += bookingDormReserveDemand(booking);
  }
  return Math.max(0, booked);
}

async function getStayDormReserveStats(dateKey) {
  const [reservedFromPackages, reservedFromRetreats, packageBookedDorm, retreatBookedDorm] = await Promise.all([
    getReservedDormBedsForStayOnDate(dateKey),
    getReservedDormBedsForRetreatOnDate(dateKey),
    getDormBookedForFlowOnDate(dateKey, 'package'),
    getDormBookedForFlowOnDate(dateKey, 'retreat'),
  ]);
  const packageConsumedByBookings = Math.min(packageBookedDorm, reservedFromPackages);
  const retreatConsumedByBookings = Math.min(retreatBookedDorm, reservedFromRetreats);
  return {
    reservedFromPackages,
    reservedFromRetreats,
    packageBookedDorm,
    retreatBookedDorm,
    packageConsumedByBookings,
    retreatConsumedByBookings,
    packageRemainingReserve: Math.max(0, reservedFromPackages - packageBookedDorm),
    retreatRemainingReserve: Math.max(0, reservedFromRetreats - retreatBookedDorm),
    packageOverflow: Math.max(0, packageBookedDorm - reservedFromPackages),
    retreatOverflow: Math.max(0, retreatBookedDorm - reservedFromRetreats),
  };
}

function normalizeRetreatSessionIds(options = {}) {
  const raw = options.retreatSessionIds ?? options.retreatSessionId ?? [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((id) => String(id || '').trim()).filter(Boolean))];
}

function bookingMatchesRetreatSessionScope(booking = {}, options = {}) {
  if (options.bookingContext !== 'retreat') return true;
  const scopedIds = normalizeRetreatSessionIds(options);
  if (!scopedIds.length) return true;
  const bookingSessionId = String(booking.retreatSessionId || '').trim();
  return scopedIds.includes(bookingSessionId);
}

async function getBaseCapacityForDate(roomTypeKey, dateKey, roomsMap, options = {}) {
  const room = roomsMap[roomTypeKey];
  if (!room) return 0;
  let cap = Number(room.baseCapacity) || 0;

  // Retreat upgrade flow owns the house on session dates. Legacy manual
  // InventoryBlocks closures (used before blocksFullHouse) must not hide rooms
  // from retreat participants choosing dorm/single/double upgrades.
  if (options.bookingContext !== 'retreat') {
    const q = await wixData
      .query(COLLECTIONS.INVENTORY_BLOCKS)
      .eq('entityType', 'roomType')
      .eq('entityId', roomTypeKey)
      .eq('dateKey', dateKey)
      .find();

    if (q.items.length > 0) {
      const b = q.items[0];
      if (b.isOpen === false) return 0;
      if (b.overrideCapacity != null && b.overrideCapacity !== '') {
        cap = Number(b.overrideCapacity);
      }
    }
  }

  // Full-house retreat lock-out: when a retreat session marked as
  // `blocksFullHouse` covers this date, every non-retreat flow must see zero
  // capacity for dorm/single/double. The retreat upgrade flow uses
  // `bookingContext === 'retreat'` and is exempt from this rule so that
  // single/double upgrades remain selectable inside the retreat booking flow.
  if (options.bookingContext !== 'retreat') {
    const fullHouseLocked = await isRetreatFullHouseLockedOnDate(dateKey);
    if (fullHouseLocked) return 0;
  }

  if (roomTypeKey === ROOM_KEYS.DORM && options.bookingContext === 'stay') {
    const reserveStats = await getStayDormReserveStats(dateKey);
    cap = Math.max(0, cap - reserveStats.packageRemainingReserve - reserveStats.retreatRemainingReserve);
  }

  return cap;
}

function lineQuantity(row) {
  return allocationQuantityForLock(row);
}

function bookingDormReserveDemand(booking = {}) {
  const participants = Math.max(0, Number(booking.participantsCount || booking.guestCount || 0));
  if (participants > 0) return participants;
  const selections = safeJsonParse(booking.roomTypeSelections) || [];
  return selections.reduce((acc, line) => {
    if (String(line.roomTypeKey || '').trim().toLowerCase() !== ROOM_KEYS.DORM) return acc;
    return acc + lineQuantity(line);
  }, 0);
}

async function sumUsedFromBookingsForDay(roomTypeKey, dateKey, excludeBookingId, options = {}) {
  const items = await fetchAll(wixData.query(COLLECTIONS.BOOKINGS).hasSome('status', ACTIVE_BOOKING));

  let dayUsed = 0;
  let packageDormUsed = 0;
  let retreatDormUsed = 0;
  for (const b of items) {
    if (excludeBookingId && b.bookingId === excludeBookingId) continue;
    if (b.status === BOOKING_STATUS.PENDING_HOLD) continue;

    const s = toDateKey(b.startDate);
    const e = toDateKey(b.endDate);
    if (!isDateWithinStayRange(dateKey, s, e)) continue;
    const flow = String(b.bookingFlow || '').trim().toLowerCase();
    const isPackageFlow = flow.startsWith('package_');
    const isRetreatFlow = flow === 'retreats' || String(b.retreatSessionId || '').trim() !== '';
    if (options.bookingContext === 'retreat') {
      if (!isRetreatFlow) continue;
      if (!bookingMatchesRetreatSessionScope(b, options)) continue;
    }
    if (roomTypeKey === ROOM_KEYS.DORM) {
      const reserveDemand = bookingDormReserveDemand(b);
      if (isPackageFlow) packageDormUsed += reserveDemand;
      if (isRetreatFlow) retreatDormUsed += reserveDemand;
    }

    const sel = safeJsonParse(b.roomTypeSelections) || [];
    for (const row of sel) {
      if (row.roomTypeKey === roomTypeKey) {
        const qty = lineQuantity(row);
        dayUsed += qty;
      }
    }
  }
  return { dayUsed, packageDormUsed, retreatDormUsed };
}

async function sumReleasedFromAdjustmentsForDay(roomTypeKey, dateKey, excludeBookingId) {
  const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateKey}T23:59:59.999Z`);
  if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) return 0;
  const rows = await fetchAll(
    wixData
      .query(COLLECTIONS.BOOKING_OCCUPANCY_ADJUSTMENTS)
      .eq('isActive', true)
      .eq('roomTypeKey', roomTypeKey)
      .le('startDate', dayEnd)
      .ge('endDate', dayStart)
  );
  let released = 0;
  for (const row of rows) {
    if (excludeBookingId && String(row.bookingId || '').trim() === String(excludeBookingId || '').trim()) continue;
    released += Math.max(0, Number(row.quantity || 0));
  }
  return released;
}

async function sumUsedFromLocksForDay(roomTypeKey, dateKey, excludeLockId, excludeBookingDraftId) {
  const now = new Date();
  const items = await fetchAll(wixData.query(COLLECTIONS.BED_LOCKS).eq('status', 'active').gt('expiresAt', now));

  let dayLocks = 0;
  for (const lock of items) {
    if (excludeLockId && lock.lockId === excludeLockId) continue;
    if (excludeBookingDraftId && lock.bookingDraftId === excludeBookingDraftId) continue;
    if (lock.roomTypeKey !== roomTypeKey) continue;
    const ls = toDateKey(lock.startDate);
    const le = toDateKey(lock.endDate);
    if (!isDateWithinStayRange(dateKey, ls, le)) continue;
    dayLocks += Number(lock.quantityBeds) || 0;
  }
  return dayLocks;
}

export async function getRoomAvailability(roomTypeKey, startDateKey, endDateKey, options = {}) {
  const roomsMap = await getRoomsMap();
  const days = enumerateDateKeysCheckoutExclusive(startDateKey, endDateKey);
  let minAvailable = Infinity;

  for (const day of days) {
    const cap = await getBaseCapacityForDate(roomTypeKey, day, roomsMap, options);
    const usage = await sumUsedFromBookingsForDay(roomTypeKey, day, options.excludeBookingId, options);
    const rawUsedBook = Number(usage?.dayUsed || 0);
    const releasedBook = await sumReleasedFromAdjustmentsForDay(roomTypeKey, day, options.excludeBookingId);
    let usedBookBeforeReleases = rawUsedBook;
    if (roomTypeKey === ROOM_KEYS.DORM && options.bookingContext === 'stay') {
      const reserveStats = await getStayDormReserveStats(day);
      const consumedByReserve = reserveStats.packageConsumedByBookings + reserveStats.retreatConsumedByBookings;
      usedBookBeforeReleases = Math.max(0, rawUsedBook - consumedByReserve);
    }
    const usedBook = Math.max(0, usedBookBeforeReleases - releasedBook);
    const usedLock = await sumUsedFromLocksForDay(
      roomTypeKey,
      day,
      options.excludeLockId,
      options.excludeBookingDraftId
    );
    const avail = Math.max(0, cap - usedBook - usedLock);
    minAvailable = Math.min(minAvailable, avail);
  }

  if (minAvailable === Infinity) minAvailable = 0;
  return { available: minAvailable, nights: days.length };
}

export async function getPackageSessionParticipantCount(packageSessionId, excludeBookingId) {
  const items = await fetchAll(
    wixData.query(COLLECTIONS.BOOKINGS).eq('packageSessionId', packageSessionId).hasSome('status', ACTIVE_BOOKING)
  );

  let total = 0;
  for (const b of items) {
    if (excludeBookingId && b.bookingId === excludeBookingId) continue;
    total += Number(b.participantsCount) || 0;
  }
  return total;
}

export async function getRetreatSessionParticipantCount(sessionIds = [], excludeBookingId) {
  const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map((x) => String(x || '').trim()))].filter(Boolean);
  if (!ids.length) return 0;

  const seen = new Set();
  let total = 0;
  for (const sessionId of ids) {
    const items = await fetchAll(
      wixData.query(COLLECTIONS.BOOKINGS).eq('retreatSessionId', sessionId).hasSome('status', RETREAT_OCCUPIED_STATUSES)
    );
    for (const b of items) {
      if (excludeBookingId && b.bookingId === excludeBookingId) continue;
      const uniqueId = String(b._id || b.bookingId || '');
      if (!uniqueId || seen.has(uniqueId)) continue;
      seen.add(uniqueId);
      total += Number(b.participantsCount) || Number(b.guestCount) || 0;
    }
  }
  return total;
}

export async function validatePackageBooking(input, options = {}) {
  return validatePackageBookingExtended(input, { ...options, softMin: true });
}

export async function validateRoomOnlyBooking(input, options = {}) {
  const { startDateKey, endDateKey, roomTypeSelections } = input;
  const ctx = { ...options, bookingContext: options.bookingContext || 'stay' };
  for (const row of roomTypeSelections || []) {
    const need = lineQuantity(row);
    if (need <= 0) continue;
    const { available } = await getRoomAvailability(row.roomTypeKey, startDateKey, endDateKey, ctx);
    if (available < need) {
      return {
        ok: false,
        code: 'NO_INVENTORY',
        message: `Not enough ${row.roomTypeKey} capacity.`,
        roomTypeKey: row.roomTypeKey,
        needed: need,
        available,
      };
    }
  }
  return { ok: true };
}

export async function getAvailabilityForRoomType(roomTypeKey, startDateKey, endDateKey, bookingContextOrOptions = 'stay') {
  const options =
    typeof bookingContextOrOptions === 'object' && bookingContextOrOptions !== null
      ? bookingContextOrOptions
      : { bookingContext: bookingContextOrOptions };
  return getRoomAvailability(roomTypeKey, startDateKey, endDateKey, options);
}

async function fetchAll(baseQuery, pageSize = 1000) {
  let res = await baseQuery.limit(pageSize).find();
  const items = Array.isArray(res.items) ? [...res.items] : [];
  while (res.hasNext()) {
    res = await res.next();
    if (Array.isArray(res.items) && res.items.length) items.push(...res.items);
  }
  return items;
}
