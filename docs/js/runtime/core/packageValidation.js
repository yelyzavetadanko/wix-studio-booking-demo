import wixData from '../shims/wixData.js';
import { COLLECTIONS, PACKAGE_LIMITS_FALLBACK } from '../core/config.js';
import { getRoomAvailability, getPackageSessionParticipantCount } from '../core/availability.js';
import { toDateKey } from '../core/dateUtils.js';

function nightsBetweenKeys(startDateKey, endDateKey) {
  const start = new Date(`${startDateKey}T12:00:00Z`).getTime();
  const end = new Date(`${endDateKey}T12:00:00Z`).getTime();
  if (!start || !end || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

function safePositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : fallback;
}

function normalizeDurationMode(value, fallback = 'fixed') {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'fixed' || mode === 'flexible') return mode;
  return fallback;
}

function resolveDurationRule(product, session) {
  const nightsOverride = safePositiveInt(session?.nightsOverride, 0);
  const mode = normalizeDurationMode(product?.durationMode, 'fixed');
  const defaultNights = safePositiveInt(product?.defaultNights, 0);
  const minNights = safePositiveInt(product?.minNights, 0);
  const maxNights = safePositiveInt(product?.maxNights, 0);

  if (nightsOverride > 0) {
    return {
      ok: true,
      mode: 'fixed',
      exactNights: nightsOverride,
      minNights: nightsOverride,
      maxNights: nightsOverride,
      source: 'session.nightsOverride',
    };
  }

  if (mode === 'fixed') {
    if (defaultNights <= 0) {
      return {
        ok: false,
        message: 'Package product configuration is missing defaultNights for fixed duration mode.',
      };
    }
    return {
      ok: true,
      mode,
      exactNights: defaultNights,
      minNights: defaultNights,
      maxNights: defaultNights,
      source: 'product.defaultNights',
    };
  }

  const normalizedMin = minNights > 0 ? minNights : defaultNights;
  const normalizedMax = maxNights > 0 ? maxNights : defaultNights;
  if (normalizedMin <= 0 || normalizedMax <= 0) {
    return {
      ok: false,
      message: 'Package product configuration is missing minNights/maxNights for flexible duration mode.',
    };
  }
  if (normalizedMax < normalizedMin) {
    return {
      ok: false,
      message: 'Package product configuration has invalid nights range (maxNights < minNights).',
    };
  }
  return {
    ok: true,
    mode,
    exactNights: 0,
    minNights: normalizedMin,
    maxNights: normalizedMax,
    source: 'product.minNights/maxNights',
  };
}

function validateNightsAgainstRule(nights, rule) {
  if (nights <= 0) {
    return { ok: false, message: 'Session duration must be at least 1 night.' };
  }
  if (rule.exactNights > 0 && nights !== rule.exactNights) {
    return {
      ok: false,
      message: `Session duration (${nights} nights) does not match required duration (${rule.exactNights} nights).`,
    };
  }
  if (rule.exactNights === 0 && (nights < rule.minNights || nights > rule.maxNights)) {
    return {
      ok: false,
      message: `Session duration (${nights} nights) is outside allowed range (${rule.minNights}-${rule.maxNights}).`,
    };
  }
  return { ok: true };
}

export async function getProductForSession(session) {
  const pkg = await wixData
    .query(COLLECTIONS.PACKAGE_PRODUCTS)
    .eq('packageKey', session.packageKey)
    .limit(1)
    .find();
  return pkg.items[0] || null;
}

export function getMinMaxParticipants(product) {
  if (!product) {
    return {
      min: PACKAGE_LIMITS_FALLBACK.minParticipants,
      max: PACKAGE_LIMITS_FALLBACK.maxParticipants,
    };
  }
  return {
    min: Number(product.minParticipants) || PACKAGE_LIMITS_FALLBACK.minParticipants,
    max: Number(product.maxParticipants) || PACKAGE_LIMITS_FALLBACK.maxParticipants,
  };
}

export function validateParticipantHardMax(p, max) {
  if (p > max) {
    return { ok: false, code: 'PACKAGE_CAP', message: `Maximum ${max} participants per booking.` };
  }
  return { ok: true };
}

function getCapacityPerUnit(roomTypeKey) {
  return roomTypeKey === 'double' ? 2 : 1;
}

export async function validatePackageBookingExtended(input, options = {}) {
  const { packageSessionId, participantsCount, roomTypeSelections } = input;
  const p = Number(participantsCount);
  const session = await wixData.get(COLLECTIONS.PACKAGE_SESSIONS, packageSessionId);
  if (!session || session.status !== 'open') {
    return { ok: false, code: 'SESSION_CLOSED', message: 'Package session is not available.' };
  }

  const product = await getProductForSession(session);
  const { min, max } = getMinMaxParticipants(product);

  const hard = validateParticipantHardMax(p, max);
  if (!hard.ok) return hard;

  if (!options.softMin && p < min) {
    return {
      ok: false,
      code: 'PARTICIPANT_MIN',
      message: `Minimum ${min} participants required (set softMin=true to allow with ops flag).`,
    };
  }

  const startDateKey = toDateKey(session.sessionStartDate);
  const endDateKey = toDateKey(session.sessionEndDate);
  const nights = nightsBetweenKeys(startDateKey, endDateKey);
  const durationRule = resolveDurationRule(product, session);
  if (!durationRule.ok) {
    return {
      ok: false,
      code: 'SESSION_CONFIG_INVALID',
      message: durationRule.message,
    };
  }
  const nightsCheck = validateNightsAgainstRule(nights, durationRule);
  if (!nightsCheck.ok) {
    return {
      ok: false,
      code: 'SESSION_CONFIG_INVALID',
      message: nightsCheck.message,
    };
  }

  const already = await getPackageSessionParticipantCount(packageSessionId, options.excludeBookingId);
  if (already + p > max) {
    return {
      ok: false,
      code: 'SESSION_FULL',
      message: `This session allows at most ${max} participants total (including existing bookings).`,
    };
  }

  const selected = Array.isArray(roomTypeSelections) ? roomTypeSelections : [];
  const hasAssignedGuests = selected.some((row) => row && row.guestsAssigned != null && row.guestsAssigned !== '');
  const sumAssignedGuests = selected.reduce((acc, row) => acc + Math.max(0, Number(row.guestsAssigned || 0)), 0);
  const sumSlots = selected.reduce((acc, row) => {
    const qty = Number(row.quantityUnits ?? row.quantityBeds) || 0;
    return acc + qty * getCapacityPerUnit(row.roomTypeKey);
  }, 0);
  if (hasAssignedGuests ? sumAssignedGuests !== p : sumSlots < p) {
    return {
      ok: false,
      code: 'ALLOCATION_MISMATCH',
      message: hasAssignedGuests
        ? `Assigned guests must match participants exactly (${sumAssignedGuests}/${p}).`
        : `Room capacity must cover participants (${sumSlots}/${p}).`,
    };
  }

  for (const row of selected) {
    const need = Number(row.quantityUnits ?? row.quantityBeds) || 0;
    if (need <= 0) continue;
    const roomTypeKey = row.roomTypeKey;
    if (hasAssignedGuests) {
      const assignedGuests = Math.max(0, Number(row.guestsAssigned || 0));
      const maxGuestsForLine = need * getCapacityPerUnit(roomTypeKey);
      if (assignedGuests > maxGuestsForLine) {
        return {
          ok: false,
          code: 'ALLOCATION_MISMATCH',
          message: `Assigned guests exceed selected ${roomTypeKey} capacity (${assignedGuests}/${maxGuestsForLine}).`,
          roomTypeKey,
        };
      }
    }
    const { available } = await getRoomAvailability(roomTypeKey, startDateKey, endDateKey, {
      ...options,
      bookingContext: 'package',
      packageSessionId,
    });
    if (available < need) {
      return {
        ok: false,
        code: 'NO_INVENTORY',
        message: `Not enough ${roomTypeKey} capacity for selected dates.`,
        roomTypeKey,
        needed: need,
        available,
      };
    }
  }

  const belowMin = p < min;
  return {
    ok: true,
    session,
    startDateKey,
    endDateKey,
    product,
    standardRoomTypeKey: (product && product.standardRoomTypeKey) || 'dorm',
    belowMinimumParticipants: belowMin,
    minParticipantsExpected: min,
  };
}
