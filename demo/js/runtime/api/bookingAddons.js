import wixData from '../shims/wixData.js';
import { Permissions, webMethod } from '../shims/webMethod.js';
import { COLLECTIONS } from '../core/config.js';
import { listActivitiesForContext } from '../core/activities.js';

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  if (!start || !end || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function toPublicImageUrl(value) {
  const raw = typeof value === 'string' ? value : value?.src || '';
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (!raw.startsWith('wix:image://v1/')) return '';
  const mediaId = raw.slice('wix:image://v1/'.length).split('/')[0];
  if (!mediaId) return '';
  return `https://static.wixstatic.com/media/${mediaId}`;
}

function pickRule(rules, chargeType, roomTypeKey = '', occupancyMode = '') {
  return rules.find(
    (r) =>
      (r.chargeType || '') === chargeType &&
      (r.roomTypeKey || '') === roomTypeKey &&
      (r.occupancyMode || '') === occupancyMode
  );
}

function normalizeBookingFlow(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'bnb';
  if (key === 'retreat_dihya' || key === 'retreat_anzar' || key === 'retreat' || key === 'retreats_flow' || key === 'retreats-flow') {
    return 'retreats';
  }
  return key;
}

export const loadStayAddonOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  try {
    const bookingFlow = normalizeBookingFlow(payload.bookingFlow || 'bnb');
    const checkIn = payload.checkIn || '';
    const checkOut = payload.checkOut || '';
    const nights = nightsBetween(checkIn, checkOut);

    const pricingRes = await wixData
      .query(COLLECTIONS.PRICING_RULES)
      .eq('isActive', true)
      .eq('flow', bookingFlow)
      .limit(200)
      .find();
    const rules = pricingRes.items || [];

    const dinnerStandard = pickRule(rules, 'addon_dinner', '', 'single_occ');
    const dinnerDoubleSingle = pickRule(rules, 'addon_dinner', 'double', 'single_occ');
    const dinnerDoubleDouble = pickRule(rules, 'addon_dinner', 'double', 'double_occ');
    const transferAirport = pickRule(rules, 'addon_transfer_airport', '', '');
    const transferBus = pickRule(rules, 'addon_transfer_bus', '', '');

    const activities = await listActivitiesForContext({
      bookingFlow,
      packageKey: payload.packageKey || '',
      enquiryType: payload.enquiryType || '',
    });

    return {
      ok: true,
      nights,
      core: {
        dinner: {
          enabled:
            Number(dinnerStandard?.amount || 0) > 0 ||
            Number(dinnerDoubleSingle?.amount || 0) > 0 ||
            Number(dinnerDoubleDouble?.amount || 0) > 0,
          standardRate: Number(dinnerStandard?.amount || 0),
          doubleSingleOccRate: Number(dinnerDoubleSingle?.amount || 0),
          doubleDoubleOccRate: Number(dinnerDoubleDouble?.amount || 0),
          currency: dinnerStandard?.currency || dinnerDoubleSingle?.currency || dinnerDoubleDouble?.currency || 'EUR',
        },
        transfer: {
          enabled: Number(transferAirport?.amount || 0) > 0 || Number(transferBus?.amount || 0) > 0,
          airportRate: Number(transferAirport?.amount || 0),
          busRate: Number(transferBus?.amount || 0),
          currency: transferAirport?.currency || transferBus?.currency || 'EUR',
        },
      },
      experiences: activities.map((a) => ({
        activityKey: a.activityKey || '',
        title: a.title || '',
        categoryLabel: a.categoryLabel || a.category || '',
        priceLabel: a.priceLabel || '',
        priceFromEur: Number(a.priceFromEur || 0),
        currency: a.currency || 'EUR',
        description: a.description || '',
        notes: a.notes || '',
        durationLabel: a.durationLabel || '',
        durationMinMinutes: Number(a.durationMinMinutes || 0),
        durationMaxMinutes: Number(a.durationMaxMinutes || 0),
        ctaLabel: a.ctaLabel || '',
        ctaAction: a.ctaAction || '',
        enquiryOnly: a.enquiryOnly === true,
        timeRestriction: a.timeRestriction || '',
        image: toPublicImageUrl(a.image),
      })),
    };
  } catch (e) {
    console.error('[bookingAddons] loadStayAddonOptions failed', e);
    return {
      ok: false,
      message: `Could not load add-ons. ${e?.message ? `(${String(e.message)})` : ''}`,
      nights: nightsBetween(payload.checkIn || '', payload.checkOut || ''),
      core: { dinner: { enabled: false }, transfer: { enabled: false } },
      experiences: [],
    };
  }
});

export const loadEnquiryOptions = webMethod(Permissions.Anyone, async (payload = {}) => {
  const bookingFlow = payload.bookingFlow || 'enquiry';
  const pricingRes = await wixData
    .query(COLLECTIONS.PRICING_RULES)
    .eq('isActive', true)
    .eq('flow', 'bnb')
    .limit(200)
    .find();
  const rules = pricingRes.items || [];
  const dinnerStandard = pickRule(rules, 'addon_dinner', '', 'single_occ');
  const dinnerDoubleSingle = pickRule(rules, 'addon_dinner', 'double', 'single_occ');
  const dinnerDoubleDouble = pickRule(rules, 'addon_dinner', 'double', 'double_occ');
  const transferAirport = pickRule(rules, 'addon_transfer_airport', '', '');
  const transferBus = pickRule(rules, 'addon_transfer_bus', '', '');

  const activities = await listActivitiesForContext({
    bookingFlow,
    packageKey: payload.packageKey || '',
  });

  return {
    ok: true,
    core: {
      dinner: {
        enabled:
          Number(dinnerStandard?.amount || 0) > 0 ||
          Number(dinnerDoubleSingle?.amount || 0) > 0 ||
          Number(dinnerDoubleDouble?.amount || 0) > 0,
        standardRate: Number(dinnerStandard?.amount || 0),
        doubleSingleOccRate: Number(dinnerDoubleSingle?.amount || 0),
        doubleDoubleOccRate: Number(dinnerDoubleDouble?.amount || 0),
        currency: dinnerStandard?.currency || dinnerDoubleSingle?.currency || dinnerDoubleDouble?.currency || 'EUR',
      },
      transfer: {
        enabled: Number(transferAirport?.amount || 0) > 0 || Number(transferBus?.amount || 0) > 0,
        airportRate: Number(transferAirport?.amount || 0),
        busRate: Number(transferBus?.amount || 0),
        currency: transferAirport?.currency || transferBus?.currency || 'EUR',
      },
    },
    experiences: activities.map((a) => ({
      activityKey: a.activityKey || '',
      title: a.title || '',
      categoryLabel: a.categoryLabel || a.category || '',
      priceLabel: a.priceLabel || '',
      priceFromEur: Number(a.priceFromEur || 0),
      currency: a.currency || 'EUR',
      description: a.description || '',
      notes: a.notes || '',
      durationLabel: a.durationLabel || '',
      durationMinMinutes: Number(a.durationMinMinutes || 0),
      durationMaxMinutes: Number(a.durationMaxMinutes || 0),
      ctaLabel: a.ctaLabel || '',
      ctaAction: a.ctaAction || '',
      enquiryOnly: a.enquiryOnly === true,
      timeRestriction: a.timeRestriction || '',
      image: toPublicImageUrl(a.image),
    })),
  };
});
