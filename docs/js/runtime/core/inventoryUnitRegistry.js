import { ROOM_KEYS } from './config.js';

function buildUnits(prefix, count, roomTypeKey) {
  return Array.from({ length: Math.max(0, Number(count || 0)) }).map((_, idx) => {
    const n = idx + 1;
    return {
      unitId: `${prefix}_${n}`,
      roomTypeKey,
      label: `${prefix.replace(/_/g, ' ')} ${n}`,
    };
  });
}

const DORM_UNITS = buildUnits('dorm_bed', 8, ROOM_KEYS.DORM);
const SINGLE_UNITS = buildUnits('single_room', 2, ROOM_KEYS.SINGLE);
const DOUBLE_UNITS = buildUnits('double_room', 2, ROOM_KEYS.DOUBLE);

export const INVENTORY_UNIT_REGISTRY = [...DORM_UNITS, ...SINGLE_UNITS, ...DOUBLE_UNITS];

export function listInventoryUnits() {
  return INVENTORY_UNIT_REGISTRY.map((row) => ({ ...row }));
}

export function getInventoryUnitsByRoomType(roomTypeKey = '') {
  const key = String(roomTypeKey || '').trim().toLowerCase();
  return INVENTORY_UNIT_REGISTRY.filter((row) => String(row.roomTypeKey || '').trim().toLowerCase() === key).map(
    (row) => ({ ...row })
  );
}

export function getInventoryUnitById(unitId = '') {
  const target = String(unitId || '').trim().toLowerCase();
  if (!target) return null;
  const found = INVENTORY_UNIT_REGISTRY.find(
    (row) => String(row.unitId || '').trim().toLowerCase() === target
  );
  return found ? { ...found } : null;
}
