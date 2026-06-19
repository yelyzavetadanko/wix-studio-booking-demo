import { INVENTORY_KIND, ROOM_KEYS } from '../core/config';

export function normalizeRoomRow(row) {
  const roomTypeKey = row.roomTypeKey || '';
  const inventoryKind = row.inventoryKind || inferInventoryKind(roomTypeKey);
  const maxGuestsPerUnit = Number(row.maxGuestsPerUnit) || (inventoryKind === INVENTORY_KIND.BED ? 1 : roomTypeKey === ROOM_KEYS.DOUBLE ? 2 : 1);
  const baseCapacity = Number(row.baseCapacity) || 0;
  return {
    ...row,
    roomTypeKey,
    inventoryKind,
    maxGuestsPerUnit,
    baseCapacity,
    displayLabel: row.displayLabel || row.name || roomTypeKey,
  };
}

function inferInventoryKind(roomTypeKey) {
  if (roomTypeKey === ROOM_KEYS.DORM) return INVENTORY_KIND.BED;
  return INVENTORY_KIND.ROOM_UNIT;
}

export function allocationQuantityForLock(line) {
  return Number(line.quantityUnits ?? line.quantityBeds) || 0;
}
