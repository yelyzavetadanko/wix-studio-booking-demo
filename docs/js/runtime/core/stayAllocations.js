import { getRoomsMap } from '../core/availability';
import { ROOM_KEYS, INVENTORY_KIND } from '../core/config';
import { normalizeRoomRow } from '../core/inventoryHelpers';

export async function validateStayGuestAssignment(guestCount, lines) {
  const roomsMap = await getRoomsMap();
  let sum = 0;
  for (const line of lines || []) {
    const g = Number(line.guestsAssigned);
    const units = Number(line.quantityUnits) || 0;
    const room = roomsMap[line.roomTypeKey] || normalizeRoomRow({ roomTypeKey: line.roomTypeKey, baseCapacity: 0 });
    const maxPerUnit = room.maxGuestsPerUnit || 1;
    const maxLine = units * maxPerUnit;
    if (g < 0 || g > maxLine) {
      return {
        ok: false,
        code: 'LINE_CAPACITY',
        message: `Too many guests for ${line.roomTypeKey} allocation (max ${maxLine}).`,
        roomTypeKey: line.roomTypeKey,
      };
    }
    sum += g;
  }
  if (sum !== Number(guestCount)) {
    return {
      ok: false,
      code: 'GUEST_COUNT_MISMATCH',
      message: 'Assigned guests must equal total guest count.',
      expected: guestCount,
      actual: sum,
    };
  }
  return { ok: true };
}

export function stayLinesToRoomSelections(lines) {
  return (lines || []).map((l) => ({
    roomTypeKey: l.roomTypeKey,
    quantityUnits: l.quantityUnits,
    quantityBeds: l.quantityUnits,
    guestsAssigned: l.guestsAssigned,
  }));
}
