import { ROOM_KEYS } from '../core/config.js';
import { getRoomAvailability } from '../core/availability.js';

export async function suggestRoomCombinations(guestCount, startDateKey, endDateKey) {
  const [dorm, single, double_] = await Promise.all([
    getRoomAvailability(ROOM_KEYS.DORM, startDateKey, endDateKey, { bookingContext: 'stay' }),
    getRoomAvailability(ROOM_KEYS.SINGLE, startDateKey, endDateKey, { bookingContext: 'stay' }),
    getRoomAvailability(ROOM_KEYS.DOUBLE, startDateKey, endDateKey, { bookingContext: 'stay' }),
  ]);

  const avail = {
    dorm: dorm.available,
    single: single.available,
    double: double_.available,
  };

  const g = Number(guestCount);
  const combos = buildCombinations(g, avail);
  combos.sort((a, b) => a.score - b.score);

  const out = [];
  let first = true;
  for (const c of combos) {
    out.push({
      label: c.label,
      recommended: first,
      lines: c.lines,
    });
    first = false;
  }
  return out;
}

function buildCombinations(g, a) {
  const results = [];

  function push(label, lines, score) {
    results.push({ label, lines, score });
  }

  if (g === 1) {
    if (a.single >= 1) {
      push('1 Single room', [{ roomTypeKey: ROOM_KEYS.SINGLE, quantityUnits: 1, guestsAssigned: 1 }], 1);
    }
    if (a.double >= 1) {
      push('1 Double room (private use)', [{ roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 1, guestsAssigned: 1 }], 2);
    }
    if (a.dorm >= 1) {
      push('1 Dorm bed', [{ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 1, guestsAssigned: 1 }], 3);
    }
    return results;
  }

  if (g === 2) {
    if (a.double >= 1) {
      push('1 Double room (shared)', [{ roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 1, guestsAssigned: 2 }], 1);
    }
    if (a.single >= 2) {
      push('2 Single rooms', [
        { roomTypeKey: ROOM_KEYS.SINGLE, quantityUnits: 2, guestsAssigned: 2 },
      ], 2);
    }
    if (a.dorm >= 2) {
      push('2 Dorm beds', [{ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 2, guestsAssigned: 2 }], 3);
    }
    if (a.single >= 1 && a.dorm >= 1) {
      push('1 Single + 1 Dorm bed', [
        { roomTypeKey: ROOM_KEYS.SINGLE, quantityUnits: 1, guestsAssigned: 1 },
        { roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 1, guestsAssigned: 1 },
      ], 4);
    }
    return results;
  }

  if (g === 3) {
    if (a.dorm >= 3) {
      push('3 Dorm beds', [{ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 3, guestsAssigned: 3 }], 1);
    }
    if (a.double >= 1 && a.single >= 1) {
      push('1 Double + 1 Single', [
        { roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 1, guestsAssigned: 2 },
        { roomTypeKey: ROOM_KEYS.SINGLE, quantityUnits: 1, guestsAssigned: 1 },
      ], 2);
    }
    if (a.double >= 1 && a.dorm >= 1) {
      push('1 Double + 1 Dorm Bed', [
        { roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 1, guestsAssigned: 2 },
        { roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 1, guestsAssigned: 1 },
      ], 3);
    }
    return results;
  }

  if (g === 4) {
    if (a.dorm >= 4) {
      push('4 Dorm beds', [{ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: 4, guestsAssigned: 4 }], 1);
    }
    if (a.double >= 2) {
      push('2 Double rooms', [{ roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 2, guestsAssigned: 4 }], 2);
    }
    if (a.double >= 1 && a.single >= 2) {
      push('1 Double + 2 Singles', [
        { roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: 1, guestsAssigned: 2 },
        { roomTypeKey: ROOM_KEYS.SINGLE, quantityUnits: 2, guestsAssigned: 2 },
      ], 3);
    }
    return results;
  }

  if (g >= 5) {
    const d = Math.min(a.double, Math.floor(g / 2));
    const rem = g - d * 2;
    if (d >= 1 && rem >= 0 && a.dorm >= rem && a.double >= d) {
      const lines = [];
      if (d > 0) {
        lines.push({ roomTypeKey: ROOM_KEYS.DOUBLE, quantityUnits: d, guestsAssigned: d * 2 });
      }
      if (rem > 0) {
        lines.push({ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: rem, guestsAssigned: rem });
      }
      push(`${d} Double(s) + ${rem} Dorm bed(s)`, lines, d + rem);
    }
    if (a.dorm >= g) {
      push(`${g} Dorm beds`, [{ roomTypeKey: ROOM_KEYS.DORM, quantityUnits: g, guestsAssigned: g }], g);
    }
  }

  return results;
}
