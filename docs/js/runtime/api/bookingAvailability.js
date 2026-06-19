import { getAvailabilityForRoomType, getPackageSessionParticipantCount } from '../core/availability.js';
import { Permissions, webMethod } from '../shims/webMethod.js';
import wixData from '../shims/wixData.js';
import { BOOKING_FLOW, COLLECTIONS, RETREAT_OCCUPIED_STATUSES } from '../core/config.js';

function toPublicImageUrl(value) {
  const extractMediaUri = (input) => {
    if (typeof input === 'string') return input.trim();
    if (!input || typeof input !== 'object') return '';
    const directCandidates = [
      input.src,
      input.url,
      input.fileUrl,
      input.image,
      input.value,
      input.mediaUrl,
      input.uri,
      input.href,
      input.original,
    ];
    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    try {
      const dump = JSON.stringify(input);
      const match = dump.match(
        /(https?:\/\/[^"\\\s]+|\/\/static\.wixstatic\.com\/[^"\\\s]+|wix:image:\/\/v1\/[^"\\]+|image:\/\/v1\/[^"\\]+|wix:vector:\/\/v1\/[^"\\]+|vector:\/\/v1\/[^"\\]+|wix:media:\/\/v1\/[^"\\]+|media:\/\/v1\/[^"\\]+)/
      );
      return match ? String(match[1] || '').trim() : '';
    } catch (_e) {
      return '';
    }
  };
  const raw = extractMediaUri(value);
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.includes('static.wixstatic.com/')) {
    return raw.startsWith('static.wixstatic.com/') ? `https://${raw}` : raw;
  }
  const normalized = raw.startsWith('image://v1/')
    ? `wix:${raw}`
    : raw.startsWith('vector://v1/')
      ? `wix:${raw}`
      : raw.startsWith('media://v1/')
        ? `wix:${raw}`
        : raw;
  if (normalized.startsWith('wix:image://v1/')) {
    const mediaId = normalized.slice('wix:image://v1/'.length).split(/[/?#]/)[0];
    if (!mediaId) return '';
    return `https://static.wixstatic.com/media/${mediaId}`;
  }
  if (normalized.startsWith('wix:vector://v1/')) {
    const shapeId = normalized.slice('wix:vector://v1/'.length).split(/[/?#]/)[0];
    if (!shapeId) return '';
    return `https://static.wixstatic.com/shapes/${shapeId}`;
  }
  if (normalized.startsWith('wix:media://v1/')) {
    const mediaId = normalized.slice('wix:media://v1/'.length).split(/[/?#]/)[0];
    if (!mediaId) return '';
    return `https://static.wixstatic.com/media/${mediaId}`;
  }
  return '';
}

function normalizeRetreatKey(value = '') {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!key) return '';
  if (key === 'dihya' || key === 'retreat_dihya' || key === 'retreat-dihya' || key.includes('dihya')) return 'dihya';
  if (key === 'anzar' || key === 'retreat_anzar' || key === 'retreat-anzar' || key.includes('anzar')) return 'anzar';
  return key;
}

async function getRetreatSessionParticipantCountLocal(sessionIds = [], excludeBookingId) {
  const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : [sessionIds]).map((x) => String(x || '').trim()))].filter(Boolean);
  if (!ids.length) return 0;
  const seen = new Set();
  let total = 0;
  for (const sessionId of ids) {
    const items = await fetchAll(
      wixData.query(COLLECTIONS.BOOKINGS).eq('retreatSessionId', sessionId).hasSome('status', RETREAT_OCCUPIED_STATUSES)
    );
    for (const b of items) {
      if (excludeBookingId && String(b.bookingId || '') === String(excludeBookingId || '')) continue;
      const uniqueId = String(b._id || b.bookingId || '');
      if (!uniqueId || seen.has(uniqueId)) continue;
      seen.add(uniqueId);
      total += Number(b.participantsCount) || Number(b.guestCount) || 0;
    }
  }
  return total;
}

function toDateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nightsBetweenKeys(startDateKey, endDateKey) {
  const start = new Date(`${startDateKey}T12:00:00Z`).getTime();
  const end = new Date(`${endDateKey}T12:00:00Z`).getTime();
  if (!start || !end || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

function packageKeyFromFlow(flow) {
  if (flow === BOOKING_FLOW.PACKAGE_BEACH_RESET) return 'BeachReset';
  if (flow === BOOKING_FLOW.PACKAGE_ROOTS_RITUAL) return 'RootsAndRitual';
  if (flow === BOOKING_FLOW.PACKAGE_SURF_SOUL) return 'SurfAndSoul';
  return '';
}

async function getPricingMapForFlow(flow) {
  const rules = await fetchAll(
    wixData.query(COLLECTIONS.PRICING_RULES).eq('isActive', true).eq('flow', flow || 'bnb')
  );
  const findRule = (chargeType, roomTypeKey, occupancyMode = '') =>
    rules.find(
      (r) =>
        (r.chargeType || '') === chargeType &&
        (r.roomTypeKey || '') === roomTypeKey &&
        (r.occupancyMode || '') === occupancyMode
    );

  const dormBase = findRule('base', 'dorm', '');
  const singleBase = findRule('base', 'single', 'single_occ');
  const singleUpgrade = findRule('upgrade', 'single', 'single_occ');
  const doubleBaseSingle = findRule('base', 'double', 'single_occ');
  const doubleBaseDouble = findRule('base', 'double', 'double_occ');
  const doubleUpgradeSingle = findRule('upgrade', 'double', 'single_occ');
  const doubleUpgradeDouble = findRule('upgrade', 'double', 'double_occ');
  const dinnerStandard = findRule('addon_dinner', '', 'single_occ');
  const dinnerDoubleSingle = findRule('addon_dinner', 'double', 'single_occ');
  const dinnerDoubleDouble = findRule('addon_dinner', 'double', 'double_occ');

  if (flow === 'surf_stay') {
    const baseDorm = Number(dormBase?.amount) || 0;
    const singleUpgradeAmount = Number(singleUpgrade?.amount) || 0;
    const doubleUpgradeSingleAmount = Number(doubleUpgradeSingle?.amount) || 0;
    const doubleUpgradeDoubleAmount = Number(doubleUpgradeDouble?.amount) || 0;
    const dinnerStandardAmount = Number(dinnerStandard?.amount) || 0;
    const dinnerDoubleSingleAmount = Number(dinnerDoubleSingle?.amount) || 0;
    const dinnerDoubleDoubleAmount = Number(dinnerDoubleDouble?.amount) || 0;
    const currency =
      dormBase?.currency ||
      singleUpgrade?.currency ||
      doubleUpgradeSingle?.currency ||
      doubleUpgradeDouble?.currency ||
      dinnerStandard?.currency ||
      'EUR';
    const singleFinal = baseDorm + singleUpgradeAmount;
    const singleWithDinner = singleFinal + dinnerStandardAmount;
    const doubleFinalFor1 = baseDorm + doubleUpgradeSingleAmount;
    const doubleFinalFor2 = baseDorm * 2 + doubleUpgradeDoubleAmount;
    const doubleWithDinnerFor1 = doubleFinalFor1 + dinnerDoubleSingleAmount;
    const doubleWithDinnerFor2 = doubleFinalFor2 + dinnerDoubleDoubleAmount;
    const dormWithDinner = baseDorm + dinnerStandardAmount;

    return {
      dorm: {
        unitPrice: baseDorm,
        currency,
        priceLabel:
          baseDorm > 0
            ? `${baseDorm} ${currency} / ${dormWithDinner} ${currency} with dinner (per guest/night)`
            : '',
        priceMode: 'base_per_guest_night',
        ruleKey: dormBase?.ruleKey || '',
      },
      single: {
        unitPrice: singleUpgradeAmount,
        currency,
        priceLabel:
          singleFinal > 0
            ? `${singleFinal} ${currency} / ${singleWithDinner} ${currency} with dinner (per guest/night)`
            : '',
        priceMode: 'upgrade_per_guest_night',
        ruleKey: singleUpgrade?.ruleKey || '',
      },
      double: {
        unitPrice: doubleUpgradeSingleAmount,
        currency,
        priceLabel:
          doubleFinalFor1 > 0 || doubleFinalFor2 > 0
            ? `${doubleFinalFor1} ${currency} for 1 / ${doubleFinalFor2} ${currency} for 2 · ${doubleWithDinnerFor1}/${doubleWithDinnerFor2} ${currency} with dinner (per room/night)`
            : '',
        priceMode: 'upgrade_per_room_night',
        ruleKey: doubleUpgradeSingle?.ruleKey || doubleUpgradeDouble?.ruleKey || '',
        singleOccPrice: doubleUpgradeSingleAmount,
        doubleOccPrice: doubleUpgradeDoubleAmount,
      },
    };
  }

  if (String(flow || '').startsWith('package_')) {
    const baseDorm = Number(dormBase?.amount) || 0;
    const singleUpgradeAmount = Number(singleUpgrade?.amount) || 0;
    const doubleUpgradeSingleAmount = Number(doubleUpgradeSingle?.amount) || 0;
    const doubleUpgradeDoubleAmount = Number(doubleUpgradeDouble?.amount) || 0;
    const currency =
      dormBase?.currency ||
      singleUpgrade?.currency ||
      doubleUpgradeSingle?.currency ||
      doubleUpgradeDouble?.currency ||
      'EUR';
    return {
      dorm: {
        unitPrice: baseDorm,
        currency,
        priceLabel: baseDorm > 0 ? `${baseDorm} ${currency} included base (per person/package)` : '',
        priceMode: 'base_per_person_package',
        ruleKey: dormBase?.ruleKey || '',
      },
      single: {
        unitPrice: singleUpgradeAmount,
        currency,
        priceLabel: singleUpgradeAmount > 0 ? `+${singleUpgradeAmount} ${currency} upgrade (per person/package)` : '',
        priceMode: 'upgrade_per_person_package',
        ruleKey: singleUpgrade?.ruleKey || '',
      },
      double: {
        unitPrice: doubleUpgradeSingleAmount,
        currency,
        priceLabel:
          doubleUpgradeSingleAmount > 0 || doubleUpgradeDoubleAmount > 0
            ? `+${doubleUpgradeSingleAmount}/${doubleUpgradeDoubleAmount} ${currency} upgrade (single/double occupancy per person/package)`
            : '',
        priceMode: 'upgrade_per_person_package',
        ruleKey: doubleUpgradeSingle?.ruleKey || doubleUpgradeDouble?.ruleKey || '',
        singleOccPrice: doubleUpgradeSingleAmount,
        doubleOccPrice: doubleUpgradeDoubleAmount,
      },
    };
  }

  return {
    dorm: {
      unitPrice: Number(dormBase?.amount) || 0,
      currency: dormBase?.currency || 'EUR',
      priceLabel: dormBase ? `${Number(dormBase.amount) || 0} ${dormBase.currency || 'EUR'} / guest / night` : '',
      priceMode: 'base_per_guest_night',
      ruleKey: dormBase?.ruleKey || '',
    },
    single: {
      unitPrice: Number(singleBase?.amount) || 0,
      currency: singleBase?.currency || 'EUR',
      priceLabel: singleBase ? `${Number(singleBase.amount) || 0} ${singleBase.currency || 'EUR'} / room / night` : '',
      priceMode: 'base_per_room_night',
      ruleKey: singleBase?.ruleKey || '',
    },
    double: {
      unitPrice: Number(doubleBaseSingle?.amount) || 0,
      currency: doubleBaseSingle?.currency || doubleBaseDouble?.currency || 'EUR',
      priceLabel:
        doubleBaseSingle && doubleBaseDouble
          ? `${Number(doubleBaseSingle.amount) || 0}/${Number(doubleBaseDouble.amount) || 0} ${
              doubleBaseSingle.currency || doubleBaseDouble.currency || 'EUR'
            } / room / night`
          : '',
      priceMode: 'base_per_room_night',
      ruleKey: doubleBaseSingle?.ruleKey || doubleBaseDouble?.ruleKey || '',
      singleOccPrice: Number(doubleBaseSingle?.amount) || 0,
      doubleOccPrice: Number(doubleBaseDouble?.amount) || 0,
    },
  };
}

async function getRoomsForUi(bookingFlow, checkIn, checkOut, bookingContext) {
  const [dorm, single, double] = await Promise.all([
    getAvailabilityForRoomType('dorm', checkIn, checkOut, bookingContext),
    getAvailabilityForRoomType('single', checkIn, checkOut, bookingContext),
    getAvailabilityForRoomType('double', checkIn, checkOut, bookingContext),
  ]);
  const pricingMap = await getPricingMapForFlow(bookingFlow);
  const roomRows = await fetchAll(wixData.query(COLLECTIONS.ROOMS));
  const roomMap = {};
  for (const row of roomRows) {
    roomMap[row.roomTypeKey] = row;
  }
  return [
    {
      roomTypeKey: 'dorm',
      title: 'Dorm bed',
      meta: `Available beds: ${dorm.available} | Shared`,
      available: dorm.available,
      image: toPublicImageUrl(roomMap.dorm?.image),
      capacityPerUnit: 1,
      unitPrice: pricingMap.dorm?.unitPrice || 0,
      currency: pricingMap.dorm?.currency || 'EUR',
      priceLabel: pricingMap.dorm?.priceLabel || '',
      priceMode: pricingMap.dorm?.priceMode || '',
      ruleKey: pricingMap.dorm?.ruleKey || '',
    },
    {
      roomTypeKey: 'single',
      title: 'Single room',
      meta: `Available units: ${single.available} | Private`,
      available: single.available,
      image: toPublicImageUrl(roomMap.single?.image),
      capacityPerUnit: 1,
      unitPrice: pricingMap.single?.unitPrice || 0,
      currency: pricingMap.single?.currency || 'EUR',
      priceLabel: pricingMap.single?.priceLabel || '',
      priceMode: pricingMap.single?.priceMode || '',
      ruleKey: pricingMap.single?.ruleKey || '',
    },
    {
      roomTypeKey: 'double',
      title: 'Double room',
      meta: `Available units: ${double.available} | Up to 2 guests per unit`,
      available: double.available,
      image: toPublicImageUrl(roomMap.double?.image),
      capacityPerUnit: 2,
      unitPrice: pricingMap.double?.unitPrice || 0,
      currency: pricingMap.double?.currency || 'EUR',
      priceLabel: pricingMap.double?.priceLabel || '',
      priceMode: pricingMap.double?.priceMode || '',
      ruleKey: pricingMap.double?.ruleKey || '',
      singleOccPrice: pricingMap.double?.singleOccPrice || 0,
      doubleOccPrice: pricingMap.double?.doubleOccPrice || 0,
    },
  ];
}

function totalGuestSlotsFromOptions(options = []) {
  return (options || []).reduce((acc, row) => {
    const cap = Math.max(1, Number(row.capacityPerUnit || 1));
    return acc + Math.max(0, Number(row.available || 0)) * cap;
  }, 0);
}

async function buildDemoFallbackRoomOptions(bookingFlow) {
  const pricingMap = await getPricingMapForFlow(bookingFlow);
  const roomRows = await fetchAll(wixData.query(COLLECTIONS.ROOMS));
  const roomMap = {};
  for (const row of roomRows) {
    roomMap[row.roomTypeKey] = row;
  }
  const fallbackAvailable = { dorm: 8, single: 2, double: 2 };
  return [
    {
      roomTypeKey: 'dorm',
      title: 'Dorm bed',
      meta: `Available beds: ${fallbackAvailable.dorm} | Shared (demo fallback)`,
      available: fallbackAvailable.dorm,
      image: toPublicImageUrl(roomMap.dorm?.image),
      capacityPerUnit: 1,
      unitPrice: pricingMap.dorm?.unitPrice || 0,
      currency: pricingMap.dorm?.currency || 'EUR',
      priceLabel: pricingMap.dorm?.priceLabel || '',
      priceMode: pricingMap.dorm?.priceMode || '',
      ruleKey: pricingMap.dorm?.ruleKey || '',
      demoFallback: true,
    },
    {
      roomTypeKey: 'single',
      title: 'Single room',
      meta: `Available units: ${fallbackAvailable.single} | Private (demo fallback)`,
      available: fallbackAvailable.single,
      image: toPublicImageUrl(roomMap.single?.image),
      capacityPerUnit: 1,
      unitPrice: pricingMap.single?.unitPrice || 0,
      currency: pricingMap.single?.currency || 'EUR',
      priceLabel: pricingMap.single?.priceLabel || '',
      priceMode: pricingMap.single?.priceMode || '',
      ruleKey: pricingMap.single?.ruleKey || '',
      demoFallback: true,
    },
    {
      roomTypeKey: 'double',
      title: 'Double room',
      meta: `Available units: ${fallbackAvailable.double} | Up to 2 guests (demo fallback)`,
      available: fallbackAvailable.double,
      image: toPublicImageUrl(roomMap.double?.image),
      capacityPerUnit: 2,
      unitPrice: pricingMap.double?.unitPrice || 0,
      currency: pricingMap.double?.currency || 'EUR',
      priceLabel: pricingMap.double?.priceLabel || '',
      priceMode: pricingMap.double?.priceMode || '',
      ruleKey: pricingMap.double?.ruleKey || '',
      singleOccPrice: pricingMap.double?.singleOccPrice || 0,
      doubleOccPrice: pricingMap.double?.doubleOccPrice || 0,
      demoFallback: true,
    },
  ];
}

export const loadStayRoomOptions = webMethod(Permissions.Anyone, async (payload) => {
  const checkIn = payload?.checkIn;
  const checkOut = payload?.checkOut;
  const bookingContext = 'stay';
  const bookingFlow = payload?.bookingFlow || 'bnb';

  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return {
      ok: false,
      message: 'Invalid dates.',
      options: [],
    };
  }

  let options = await getRoomsForUi(bookingFlow, checkIn, checkOut, bookingContext);
  if (totalGuestSlotsFromOptions(options) <= 0) {
    options = await buildDemoFallbackRoomOptions(bookingFlow);
  }
  return {
    ok: true,
    options,
  };
});

// Lightweight metadata-only loader: returns just { roomTypeKey, title, image, maxUnits, capacityPerUnit }
// for each room type. No availability checks, no pricing — used by the Custom Retreat (bespoke)
// enquiry flow where rooms are informational only and never blocked.
export const loadRoomTypeMetadata = webMethod(Permissions.Anyone, async () => {
  const roomRows = await fetchAll(wixData.query(COLLECTIONS.ROOMS));
  const roomMap = {};
  for (const row of roomRows) {
    roomMap[row.roomTypeKey] = row;
  }
  return {
    ok: true,
    options: [
      {
        roomTypeKey: 'dorm',
        title: 'Dorm bed',
        image: toPublicImageUrl(roomMap.dorm?.image),
        capacityPerUnit: 1,
        maxUnits: 8,
        unitWord: 'bed',
      },
      {
        roomTypeKey: 'single',
        title: 'Single room',
        image: toPublicImageUrl(roomMap.single?.image),
        capacityPerUnit: 1,
        maxUnits: 2,
        unitWord: 'room',
      },
      {
        roomTypeKey: 'double',
        title: 'Double room',
        image: toPublicImageUrl(roomMap.double?.image),
        capacityPerUnit: 2,
        maxUnits: 2,
        unitWord: 'room',
      },
    ],
  };
});

export const loadPackageSessionOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  const bookingFlow = String(payload.bookingFlow || '');
  const packageKey = String(payload.packageKey || packageKeyFromFlow(bookingFlow) || '').trim();

  let query = wixData.query(COLLECTIONS.PACKAGE_SESSIONS).eq('status', 'open').ascending('sessionStartDate');
  if (packageKey) query = query.eq('packageKey', packageKey);
  const sessions = await fetchAll(query);

  const productKeys = [...new Set(sessions.map((row) => String(row.packageKey || '')).filter(Boolean))];
  const productRes = productKeys.length
    ? await wixData.query(COLLECTIONS.PACKAGE_PRODUCTS).hasSome('packageKey', productKeys).limit(1000).find()
    : { items: [] };
  const productByKey = new Map((productRes.items || []).map((row) => [String(row.packageKey || ''), row]));

  const mapped = await Promise.all(
    sessions.map(async (row) => {
      const key = String(row.packageKey || '');
      const product = productByKey.get(key) || {};
      const sessionStartDateKey = toDateKey(row.sessionStartDate);
      const sessionEndDateKey = toDateKey(row.sessionEndDate);
      const minParticipants = Number(product.minParticipants || row.minParticipantsSnapshot || 0) || 0;
      const maxParticipants = Number(product.maxParticipants || row.maxParticipantsSnapshot || 0) || 0;
      const participantsBooked = await getPackageSessionParticipantCount(row._id);
      const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
      return {
        sessionId: row._id,
        packageKey: key,
        sessionStartDateKey,
        sessionEndDateKey,
        nights: nightsBetweenKeys(sessionStartDateKey, sessionEndDateKey),
        minParticipants,
        maxParticipants,
        participantsBooked,
        participantsLeft,
        isSoldOut: maxParticipants > 0 ? participantsLeft <= 0 : false,
      };
    })
  );

  return {
    ok: true,
    packageKey,
    sessions: mapped,
  };
});

export const loadPackageRoomOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  const packageSessionId = String(payload.packageSessionId || '').trim();
  const bookingFlow = String(payload.bookingFlow || '');
  if (!packageSessionId) return { ok: false, code: 'SESSION_REQUIRED', message: 'Package session is required.', options: [] };

  let session;
  try {
    session = await wixData.get(COLLECTIONS.PACKAGE_SESSIONS, packageSessionId);
  } catch (_e) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Package session not found.', options: [] };
  }
  if (!session || session.status !== 'open') {
    return { ok: false, code: 'SESSION_CLOSED', message: 'Package session is not available.', options: [] };
  }

  const checkIn = toDateKey(session.sessionStartDate);
  const checkOut = toDateKey(session.sessionEndDate);
  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return { ok: false, code: 'INVALID_SESSION_DATES', message: 'Package session dates are invalid.', options: [] };
  }

  const resolvedFlow = bookingFlow || {
    BeachReset: BOOKING_FLOW.PACKAGE_BEACH_RESET,
    RootsAndRitual: BOOKING_FLOW.PACKAGE_ROOTS_RITUAL,
    SurfAndSoul: BOOKING_FLOW.PACKAGE_SURF_SOUL,
  }[String(session.packageKey || '')] || 'package_beach_reset';
  let options = await getRoomsForUi(resolvedFlow, checkIn, checkOut, 'package');
  if (totalGuestSlotsFromOptions(options) <= 0) {
    options = await buildDemoFallbackRoomOptions(resolvedFlow);
  }

  const productRes = await wixData
    .query(COLLECTIONS.PACKAGE_PRODUCTS)
    .eq('packageKey', String(session.packageKey || ''))
    .limit(1)
    .find();
  const product = productRes.items[0] || {};
  const maxParticipants = Number(product.maxParticipants || session.maxParticipantsSnapshot || 0) || 0;
  const participantsBooked = await getPackageSessionParticipantCount(packageSessionId);
  const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
  if (maxParticipants > 0 && participantsLeft <= 0) {
    return { ok: false, code: 'SESSION_FULL', message: 'Package session is fully booked.', options: [] };
  }

  return {
    ok: true,
    packageKey: String(session.packageKey || ''),
    packageSessionId,
    checkIn,
    checkOut,
    minParticipants: Number(product.minParticipants || session.minParticipantsSnapshot || 0) || 0,
    maxParticipants,
    participantsBooked,
    participantsLeft,
    options,
  };
});

export const loadRetreatRoomOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  const retreatSessionId = String(payload.retreatSessionId || '').trim();
  if (!retreatSessionId) {
    return { ok: false, code: 'SESSION_REQUIRED', message: 'Retreat session is required.', options: [] };
  }

  let session;
  try {
    session = await wixData.get(COLLECTIONS.RETREAT_SESSIONS, retreatSessionId);
  } catch (_e) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Retreat session not found.', options: [] };
  }
  if (!session) return { ok: false, code: 'SESSION_NOT_FOUND', message: 'Retreat session not found.', options: [] };

  const status = String(session.status || '').trim().toLowerCase();
  if (status !== 'open' && status !== 'sold_out') {
    return { ok: false, code: 'SESSION_CLOSED', message: 'Retreat session is not available.', options: [] };
  }

  const checkIn = toDateKey(session.sessionStartDate);
  const checkOut = toDateKey(session.sessionEndDate);
  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return { ok: false, code: 'INVALID_SESSION_DATES', message: 'Retreat session dates are invalid.', options: [] };
  }

  const retreatKey = String(session.retreatKey || '').trim().toLowerCase();
  const productRes = retreatKey
    ? await wixData.query(COLLECTIONS.RETREAT_PRODUCTS).eq('retreatKey', retreatKey).limit(1).find()
    : { items: [] };
  const product = productRes.items[0] || {};
  const maxParticipants = Math.max(0, Number(session.maxParticipantsSnapshot || product.maxParticipantsDefault || 0));
  const participantsBooked = await getRetreatSessionParticipantCountLocal([
    String(session._id || ''),
    String(session.retreatSessionId || ''),
  ]);
  const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
  if (maxParticipants > 0 && participantsLeft <= 0) {
    return { ok: false, code: 'SESSION_FULL', message: 'Retreat session is fully booked.', options: [] };
  }

  // Retreat upgrade UI uses its own booking context so the full-house lock-out
  // applied to other flows on retreat dates does not hide single/double upgrades
  // for retreat participants themselves. Session ids scope consumption to this
  // retreat only; legacy InventoryBlocks closures are ignored in retreat context.
  const retreatSessionIds = [
    String(session._id || ''),
    String(session.retreatSessionId || ''),
    retreatSessionId,
  ].filter(Boolean);
  const retreatAvailabilityOptions = { bookingContext: 'retreat', retreatSessionIds };
  const [dorm, single, double] = await Promise.all([
    getAvailabilityForRoomType('dorm', checkIn, checkOut, retreatAvailabilityOptions),
    getAvailabilityForRoomType('single', checkIn, checkOut, retreatAvailabilityOptions),
    getAvailabilityForRoomType('double', checkIn, checkOut, retreatAvailabilityOptions),
  ]);
  const roomRows = await fetchAll(wixData.query(COLLECTIONS.ROOMS));
  const roomMap = {};
  for (const row of roomRows) roomMap[row.roomTypeKey] = row;
  const currency = String(product.currency || 'EUR').trim() || 'EUR';
  const options = [
    {
      roomTypeKey: 'dorm',
      title: 'Dorm bed',
      meta: `Available beds: ${dorm.available} | Shared`,
      available: dorm.available,
      image: toPublicImageUrl(roomMap.dorm?.image),
      capacityPerUnit: 1,
      unitPrice: Math.max(0, Number(product.basePriceDorm || 0)),
      currency,
      priceLabel: Number(product.basePriceDorm || 0) > 0 ? `${Number(product.basePriceDorm)} ${currency} included base (per person/retreat)` : '',
      priceMode: 'base_per_person_retreat',
      ruleKey: 'retreat_base_dorm',
    },
    {
      roomTypeKey: 'single',
      title: 'Single room',
      meta: `Available units: ${single.available} | Private`,
      available: single.available,
      image: toPublicImageUrl(roomMap.single?.image),
      capacityPerUnit: 1,
      unitPrice: Math.max(0, Number(product.singleUpgradePrice || 0)),
      currency,
      priceLabel:
        Number(product.singleUpgradePrice || 0) > 0 ? `+${Number(product.singleUpgradePrice)} ${currency} upgrade (per person/retreat)` : '',
      priceMode: 'upgrade_per_person_retreat',
      ruleKey: 'retreat_upgrade_single',
    },
    {
      roomTypeKey: 'double',
      title: 'Double room',
      meta: `Available units: ${double.available} | Up to 2 guests per unit`,
      available: double.available,
      image: toPublicImageUrl(roomMap.double?.image),
      capacityPerUnit: 2,
      unitPrice: Math.max(0, Number(product.doubleUpgradeSinglePrice || 0)),
      currency,
      priceLabel:
        Number(product.doubleUpgradeSinglePrice || 0) > 0 || Number(product.doubleUpgradeDoublePrice || 0) > 0
          ? `+${Number(product.doubleUpgradeSinglePrice || 0)}/${Number(product.doubleUpgradeDoublePrice || 0)} ${currency} upgrade (single/double occupancy per person/retreat)`
          : '',
      priceMode: 'upgrade_per_person_retreat',
      ruleKey: 'retreat_upgrade_double',
      singleOccPrice: Math.max(0, Number(product.doubleUpgradeSinglePrice || 0)),
      doubleOccPrice: Math.max(0, Number(product.doubleUpgradeDoublePrice || 0)),
    },
  ];

  return {
    ok: true,
    retreatKey,
    retreatSessionId,
    checkIn,
    checkOut,
    minParticipants: Math.max(0, Number(session.minParticipantsSnapshot || product.minParticipantsDefault || 0)),
    maxParticipants,
    participantsBooked,
    participantsLeft,
    options,
  };
});

export const loadRetreatEnquiryOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  try {
    const requestedRetreatKey = normalizeRetreatKey(payload.retreatKey || '');
    const requestedSessionId = String(payload.retreatSessionId || '').trim();

    const productRows = await fetchAll(wixData.query(COLLECTIONS.RETREAT_PRODUCTS).ascending('displayOrder'));
    const retreats = (Array.isArray(productRows) ? productRows : [])
      .filter((row) => row && row.isActive !== false)
      .map((row) => {
        const retreatKey = normalizeRetreatKey(row.retreatKey || row.slug || row.name || '');
        if (!retreatKey) return null;
        const includesRaw = String(row.includesBulletsJson || '').trim();
        let includes = [];
        if (includesRaw) {
          try {
            const parsed = JSON.parse(includesRaw);
            includes = Array.isArray(parsed) ? parsed.map((x) => String(x || '').trim()).filter(Boolean) : [];
          } catch (_e) {
            includes = [];
          }
        }
        const minParticipants = Math.max(0, Number(row.minParticipantsDefault || 0));
        const maxParticipants = Math.max(minParticipants, Number(row.maxParticipantsDefault || 0));
        const basePriceDorm = Math.max(0, Number(row.basePriceDorm || 0));
        const currency = String(row.currency || 'EUR').trim() || 'EUR';
        return {
          retreatKey,
          name: String(row.name || retreatKey),
          slug: String(row.slug || retreatKey),
          audienceTag: String(row.audienceTag || '').trim(),
          audienceLabel:
            String(row.audienceTag || '').trim() === 'women_only'
              ? 'Women only'
              : String(row.audienceTag || '').trim() === 'men_only'
                ? 'Men only'
                : 'Mixed group',
          audienceIcon: toPublicImageUrl(row.audienceIcon),
          cardImage: toPublicImageUrl(row.cardImage || row.heroImage),
          heroImage: toPublicImageUrl(row.heroImage),
          shortDescription: String(row.shortDescription || '').trim(),
          durationNights: Math.max(0, Number(row.durationNights || 0)),
          basePriceDorm,
          currency,
          priceLabel: basePriceDorm > 0 ? `From ${currency} ${basePriceDorm}` : '',
          minParticipantsDefault: minParticipants,
          maxParticipantsDefault: maxParticipants,
          transfersIncluded: row.transfersIncluded === true,
          mealsIncluded: row.mealsIncluded === true,
          includes,
          includesLabel:
            includes.length > 0
              ? includes.join(' · ')
              : [
                  row.mealsIncluded === true ? 'Meals included' : '',
                  row.transfersIncluded === true ? 'Transfers included' : '',
                ]
                  .filter(Boolean)
                  .join(' · '),
          paymentPolicyTextShort: String(row.paymentPolicyTextShort || '').trim(),
          paymentPolicyTextLong: String(row.paymentPolicyTextLong || '').trim(),
          cancellationPolicyText: String(row.cancellationPolicyText || '').trim(),
          lateBookingWindowDays: Math.max(0, Number(row.lateBookingWindowDays || 90)) || 90,
          isActive: true,
        };
      })
      .filter(Boolean);

    const retreatKeys = retreats.map((row) => row.retreatKey).filter(Boolean);

    const sessionRows = retreatKeys.length
      ? await fetchAll(
          wixData
            .query(COLLECTIONS.RETREAT_SESSIONS)
            .ascending('sessionStartDate')
        )
      : [];

    const sessionsRaw = await Promise.all((Array.isArray(sessionRows) ? sessionRows : [])
      .map(async (row) => {
        const fallbackFromSessionId = (() => {
          const sid = String(row.retreatSessionId || row._id || '').toLowerCase();
          const matched = retreatKeys.find((key) => sid.includes(key));
          return matched || '';
        })();
        const directRetreatKey = normalizeRetreatKey(row.retreatKey || '');
        const inferredRetreatKey = normalizeRetreatKey(fallbackFromSessionId || '');
        const retreatKey = retreatKeys.includes(directRetreatKey)
          ? directRetreatKey
          : retreatKeys.includes(inferredRetreatKey)
            ? inferredRetreatKey
            : directRetreatKey;
        if (!retreatKey || !retreatKeys.includes(retreatKey)) return null;
        const status = String(row.status || '').trim().toLowerCase() || 'open';
        if (status !== 'open' && status !== 'sold_out') return null;
        const sessionStartDateKey = toDateKey(row.sessionStartDate);
        const sessionEndDateKey = toDateKey(row.sessionEndDate);
        const maxParticipants = Math.max(0, Number(row.maxParticipantsSnapshot || 0));
        let participantsBooked = 0;
        try {
          participantsBooked = await getRetreatSessionParticipantCountLocal([
            String(row._id || ''),
            String(row.retreatSessionId || ''),
          ]);
        } catch (_e) {
          participantsBooked = 0;
        }
        const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
        const isSoldOut = status === 'sold_out' || (maxParticipants > 0 && participantsLeft <= 0);
        return {
          sessionId: String(row._id || ''),
          retreatSessionId: String(row.retreatSessionId || row._id || ''),
          retreatKey,
          sessionStartDateKey,
          sessionEndDateKey,
          nights: nightsBetweenKeys(sessionStartDateKey, sessionEndDateKey),
          status,
          minParticipants: Math.max(0, Number(row.minParticipantsSnapshot || 0)),
          maxParticipants,
          participantsBooked,
          participantsLeft,
          isSoldOut,
        };
      })
    );
    const sessions = sessionsRaw.filter((row) => row && row.retreatKey && row.sessionId);

    const sessionFromRequestedId =
      sessions.find((row) => String(row.sessionId || '') === requestedSessionId) ||
      sessions.find((row) => String(row.retreatSessionId || '') === requestedSessionId) ||
      null;
    const selectedRetreatKey = retreatKeys.includes(requestedRetreatKey)
      ? requestedRetreatKey
      : sessionFromRequestedId?.retreatKey || '';
    const selectedSessions = selectedRetreatKey
      ? sessions.filter((row) => row.retreatKey === selectedRetreatKey)
      : [];
    const selectedSession =
      selectedSessions.find((row) => row.sessionId === requestedSessionId) ||
      selectedSessions.find((row) => !row.isSoldOut) ||
      selectedSessions[0] ||
      null;

    return {
      ok: true,
      retreats,
      sessions,
      selectedRetreatKey,
      selectedSessionId: selectedSession?.sessionId || '',
    };
  } catch (e) {
    console.error('[bookingAvailability] loadRetreatEnquiryOptions failed', e);
    return {
      ok: false,
      message: `Could not load retreat options. ${e?.message ? `(${String(e.message)})` : ''}`,
    };
  }
});

async function fetchAll(baseQuery, pageSize = 1000) {
  let res = await baseQuery.limit(pageSize).find();
  const items = Array.isArray(res.items) ? [...res.items] : [];
  while (res.hasNext()) {
    res = await res.next();
    if (Array.isArray(res.items) && res.items.length) items.push(...res.items);
  }
  return items;
}

