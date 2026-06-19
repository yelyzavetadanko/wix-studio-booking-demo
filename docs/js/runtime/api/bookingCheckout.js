import wixData from '../shims/wixData.js';
import { startCheckoutPackage, startCheckoutStay, submitEnquiry as createEnquiry } from '../core/checkout.js';
import { releaseLocksByBookingDraftId } from '../core/locks.js';
import { COLLECTIONS, BOOKING_STATUS } from '../core/config.js';
import { sendAdminBookingEmail } from '../core/bookingNotifications.js';
import { sendGuestBookingAcknowledgement } from '../core/guestNotifications.js';
import { Permissions, webMethod } from '../shims/webMethod.js';
import { getActivitiesByKeys, validateActivityKeys } from '../core/activities.js';
import { dateKeyToDate, toDateKey as toDateKeyNormalized } from '../core/dateUtils.js';
import { validateRoomOnlyBooking } from '../core/availability.js';
import { validateStayGuestAssignment } from '../core/stayAllocations.js';
import { sendLead as sendCapiLead } from '../core/metaCapi.js';

const BOOKING_CHECKOUT_CONTRACT_VERSION = 'bookingCheckout.web@2026-05-03-v5';

function isObjectLike(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonSafe(input, fallback = {}) {
  if (input == null || input === '') return fallback;
  if (typeof input === 'object') return input;
  try {
    const parsed = JSON.parse(String(input));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch (_e) {
    return fallback;
  }
}

function invalidInternalResult(contractVersion, stage, result, expectedRefKey = 'bookingId') {
  return {
    ok: false,
    contractVersion,
    code: 'INVALID_INTERNAL_RESULT',
    message: `Internal step "${stage}" returned an invalid result shape.`,
    stage,
    expectedRefKey,
    internalResultType: result == null ? String(result) : typeof result,
    internalResultKeys: isObjectLike(result) ? Object.keys(result) : [],
  };
}

function toDateKey(dateStr) {
  return toDateKeyNormalized(dateStr);
}

function flowFromPackageKey(packageKey = '') {
  if (packageKey === 'BeachReset') return 'package_beach_reset';
  if (packageKey === 'RootsAndRitual') return 'package_roots_ritual';
  if (packageKey === 'SurfAndSoul') return 'package_surf_soul';
  return '';
}

/* ------------------------------------------------------------------ */
/* Meta Conversions API — Lead event hook                              */
/* ------------------------------------------------------------------ */

// Tracking fields the frontend collects from the browser at submit time
// (fbp/fbc cookies, externalId UUID cookie, current URL, navigator.userAgent,
// pre-generated leadEventId). They are persisted alongside the booking so we
// can replay the same matching signals when Purchase fires server-side later.
function extractCapiTrackingFields(payload = {}) {
  const t = (payload && payload.capiTracking) || {};
  const ts = (v) => (v == null ? '' : String(v).trim());
  return {
    capiFbp: ts(t.fbp),
    capiFbc: ts(t.fbc),
    capiExternalId: ts(t.externalId),
    capiClientUserAgent: ts(t.clientUserAgent),
    capiClientIpAddress: ts(t.clientIpAddress), // not available from webMethod context; reserved for future
    capiEventSourceUrl: ts(t.eventSourceUrl),
    capiLeadEventId: ts(t.leadEventId),
    capiLeadEventTime: t.leadEventTime ? new Date(t.leadEventTime) : new Date(),
  };
}

// Look up the row in the right collection based on entityType.
// Used by persistCapiTrackingAndFireLead — bookings live in BOOKINGS,
// enquiries (no inventory hold) in ENQUIRIES.
async function findRowForCapiTracking(entityType, referenceId) {
  const id = String(referenceId || '').trim();
  if (!id) return { row: null, collection: '' };

  if (entityType === 'enquiry') {
    try {
      const q = await wixData.query(COLLECTIONS.ENQUIRIES).eq('enquiryId', id).limit(1).find();
      return { row: q.items?.[0] || null, collection: COLLECTIONS.ENQUIRIES };
    } catch (_e) {
      return { row: null, collection: COLLECTIONS.ENQUIRIES };
    }
  }

  // default: booking
  try {
    const row = await getBookingByBusinessId(id);
    return { row: row || null, collection: COLLECTIONS.BOOKINGS };
  } catch (_e) {
    return { row: null, collection: COLLECTIONS.BOOKINGS };
  }
}

// Persist CAPI tracking on the booking/enquiry row + fire Lead via backend CAPI.
// This is a best-effort step — failures must never break the booking flow,
// which is why every operation is wrapped in try/catch with warn logging.
async function persistCapiTrackingAndFireLead({
  entityType = 'booking',
  referenceId,
  payload,
}) {
  if (!referenceId) return;
  const capi = extractCapiTrackingFields(payload);
  const leadData = (payload && payload.capiLeadData) || {};

  try {
    const { row, collection } = await findRowForCapiTracking(entityType, referenceId);
    if (row && collection) {
      const safeRow = normalizeBookingRowForUpdate(row);
      await wixData.update(collection, {
        ...safeRow,
        ...capi,
        updatedAt: new Date(),
      });
    }
  } catch (e) {
    console.warn('[bookingCheckout] persistCapiTracking failed', {
      entityType,
      referenceId,
      error: e && e.message ? e.message : String(e),
    });
  }

  if (!capi.capiLeadEventId) return;

  try {
    await sendCapiLead({
      eventId: capi.capiLeadEventId,
      eventSourceUrl: capi.capiEventSourceUrl,
      eventTime: Math.floor(Date.now() / 1000),
      // PII straight from the booking submission
      email: payload && payload.guestEmail,
      phone: payload && payload.guestPhone,
      fullName: payload && payload.guestName,
      // Matching params captured at submit time
      externalId: capi.capiExternalId,
      fbp: capi.capiFbp,
      fbc: capi.capiFbc,
      clientUserAgent: capi.capiClientUserAgent,
      clientIpAddress: capi.capiClientIpAddress,
      // Order/e-commerce custom_data computed by the frontend from
      // pricingSnapshot and current selection.
      orderId: referenceId,
      currency: leadData.currency || 'EUR',
      value: leadData.value,
      contentType: 'product',
      contentCategory: leadData.contentCategory || '',
      contentName: leadData.contentName || '',
      contentIds: Array.isArray(leadData.contentIds) ? leadData.contentIds : [],
      contents: Array.isArray(leadData.contents) ? leadData.contents : null,
      numItems: leadData.numItems,
    });
  } catch (e) {
    console.warn('[bookingCheckout] sendCapiLead failed', {
      entityType,
      referenceId,
      error: e && e.message ? e.message : String(e),
    });
  }
}

async function resolvePackageTitle(packageKey = '') {
  const key = String(packageKey || '').trim();
  if (!key) return '';
  try {
    const q = await wixData.query(COLLECTIONS.PACKAGE_PRODUCTS).eq('packageKey', key).limit(1).find();
    const row = q.items?.[0] || null;
    return String(row?.title || row?.name || key).trim();
  } catch (_e) {
    return key;
  }
}

function normalizeEnquiryType(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'custom_package' || raw === 'custompackage' || raw === 'custom-package') return 'custom_package';
  if (raw === 'custom_retreat' || raw === 'customretreat' || raw === 'custom-retreat') return 'custom_retreat';
  if (raw === 'activity_enquiry' || raw === 'activity' || raw === 'activity-request') return 'activity_enquiry';
  return raw;
}

function asDateOrNull(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @param {any} row
 * @returns {any}
 */
function normalizeBookingRowForUpdate(row = {}) {
  return {
    ...row,
    startDate: asDateOrNull(row.startDate),
    endDate: asDateOrNull(row.endDate),
    createdAt: asDateOrNull(row.createdAt),
    updatedAt: asDateOrNull(row.updatedAt),
    holdExpiresAt: asDateOrNull(row.holdExpiresAt),
    adminEmailSentAt: asDateOrNull(row.adminEmailSentAt),
  };
}

function normalizeExperienceRequests(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((row) => ({
      activityKey: String(row?.activityKey || row?.key || '').trim(),
      title: String(row?.title || row?.label || row?.activityKey || '').trim(),
      preferredDate: String(
        row?.preferredDate ||
          row?.activityDate ||
          row?.date ||
          row?.selectedDate ||
          row?.requestedDate ||
          ''
      ).trim(),
      notes: String(row?.notes || '').trim(),
      lessonFormat: String(row?.lessonFormat || '').trim(),
      priceLabel: String(row?.priceLabel || '').trim(),
      priceFromEur: Number(row?.priceFromEur || 0) || 0,
      effectivePriceEur: Number(row?.effectivePriceEur || 0) || 0,
      currency: String(row?.currency || '').trim().toUpperCase() || 'EUR',
    }))
    .filter((row) => !!row.activityKey);
}

function resolveActivityEffectivePriceEur(priceLabel = '', priceFromEur = 0) {
  const label = String(priceLabel || '').trim();
  const fallback = Number(priceFromEur || 0) || 0;
  if (!label) return fallback;
  const match = label.match(/(\d+(?:\.\d+)?)\s*EUR/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function activitySupportsLessonFormat(activityKey = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  return key === 'surf-lesson-beginner' || key === 'surf-lesson-intermediate';
}

function isActivityIncludedInBase(activityKey = '', bookingFlow = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  const flow = String(bookingFlow || '').trim().toLowerCase();
  if (flow === 'surf_stay' && key === 'surf-lesson-beginner') return true;
  return false;
}

function appendExperienceEstimateLines(lines = [], experienceRequests = [], guests = 0, bookingFlow = '') {
  const guestQty = Math.max(1, Number(guests || 0));
  const list = Array.isArray(experienceRequests) ? experienceRequests : [];
  let added = 0;
  for (const exp of list) {
    const activityKey = String(exp?.activityKey || '').trim();
    if (!activityKey) continue;
    if (isActivityIncludedInBase(activityKey, bookingFlow)) continue;
    const unit = Number(exp?.effectivePriceEur || exp?.priceFromEur || 0);
    if (!(unit > 0)) continue;
    const lineTotal = unit * guestQty;
    lines.push({
      key: `addon_activity_${activityKey}`,
      label: `${String(exp?.title || activityKey).trim()} (estimate)`,
      qty: guestQty,
      unitPrice: unit,
      currency: String(exp?.currency || 'EUR').trim() || 'EUR',
      total: lineTotal,
      estimateOnly: true,
      preferredDate: String(exp?.preferredDate || '').trim(),
      priceLabel: String(exp?.priceLabel || '').trim(),
    });
    added += lineTotal;
  }
  return added;
}

function pickPriceLabelForLessonFormat(priceLabel = '', lessonFormat = '', activityKey = '') {
  const normalizedPriceLabel = String(priceLabel || '').trim();
  if (!normalizedPriceLabel) return '';
  if (!activitySupportsLessonFormat(activityKey)) return normalizedPriceLabel;
  const segments = normalizedPriceLabel.split('|').map((x) => String(x || '').trim()).filter(Boolean);
  if (!segments.length) return normalizedPriceLabel;
  const isExtended = String(lessonFormat || '').trim().toLowerCase() === 'extended';
  if (isExtended) {
    return segments.find((x) => x.toLowerCase().includes('extended')) || normalizedPriceLabel;
  }
  return (
    segments.find((x) => x.toLowerCase().includes('2-hour')) ||
    segments.find((x) => !x.toLowerCase().includes('extended')) ||
    normalizedPriceLabel
  );
}

function normalizeActivityRequestKeys(list = []) {
  const keys = Array.isArray(list) ? list : [];
  return [...new Set(keys.map((key) => String(key || '').trim()))].filter(Boolean);
}

function normalizeRoomSelectionsForHold(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((row) => ({
      roomTypeKey: String(row?.roomTypeKey || '').trim().toLowerCase(),
      quantityUnits: Math.max(0, Number(row?.quantityUnits ?? row?.quantity ?? 0)),
    }))
    .filter((row) => row.roomTypeKey && row.quantityUnits > 0);
}

async function getRetreatSessionByAnyId(retreatSessionId = '') {
  const target = String(retreatSessionId || '').trim();
  if (!target) return null;
  let row = await wixData.get(COLLECTIONS.RETREAT_SESSIONS, target).catch(() => null);
  if (row) return row;
  const q = await wixData.query(COLLECTIONS.RETREAT_SESSIONS).eq('retreatSessionId', target).limit(1).find();
  row = q.items?.[0] || null;
  return row;
}

async function ensureRetreatEnquiryInventoryHold({
  enquiryId = '',
  guestName = '',
  guestEmail = '',
  guestPhone = '',
  retreatSessionId = '',
  roomSelections = [],
  guests = 0,
}) {
  const businessId = String(enquiryId || '').trim();
  if (!businessId) return { ok: false, message: 'Missing enquiryId.' };
  const normalizedSelections = normalizeRoomSelectionsForHold(roomSelections);
  if (!normalizedSelections.length) return { ok: false, message: 'Room selections are required for retreat hold.' };
  const existing = await wixData.query(COLLECTIONS.BOOKINGS).eq('bookingId', businessId).limit(1).find();
  if (existing.items?.[0]) return { ok: true, bookingId: businessId, alreadyExists: true };
  const session = await getRetreatSessionByAnyId(retreatSessionId);
  if (!session) return { ok: false, message: 'Retreat session not found for hold.' };
  const startDateKey = toDateKey(session.sessionStartDate);
  const endDateKey = toDateKey(session.sessionEndDate);
  const startDate = dateKeyToDate(startDateKey, 12);
  const endDate = dateKeyToDate(endDateKey, 12);
  if (!startDateKey || !endDateKey || !startDate || !endDate) {
    return { ok: false, message: 'Retreat session dates are invalid for hold.' };
  }
  // Retreat hold uses its own booking context so the retreat session's own
  // full-house lock-out does not block participants from being held into the
  // very session it represents.
  const retreatSessionIds = [
    String(session.retreatSessionId || ''),
    String(session._id || ''),
    String(retreatSessionId || ''),
  ].filter(Boolean);
  const availabilityCheck = await validateRoomOnlyBooking(
    {
      startDateKey,
      endDateKey,
      roomTypeSelections: normalizedSelections,
    },
    { excludeBookingId: businessId, bookingContext: 'retreat', retreatSessionIds }
  );
  if (!availabilityCheck?.ok) return availabilityCheck;
  await wixData.insert(COLLECTIONS.BOOKINGS, {
    bookingId: businessId,
    bookingType: 'retreat',
    bookingFlow: 'retreats',
    retreatSessionId: String(session.retreatSessionId || session._id || retreatSessionId || '').trim(),
    guestName: String(guestName || '').trim(),
    guestEmail: String(guestEmail || '').trim(),
    guestPhone: String(guestPhone || '').trim(),
    guestCount: Math.max(0, Number(guests || 0)),
    participantsCount: Math.max(0, Number(guests || 0)),
    startDate,
    endDate,
    roomTypeSelections: JSON.stringify(normalizedSelections),
    status: BOOKING_STATUS.PENDING_ADMIN_REVIEW,
    adminPaymentRequired: true,
    adminNotes: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ok: true, bookingId: businessId };
}

function mergeExperienceRequestMeta(requests = [], activities = []) {
  const byKey = new Map((activities || []).map((row) => [String(row.activityKey || ''), row]));
  const cleaned = normalizeExperienceRequests(requests);
  const merged = normalizeActivityRequestKeys(
    cleaned.map((row) => row.activityKey).concat((activities || []).map((row) => row.activityKey))
  ).map((key) => {
    const request = /** @type {any} */ (cleaned.find((row) => row.activityKey === key) || {});
    const activity = /** @type {any} */ (byKey.get(key) || {});
    const lessonFormat = String(request.lessonFormat || '').trim();
    const rawPriceLabel = String(activity.priceLabel || request.priceLabel || '').trim();
    const resolvedPriceLabel = pickPriceLabelForLessonFormat(rawPriceLabel, lessonFormat, key);
    const priceFromEur = Number(activity.priceFromEur || request.priceFromEur || 0) || 0;
    const effectivePriceEur =
      Number(request.effectivePriceEur || 0) > 0
        ? Number(request.effectivePriceEur)
        : resolveActivityEffectivePriceEur(resolvedPriceLabel, priceFromEur);
    return {
      activityKey: key,
      title: request.title || activity.title || key,
      preferredDate: request.preferredDate || '',
      notes: request.notes || '',
      category: activity.category || '',
      categoryLabel: activity.categoryLabel || activity.category || '',
      priceLabel: resolvedPriceLabel,
      priceFromEur,
      effectivePriceEur,
      currency: String(activity.currency || request.currency || 'EUR').toUpperCase() || 'EUR',
      lessonFormat,
      timeRestriction: activity.timeRestriction || '',
    };
  });
  return merged;
}

function buildCoreAddonRequestRows(bookingId, coreAddons = {}) {
  const rows = [];
  const now = new Date();
  if (coreAddons?.dinner) {
    rows.push({
      bookingId,
      addonType: 'core_dinner',
      addonKey: 'dinner',
      title: 'Dinner add-on',
      quantity: null,
      unitPriceSnapshot: Number(coreAddons.dinnerStandardRate || 0) || null,
      pricingMode: 'integrated',
      status: 'requested',
      metaJson: JSON.stringify({ coreAddons }),
      createdAt: now,
      updatedAt: now,
    });
  }
  const transferTypes = getSelectedTransferTypes(coreAddons || {});
  for (const transferType of transferTypes) {
    rows.push({
      bookingId,
      addonType: transferType === 'airport' ? 'core_transfer_airport' : 'core_transfer_bus',
      addonKey: transferType,
      title: transferType === 'airport' ? 'Airport transfer' : 'Bus transfer',
      quantity: getTransferVehiclesByType(transferType, coreAddons || {}),
      unitPriceSnapshot:
        transferType === 'airport'
          ? Number(coreAddons?.transferAirportRate || 0) || null
          : Number(coreAddons?.transferBusRate || 0) || null,
      pricingMode: 'integrated',
      status: 'requested',
      metaJson: JSON.stringify({ coreAddons }),
      createdAt: now,
      updatedAt: now,
    });
  }
  return rows;
}

function buildExperienceRequestRows(bookingId, requests = []) {
  const now = new Date();
  return normalizeExperienceRequests(requests).map((row) => ({
    bookingId,
    addonType: 'experience_activity',
    addonKey: row.activityKey,
    title: row.title || row.activityKey,
    quantity: null,
    unitPriceSnapshot: null,
    pricingMode: 'external_manual',
    status: 'requested',
    metaJson: JSON.stringify({ notes: row.notes || '', preferredDate: row.preferredDate || '' }),
    createdAt: now,
    updatedAt: now,
  }));
}

async function writeAddonRequests(bookingId, payload = {}) {
  const coreRows = buildCoreAddonRequestRows(bookingId, payload.coreAddons || {});
  const experienceRows = buildExperienceRequestRows(bookingId, payload.experienceRequests || []);
  const rows = [...coreRows, ...experienceRows];
  for (const row of rows) {
    await wixData.insert(COLLECTIONS.BOOKING_ADDON_REQUESTS, row);
  }
}

async function getBookingByBusinessId(bookingId) {
  const q = await wixData.query(COLLECTIONS.BOOKINGS).eq('bookingId', bookingId).limit(1).find();
  return q.items[0] || null;
}

async function sendAdminBookingEmailSafe(params = {}) {
  try {
    return await sendAdminBookingEmail(params);
  } catch (e) {
    return {
      ok: false,
      code: 'ADMIN_NOTIFICATION_UNHANDLED',
      message: e?.message || 'Unhandled admin notification failure',
    };
  }
}

async function sendGuestAcknowledgementSafe(params = {}) {
  try {
    return await sendGuestBookingAcknowledgement(params);
  } catch (e) {
    return {
      ok: false,
      code: 'GUEST_NOTIFICATION_UNHANDLED',
      message: e?.message || 'Unhandled guest notification failure',
    };
  }
}

function nightsBetween(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  if (!start || !end || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

async function getPricingRules(flow) {
  const res = await wixData
    .query(COLLECTIONS.PRICING_RULES)
    .eq('isActive', true)
    .eq('flow', flow || 'bnb')
    .limit(200)
    .find();
  return res.items || [];
}

function pickRule(rules, chargeType, roomTypeKey, occupancyMode = '') {
  return rules.find(
    (r) =>
      (r.chargeType || '') === chargeType &&
      (r.roomTypeKey || '') === roomTypeKey &&
      (r.occupancyMode || '') === occupancyMode
  );
}

function getCapacityPerUnit(roomTypeKey) {
  return roomTypeKey === 'double' ? 2 : 1;
}

function getSelectedTransferTypes(coreAddons = {}) {
  const list = Array.isArray(coreAddons.transferTypes) ? coreAddons.transferTypes : [];
  const normalized = [...new Set(list.map((item) => String(item || '').toLowerCase()))].filter(
    (item) => item === 'airport' || item === 'bus'
  );
  if (normalized.length > 0) return normalized;
  const fallback = String(coreAddons.transferType || '').toLowerCase();
  if (fallback === 'airport' || fallback === 'bus') return [fallback];
  return [];
}

// Returns the number of vehicles requested for a specific transfer type.
// - When only one transfer type is selected, the legacy aggregate `transferVehicles`
//   field carries the count (each selected vehicle is of that single type).
// - When both types are selected (split arrivals), each type uses its own per-type
//   field (`transferAirportVehicles` / `transferBusVehicles`) so pricing becomes
//   `rate_airport * airportVehicles + rate_bus * busVehicles`. Each visible type
//   defaults to a minimum of 1 because the user explicitly selected it.
function getTransferVehiclesByType(type, coreAddons = {}) {
  const types = getSelectedTransferTypes(coreAddons);
  if (!types.includes(type)) return 0;
  if (types.length >= 2) {
    const raw = type === 'airport'
      ? Number(coreAddons.transferAirportVehicles || 0)
      : Number(coreAddons.transferBusVehicles || 0);
    return Math.max(1, Math.round(raw || 1));
  }
  return Math.max(1, Math.round(Number(coreAddons.transferVehicles || 1)));
}

function stayLinesToRoomTypeSelections(stayLines = []) {
  return (stayLines || []).map((row) => ({
    roomTypeKey: row.roomTypeKey,
    quantityUnits: Number(row.quantityUnits || 0),
  }));
}

async function validateExactCapacity(payload) {
  const guestCount = Number(payload?.guests || payload?.participants || 0);
  const stayLines = Array.isArray(payload?.stayLines) ? payload.stayLines : [];
  if (guestCount <= 0 || !stayLines.length) {
    return {
      ok: false,
      code: 'CAPACITY_MISMATCH',
      message: 'Please select rooms for all guests.',
    };
  }
  const hasAssigned = stayLines.some((row) => row && row.guestsAssigned != null && row.guestsAssigned !== '');
  if (!hasAssigned) {
    const slots = stayLines.reduce((acc, row) => {
      const qty = Number(row.quantityUnits || 0);
      return acc + qty * getCapacityPerUnit(row.roomTypeKey);
    }, 0);
    if (slots < guestCount) {
      return {
        ok: false,
        code: 'CAPACITY_MISMATCH',
        message: `Selected room capacity must cover all guests (${slots}/${guestCount}).`,
      };
    }
    return { ok: true };
  }
  const normalizedLines = stayLines.map((row) => ({
    roomTypeKey: String(row?.roomTypeKey || '').trim().toLowerCase(),
    quantityUnits: Math.max(0, Number(row?.quantityUnits || row?.quantity || 0)),
    guestsAssigned: Math.max(0, Number(row?.guestsAssigned || 0)),
  }));
  return await validateStayGuestAssignment(guestCount, normalizedLines);
}

async function buildStayPricingSnapshot(payload) {
  const flow = payload.bookingFlow || 'bnb';
  const nights = nightsBetween(payload.checkIn, payload.checkOut);
  const guests = Number(payload.guests || 0);
  const stayLines = Array.isArray(payload.stayLines) ? payload.stayLines : [];
  const rules = await getPricingRules(flow);
  const byKey = new Map(stayLines.map((r) => [r.roomTypeKey, r]));
  const core = payload.coreAddons || {};
  const lines = [];
  let total = 0;

  if (flow === 'surf_stay') {
    const dormBase = pickRule(rules, 'base', 'dorm', '');
    const basePrice = Number(dormBase?.amount || 0);
    if (basePrice > 0 && guests > 0) {
      const lineTotal = basePrice * guests * nights;
      lines.push({
        key: 'surf_base',
        label: 'Surf & Stay base',
        qty: guests,
        nights,
        unitPrice: basePrice,
        currency: dormBase?.currency || 'EUR',
        total: lineTotal,
        ruleKey: dormBase?.ruleKey || '',
      });
      total += lineTotal;
    }

    const singleLine = byKey.get('single');
    const singleUpgrade = pickRule(rules, 'upgrade', 'single', 'single_occ');
    const singleGuests = Number(singleLine?.guestsAssigned || 0);
    const singleUpgradePrice = Number(singleUpgrade?.amount || 0);
    if (singleGuests > 0 && singleUpgradePrice > 0) {
      const lineTotal = singleGuests * singleUpgradePrice * nights;
      lines.push({
        key: 'surf_upgrade_single',
        label: 'Single room upgrade',
        qty: singleGuests,
        nights,
        unitPrice: singleUpgradePrice,
        currency: singleUpgrade?.currency || 'EUR',
        total: lineTotal,
        ruleKey: singleUpgrade?.ruleKey || '',
      });
      total += lineTotal;
    }

    const doubleLine = byKey.get('double');
    const doubleQty = Number(doubleLine?.quantityUnits || 0);
    if (doubleQty > 0) {
      const assigned = Math.max(0, Number(doubleLine?.guestsAssigned || 0));
      const doubleSingle = pickRule(rules, 'upgrade', 'double', 'single_occ');
      const doubleDouble = pickRule(rules, 'upgrade', 'double', 'double_occ');
      const singleOccPrice = Number(doubleSingle?.amount || 0);
      const doubleOccPrice = Number(doubleDouble?.amount || 0);
      const doubleOccRooms = Math.min(doubleQty, Math.floor(assigned / 2));
      const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
      const lineTotal = nights * (singleOccRooms * singleOccPrice + doubleOccRooms * doubleOccPrice);
      lines.push({
        key: 'surf_upgrade_double',
        label: 'Double room upgrade',
        qty: doubleQty,
        nights,
        singleOccRooms,
        doubleOccRooms,
        singleOccPrice,
        doubleOccPrice,
        currency: doubleSingle?.currency || doubleDouble?.currency || 'EUR',
        total: lineTotal,
        ruleKeySingleOcc: doubleSingle?.ruleKey || '',
        ruleKeyDoubleOcc: doubleDouble?.ruleKey || '',
      });
      total += lineTotal;
    }
  } else {
    const dormLine = byKey.get('dorm');
    if (dormLine) {
      const dormRule = pickRule(rules, 'base', 'dorm', '');
      const qty = Number(dormLine.quantityUnits || 0);
      const rate = Number(dormRule?.amount || 0);
      const lineTotal = qty * rate * nights;
      lines.push({
        key: 'bnb_base_dorm',
        label: 'Dorm bed',
        qty,
        nights,
        unitPrice: rate,
        currency: dormRule?.currency || 'EUR',
        total: lineTotal,
        ruleKey: dormRule?.ruleKey || '',
      });
      total += lineTotal;
    }

    const singleLine = byKey.get('single');
    if (singleLine) {
      const singleRule = pickRule(rules, 'base', 'single', 'single_occ');
      const qty = Number(singleLine.quantityUnits || 0);
      const rate = Number(singleRule?.amount || 0);
      const lineTotal = qty * rate * nights;
      lines.push({
        key: 'bnb_base_single',
        label: 'Single room',
        qty,
        nights,
        unitPrice: rate,
        currency: singleRule?.currency || 'EUR',
        total: lineTotal,
        ruleKey: singleRule?.ruleKey || '',
      });
      total += lineTotal;
    }

    const doubleLine = byKey.get('double');
    if (doubleLine) {
      const qty = Number(doubleLine.quantityUnits || 0);
      const assigned = Math.max(0, Number(doubleLine.guestsAssigned || 0));
      const singleOcc = pickRule(rules, 'base', 'double', 'single_occ');
      const doubleOcc = pickRule(rules, 'base', 'double', 'double_occ');
      const singleOccPrice = Number(singleOcc?.amount || 0);
      const doubleOccPrice = Number(doubleOcc?.amount || 0);
      const doubleOccRooms = Math.min(qty, Math.floor(assigned / 2));
      const singleOccRooms = Math.max(0, qty - doubleOccRooms);
      const lineTotal = nights * (singleOccRooms * singleOccPrice + doubleOccRooms * doubleOccPrice);
      lines.push({
        key: 'bnb_base_double',
        label: 'Double room',
        qty,
        nights,
        singleOccRooms,
        doubleOccRooms,
        singleOccPrice,
        doubleOccPrice,
        currency: singleOcc?.currency || doubleOcc?.currency || 'EUR',
        total: lineTotal,
        ruleKeySingleOcc: singleOcc?.ruleKey || '',
        ruleKeyDoubleOcc: doubleOcc?.ruleKey || '',
      });
      total += lineTotal;
    }
  }

  if (core.dinner) {
    const dinnerStandard = Number(core.dinnerStandardRate || 0);
    const dinnerDoubleSingle = Number(core.dinnerDoubleSingleOccRate || 0);
    const dinnerDoubleDouble = Number(core.dinnerDoubleDoubleOccRate || 0);
    const doubleLine = byKey.get('double');
    const doubleQty = Number(doubleLine?.quantityUnits || 0);
    const assignedDouble = Math.max(0, Number(doubleLine?.guestsAssigned || 0));
    const doubleOccRooms = Math.min(doubleQty, Math.floor(assignedDouble / 2));
    const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
    const nonDoubleGuests = Math.max(0, guests - assignedDouble);
    const dinnerTotal =
      nights * (nonDoubleGuests * dinnerStandard + singleOccRooms * dinnerDoubleSingle + doubleOccRooms * dinnerDoubleDouble);
    if (dinnerTotal > 0) {
      lines.push({
        key: 'addon_dinner',
        label: 'Dinner add-on',
        nights,
        currency: core.currency || 'EUR',
        total: dinnerTotal,
      });
      total += dinnerTotal;
    }
  }

  const transferTypes = getSelectedTransferTypes(core);
  if (transferTypes.length > 0) {
    for (const transferType of transferTypes) {
      const rate = transferType === 'airport' ? Number(core.transferAirportRate || 0) : Number(core.transferBusRate || 0);
      const vehiclesForType = getTransferVehiclesByType(transferType, core);
      const transferTotal = rate * vehiclesForType;
      if (transferTotal <= 0) continue;
      lines.push({
        key: `addon_transfer_${transferType}`,
        label: transferType === 'airport' ? 'Airport transfer' : 'Bus transfer',
        qty: vehiclesForType,
        currency: core.currency || 'EUR',
        total: transferTotal,
      });
      total += transferTotal;
    }
  }

  total += appendExperienceEstimateLines(lines, payload.experienceRequests || [], guests, flow);

  return {
    flow,
    nights,
    guestCount: guests,
    lines,
    total,
    currency: lines[0]?.currency || 'EUR',
    calculatedAt: new Date().toISOString(),
  };
}

async function buildPackagePricingSnapshot(payload) {
  const flow = payload.bookingFlow || flowFromPackageKey(payload.packageKey || '') || 'package_beach_reset';
  const guests = Number(payload.guests || payload.participants || 0);
  const stayLines = Array.isArray(payload.stayLines) ? payload.stayLines : [];
  const rules = await getPricingRules(flow);
  const byKey = new Map(stayLines.map((r) => [r.roomTypeKey, r]));
  const core = payload.coreAddons || {};
  const lines = [];
  let total = 0;

  const dormBase = pickRule(rules, 'base', 'dorm', '');
  const dormRate = Number(dormBase?.amount || 0);
  if (dormRate > 0 && guests > 0) {
    const lineTotal = dormRate * guests;
    lines.push({
      key: 'package_base',
      label: 'Package base',
      qty: guests,
      unitPrice: dormRate,
      currency: dormBase?.currency || 'EUR',
      total: lineTotal,
      ruleKey: dormBase?.ruleKey || '',
    });
    total += lineTotal;
  }

  const singleLine = byKey.get('single');
  const singleGuests = Number(singleLine?.guestsAssigned || 0);
  const singleUpgrade = pickRule(rules, 'upgrade', 'single', 'single_occ');
  const singleUpgradePrice = Number(singleUpgrade?.amount || 0);
  if (singleGuests > 0 && singleUpgradePrice > 0) {
    const lineTotal = singleGuests * singleUpgradePrice;
    lines.push({
      key: 'package_upgrade_single',
      label: 'Single room upgrade',
      qty: singleGuests,
      unitPrice: singleUpgradePrice,
      currency: singleUpgrade?.currency || 'EUR',
      total: lineTotal,
      ruleKey: singleUpgrade?.ruleKey || '',
    });
    total += lineTotal;
  }

  const doubleLine = byKey.get('double');
  const assignedDouble = Math.max(0, Number(doubleLine?.guestsAssigned || 0));
  if (assignedDouble > 0) {
    const singleOccRule = pickRule(rules, 'upgrade', 'double', 'single_occ');
    const doubleOccRule = pickRule(rules, 'upgrade', 'double', 'double_occ');
    const singleOccPrice = Number(singleOccRule?.amount || 0);
    const doubleOccPrice = Number(doubleOccRule?.amount || 0);
    const doubleOccGuests = Math.floor(assignedDouble / 2) * 2;
    const singleOccGuests = Math.max(0, assignedDouble - doubleOccGuests);
    const lineTotal = singleOccGuests * singleOccPrice + doubleOccGuests * doubleOccPrice;
    lines.push({
      key: 'package_upgrade_double',
      label: 'Double room upgrade',
      qtyGuests: assignedDouble,
      singleOccGuests,
      doubleOccGuests,
      singleOccPrice,
      doubleOccPrice,
      currency: singleOccRule?.currency || doubleOccRule?.currency || 'EUR',
      total: lineTotal,
      ruleKeySingleOcc: singleOccRule?.ruleKey || '',
      ruleKeyDoubleOcc: doubleOccRule?.ruleKey || '',
    });
    total += lineTotal;
  }

  if (core.dinner) {
    const dinnerStandard = Number(core.dinnerStandardRate || 0);
    const dinnerDoubleSingle = Number(core.dinnerDoubleSingleOccRate || 0);
    const dinnerDoubleDouble = Number(core.dinnerDoubleDoubleOccRate || 0);
    const assignedDouble = Math.max(0, Number(doubleLine?.guestsAssigned || 0));
    const doubleOccRooms = Math.floor(assignedDouble / 2);
    const singleOccRooms = assignedDouble % 2;
    const nonDoubleGuests = Math.max(0, guests - assignedDouble);
    const dinnerTotal = nonDoubleGuests * dinnerStandard + singleOccRooms * dinnerDoubleSingle + doubleOccRooms * dinnerDoubleDouble;
    if (dinnerTotal > 0) {
      lines.push({
        key: 'addon_dinner',
        label: 'Dinner add-on',
        currency: core.currency || 'EUR',
        total: dinnerTotal,
      });
      total += dinnerTotal;
    }
  }

  const transferTypes = getSelectedTransferTypes(core);
  if (transferTypes.length > 0) {
    for (const transferType of transferTypes) {
      const rate = transferType === 'airport' ? Number(core.transferAirportRate || 0) : Number(core.transferBusRate || 0);
      const vehiclesForType = getTransferVehiclesByType(transferType, core);
      const transferTotal = rate * vehiclesForType;
      if (transferTotal <= 0) continue;
      lines.push({
        key: `addon_transfer_${transferType}`,
        label: transferType === 'airport' ? 'Airport transfer' : 'Bus transfer',
        qty: vehiclesForType,
        currency: core.currency || 'EUR',
        total: transferTotal,
      });
      total += transferTotal;
    }
  }

  total += appendExperienceEstimateLines(lines, payload.experienceRequests || [], guests, flow);

  return {
    flow,
    guestCount: guests,
    lines,
    total,
    currency: lines[0]?.currency || 'EUR',
    calculatedAt: new Date().toISOString(),
  };
}

export async function submitStayBookingCore(payload = {}) {
  const contractVersion = BOOKING_CHECKOUT_CONTRACT_VERSION;
  if (!payload.termsAccepted) {
    return {
      ok: false,
      contractVersion,
      code: 'TERMS_REQUIRED',
      message: 'Please accept booking terms before submitting.',
    };
  }
  const stayGuestName = String(payload.guestName || '').trim();
  const stayGuestEmail = String(payload.guestEmail || '').trim();
  const stayGuestPhone = String(payload.guestPhone || '').trim();
  if (!stayGuestName || !stayGuestEmail) {
    return {
      ok: false,
      contractVersion,
      code: 'CONTACT_REQUIRED',
      message: 'Please provide your full name and email.',
    };
  }
  if (!stayGuestPhone) {
    return {
      ok: false,
      contractVersion,
      code: 'PHONE_REQUIRED',
      message: 'Please provide a phone or WhatsApp number.',
    };
  }
  const incomingExperienceRequests = normalizeExperienceRequests(payload.experienceRequests || []);
  const activityRequestKeys = normalizeActivityRequestKeys(
    Array.isArray(payload.activityRequestKeys) && payload.activityRequestKeys.length
      ? payload.activityRequestKeys
      : incomingExperienceRequests.map((x) => x.activityKey)
  );
  const exact = await validateExactCapacity(payload);
  if (!exact.ok) return { ...exact, contractVersion };
  const activityValidation = await validateActivityKeys(activityRequestKeys, {
    bookingFlow: payload.bookingFlow || 'bnb',
    mode: 'stay_addon',
  });
  if (!activityValidation.ok) return { ...activityValidation, contractVersion };
  const activitiesByKeys = await getActivitiesByKeys(activityRequestKeys);
  const experienceRequests = mergeExperienceRequestMeta(incomingExperienceRequests, activitiesByKeys);
  const pricingSnapshot = await buildStayPricingSnapshot({
    ...payload,
    experienceRequests,
  });
  const roomTypeSelections = stayLinesToRoomTypeSelections(payload.stayLines || []);
  const splitRooms = typeof payload.splitRooms === 'boolean' ? payload.splitRooms : roomTypeSelections.filter((x) => Number(x.quantityUnits || 0) > 0).length > 1;
  const startDate = dateKeyToDate(payload.checkIn, 12);
  const endDate = dateKeyToDate(payload.checkOut, 12);
  if (!startDate || !endDate) {
    return { ok: false, contractVersion, code: 'INVALID_DATES', message: 'Invalid booking dates.' };
  }

  const checkoutInput = {
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    guestPhone: payload.guestPhone,
    startDateKey: payload.checkIn,
    endDateKey: payload.checkOut,
    guestCount: Number(payload.guests || 0),
    stayLines: Array.isArray(payload.stayLines) ? payload.stayLines : [],
    bookingFlow: payload.bookingFlow || 'bnb',
    surfProfileJson: payload.surfProfileJson || null,
    splitRooms: !!splitRooms,
    activityRequestKeys,
    activityRequestNotes: payload.activityRequestNotes || '',
  };

  const res = await startCheckoutStay(checkoutInput);
  if (!isObjectLike(res)) {
    return invalidInternalResult(contractVersion, 'startCheckoutStay', res, 'bookingId');
  }
  if (res.ok !== true) return { ...res, ok: false, contractVersion };
  if (!String(res.bookingId || '').trim()) {
    console.error('[bookingCheckout] submitStayBooking missing bookingId from startCheckoutStay result', { res });
    return {
      ok: false,
      contractVersion,
      code: 'MISSING_BOOKING_REFERENCE',
      message: 'Booking reference was not generated. Please retry.',
    };
  }
  console.info('[bookingCheckout] submitStayBooking startCheckoutStay ok', {
    bookingId: String(res.bookingId || ''),
    flow: String(payload.bookingFlow || 'bnb'),
  });

  const bookingId = res.bookingId;
  const row = await getBookingByBusinessId(bookingId);
  if (!row) {
    console.error('[bookingCheckout] submitStayBooking booking reload failed', { bookingId: String(bookingId || '') });
    return {
      ok: false,
      contractVersion,
      code: 'BOOKING_WRITE_INCONSISTENT',
      message: 'Booking was created but could not be reloaded. Please retry.',
    };
  }
  const safeRow = normalizeBookingRowForUpdate(row);
  await wixData.update(COLLECTIONS.BOOKINGS, {
    ...safeRow,
    bookingChannel: 'website',
    startDate,
    endDate,
    holdExpiresAt: safeRow.holdExpiresAt || new Date(res.expiresAt),
    roomTypeSelections: JSON.stringify(roomTypeSelections || []),
    splitRooms: !!splitRooms,
    surfProfileJson: payload.surfProfileJson ? JSON.stringify(payload.surfProfileJson) : safeRow.surfProfileJson || '',
    activityRequestKeys: JSON.stringify(activityRequestKeys || []),
    activityRequestNotes: payload.activityRequestNotes || '',
    pricingSnapshotJson: JSON.stringify(pricingSnapshot),
    coreAddonsJson: JSON.stringify(payload.coreAddons || {}),
    experienceAddonsJson: JSON.stringify(experienceRequests || []),
    transportPlanJson: JSON.stringify(payload.transportPlan || {}),
    guestDetailsJson: JSON.stringify(Array.isArray(payload.guestDetails) ? payload.guestDetails : []),
    adminPaymentRequired: true,
    termsAccepted: !!payload.termsAccepted,
    dietaryNotes: payload.dietaryNotes || '',
    status: BOOKING_STATUS.PENDING_ADMIN_REVIEW,
    updatedAt: new Date(),
  });
  await releaseLocksByBookingDraftId(bookingId).catch(() => null);

  const notify = await sendAdminBookingEmailSafe({
    bookingId,
    templateKey: 'new_booking_admin_alert',
    bookingFlow: payload.bookingFlow || 'bnb',
    packageKey: payload.packageKey || '',
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    guestPhone: payload.guestPhone,
    startDateKey: toDateKey(payload.checkIn),
    endDateKey: toDateKey(payload.checkOut),
    guestCount: Number(payload.guests || 0),
    roomSelections: payload.stayLines || [],
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    activityDatePrefs: payload.activityDatePrefs || {},
    transportPlan: payload.transportPlan || {},
    pricingSnapshot,
    dietaryNotes: payload.dietaryNotes || '',
    guestDetails: payload.guestDetails || [],
  });

  const guestNotify = await sendGuestAcknowledgementSafe({
    bookingId,
    bookingFlow: payload.bookingFlow || 'bnb',
    packageKey: payload.packageKey || '',
    guestName: payload.guestName || '',
    guestEmail: payload.guestEmail || '',
    guestPhone: payload.guestPhone || '',
    startDateKey: toDateKey(payload.checkIn),
    endDateKey: toDateKey(payload.checkOut),
    guestCount: Number(payload.guests || 0),
    roomSelections: payload.stayLines || [],
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    pricingSnapshot,
    transportPlan: payload.transportPlan || {},
    guestDetails: payload.guestDetails || [],
  });

  try {
    await writeAddonRequests(bookingId, {
      coreAddons: payload.coreAddons || {},
      experienceRequests,
    });
  } catch (_e) {
    // Non-blocking: booking is already created and notifications may already be sent.
  }

  await persistCapiTrackingAndFireLead({
    entityType: 'booking',
    referenceId: bookingId,
    payload,
  });

  return {
    ok: true,
    contractVersion,
    bookingId,
    expiresAt: res.expiresAt,
    notification: notify,
    guestNotification: guestNotify,
  };
}

export const submitStayBooking = webMethod(Permissions.Anyone, submitStayBookingCore);


export async function submitPackageBookingCore(payload = {}) {
  const contractVersion = BOOKING_CHECKOUT_CONTRACT_VERSION;
  if (!payload.termsAccepted) {
    return {
      ok: false,
      contractVersion,
      code: 'TERMS_REQUIRED',
      message: 'Please accept booking terms before submitting.',
    };
  }
  const packageSessionId = String(payload.packageSessionId || '').trim();
  if (!packageSessionId) {
    return {
      ok: false,
      contractVersion,
      code: 'SESSION_REQUIRED',
      message: 'Please select a package session.',
    };
  }
  const pkgGuestName = String(payload.guestName || '').trim();
  const pkgGuestEmail = String(payload.guestEmail || '').trim();
  const pkgGuestPhone = String(payload.guestPhone || '').trim();
  if (!pkgGuestName || !pkgGuestEmail) {
    return {
      ok: false,
      contractVersion,
      code: 'CONTACT_REQUIRED',
      message: 'Please provide your full name and email.',
    };
  }
  if (!pkgGuestPhone) {
    return {
      ok: false,
      contractVersion,
      code: 'PHONE_REQUIRED',
      message: 'Please provide a phone or WhatsApp number.',
    };
  }

  const participants = Number(payload.participants || payload.guests || 0);
  const stayLines = Array.isArray(payload.stayLines) ? payload.stayLines : [];
  let session = null;
  try {
    session = await wixData.get(COLLECTIONS.PACKAGE_SESSIONS, packageSessionId);
  } catch (_e) {
    return {
      ok: false,
      contractVersion,
      code: 'SESSION_NOT_FOUND',
      message: 'Selected package session could not be found.',
    };
  }
  const sessionPackageKey = String(session?.packageKey || '');
  const packageKey = sessionPackageKey || String(payload.packageKey || '');
  const packageTitle = await resolvePackageTitle(packageKey);
  const incomingExperienceRequests = normalizeExperienceRequests(payload.experienceRequests || []);
  const activityRequestKeys = normalizeActivityRequestKeys(
    Array.isArray(payload.activityRequestKeys) && payload.activityRequestKeys.length
      ? payload.activityRequestKeys
      : incomingExperienceRequests.map((x) => x.activityKey)
  );
  const exact = await validateExactCapacity({ guests: participants, stayLines });
  if (!exact.ok) return { ...exact, contractVersion };

  const bookingFlow = flowFromPackageKey(packageKey) || payload.bookingFlow || 'package_beach_reset';
  const activityValidation = await validateActivityKeys(activityRequestKeys, {
    bookingFlow,
    packageKey,
    mode: 'package_addon',
  });
  if (!activityValidation.ok) return { ...activityValidation, contractVersion };
  const activitiesByKeys = await getActivitiesByKeys(activityRequestKeys);
  const experienceRequests = mergeExperienceRequestMeta(incomingExperienceRequests, activitiesByKeys);

  const roomTypeSelections = stayLinesToRoomTypeSelections(stayLines);
  const splitRooms = roomTypeSelections.filter((x) => Number(x.quantityUnits || 0) > 0).length > 1;
  const checkoutInput = {
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    guestPhone: payload.guestPhone,
    packageSessionId,
    participantsCount: participants,
    roomTypeSelections,
    bookingFlow,
  };

  const res = await startCheckoutPackage(checkoutInput);
  if (!isObjectLike(res)) {
    return invalidInternalResult(contractVersion, 'startCheckoutPackage', res, 'bookingId');
  }
  if (res.ok !== true) return { ...res, ok: false, contractVersion };
  if (!String(res.bookingId || '').trim()) {
    console.error('[bookingCheckout] submitPackageBooking missing bookingId from startCheckoutPackage result', { res });
    return {
      ok: false,
      contractVersion,
      code: 'MISSING_BOOKING_REFERENCE',
      message: 'Booking reference was not generated. Please retry.',
    };
  }
  console.info('[bookingCheckout] submitPackageBooking startCheckoutPackage ok', {
    bookingId: String(res.bookingId || ''),
    flow: String(bookingFlow || ''),
    packageSessionId: String(packageSessionId || ''),
  });

  const pricingSnapshot = await buildPackagePricingSnapshot({
    ...payload,
    bookingFlow,
    guests: participants,
    stayLines,
    experienceRequests,
  });
  const bookingId = res.bookingId;
  const row = await getBookingByBusinessId(bookingId);
  const startDate = dateKeyToDate(res.startDateKey, 12);
  const endDate = dateKeyToDate(res.endDateKey, 12);
  if (!row) {
    console.error('[bookingCheckout] submitPackageBooking booking reload failed', { bookingId: String(bookingId || '') });
    return {
      ok: false,
      contractVersion,
      code: 'BOOKING_WRITE_INCONSISTENT',
      message: 'Booking was created but could not be reloaded. Please retry.',
    };
  }
  const safeRow = normalizeBookingRowForUpdate(row);
  await wixData.update(COLLECTIONS.BOOKINGS, {
    ...safeRow,
    bookingChannel: 'website',
    startDate: startDate || safeRow.startDate,
    endDate: endDate || safeRow.endDate,
    holdExpiresAt: safeRow.holdExpiresAt || new Date(res.expiresAt),
    roomTypeSelections: JSON.stringify(roomTypeSelections || []),
    splitRooms: !!splitRooms,
    surfProfileJson: '',
    activityRequestKeys: JSON.stringify(activityRequestKeys || []),
    activityRequestNotes: payload.activityRequestNotes || '',
    pricingSnapshotJson: JSON.stringify(pricingSnapshot),
    coreAddonsJson: JSON.stringify(payload.coreAddons || {}),
    experienceAddonsJson: JSON.stringify(experienceRequests || []),
    transportPlanJson: JSON.stringify(payload.transportPlan || {}),
    guestDetailsJson: JSON.stringify(Array.isArray(payload.guestDetails) ? payload.guestDetails : []),
    adminPaymentRequired: true,
    termsAccepted: !!payload.termsAccepted,
    dietaryNotes: payload.dietaryNotes || '',
    status: BOOKING_STATUS.PENDING_ADMIN_REVIEW,
    updatedAt: new Date(),
  });
  await releaseLocksByBookingDraftId(bookingId).catch(() => null);

  const notify = await sendAdminBookingEmailSafe({
    bookingId,
    templateKey: 'new_booking_admin_alert',
    bookingFlow,
    packageKey,
    packageTitle,
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    guestPhone: payload.guestPhone,
    startDateKey: toDateKey(res.startDateKey),
    endDateKey: toDateKey(res.endDateKey),
    guestCount: participants,
    roomSelections: stayLines,
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    activityDatePrefs: payload.activityDatePrefs || {},
    transportPlan: payload.transportPlan || {},
    pricingSnapshot,
    dietaryNotes: payload.dietaryNotes || '',
    guestDetails: payload.guestDetails || [],
  });

  const guestNotify = await sendGuestAcknowledgementSafe({
    bookingId,
    bookingFlow,
    packageKey,
    packageTitle,
    guestName: payload.guestName || '',
    guestEmail: payload.guestEmail || '',
    guestPhone: payload.guestPhone || '',
    startDateKey: toDateKey(res.startDateKey),
    endDateKey: toDateKey(res.endDateKey),
    guestCount: participants,
    roomSelections: stayLines || [],
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    pricingSnapshot,
    transportPlan: payload.transportPlan || {},
    guestDetails: payload.guestDetails || [],
  });

  try {
    await writeAddonRequests(bookingId, {
      coreAddons: payload.coreAddons || {},
      experienceRequests,
    });
  } catch (_e) {
    // Non-blocking: booking is already created and notifications may already be sent.
  }

  await persistCapiTrackingAndFireLead({
    entityType: 'booking',
    referenceId: bookingId,
    payload,
  });

  return {
    ok: true,
    contractVersion,
    bookingId,
    expiresAt: res.expiresAt,
    belowMinimumParticipants: !!res.belowMinimumParticipants,
    minParticipantsExpected: Number(res.minParticipantsExpected || 0),
    notification: notify,
    guestNotification: guestNotify,
  };
}

export const submitPackageBooking = webMethod(Permissions.Anyone, submitPackageBookingCore);


export async function submitEnquiryBookingCore(payload = {}) {
  const contractVersion = BOOKING_CHECKOUT_CONTRACT_VERSION;
  const guestName = String(payload.guestName || '').trim();
  const guestEmail = String(payload.guestEmail || '').trim();
  const guestPhone = String(payload.guestPhone || '').trim();
  const enquiryType = normalizeEnquiryType(payload.enquiryType || '');
  const notes = String(payload.notes || payload.activityRequestNotes || '').trim();
  const guests = Number(payload.guests || 0);
  const sourcePage = String(payload.sourcePage || 'booking-page').trim() || 'booking-page';

  if (!payload.termsAccepted) {
    return {
      ok: false,
      contractVersion,
      code: 'TERMS_REQUIRED',
      message: 'Please accept booking terms before submitting.',
    };
  }
  if (!guestName || !guestEmail) {
    return {
      ok: false,
      contractVersion,
      code: 'CONTACT_REQUIRED',
      message: 'Please provide your full name and email.',
    };
  }
  if (!guestPhone) {
    return {
      ok: false,
      contractVersion,
      code: 'PHONE_REQUIRED',
      message: 'Please provide a phone or WhatsApp number.',
    };
  }
  if (enquiryType === 'custom_package' && !notes) {
    return {
      ok: false,
      contractVersion,
      code: 'NOTES_REQUIRED',
      message: 'Please describe your request before submitting.',
    };
  }
  if (enquiryType === 'custom_package' && guests < 3) {
    return {
      ok: false,
      contractVersion,
      code: 'CUSTOM_PACKAGE_MIN_GUESTS',
      message: 'Custom Package enquiry requires at least 3 guests.',
    };
  }
  if (enquiryType === 'custom_retreat') {
    const retreatKey = String(payload.retreatKey || '').trim().toLowerCase();
    const retreatSessionId = String(payload.retreatSessionId || '').trim();
    if (!retreatKey) {
      return {
        ok: false,
        contractVersion,
        code: 'RETREAT_REQUIRED',
        message: 'Please select a retreat before submitting.',
      };
    }
    if (!retreatSessionId) {
      return {
        ok: false,
        contractVersion,
        code: 'RETREAT_SESSION_REQUIRED',
        message: 'Please select a retreat session before submitting.',
      };
    }
    let intake = {};
    try {
      intake = payload.retreatIntakeJson ? JSON.parse(String(payload.retreatIntakeJson || '{}')) : {};
    } catch (_e) {
      intake = {};
    }
    const requiredTextKeys = ['q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
    const hasMissingText = requiredTextKeys.some((key) => !String(intake[key] || '').trim());
    const q2 = Array.isArray(intake.q2) ? intake.q2.filter(Boolean) : [];
    if (hasMissingText || q2.length === 0) {
      return {
        ok: false,
        contractVersion,
        code: 'RETREAT_INTAKE_REQUIRED',
        message: 'Please complete the mandatory retreat intake questionnaire.',
      };
    }
  }

  const incomingExperienceRequests = normalizeExperienceRequests(payload.experienceRequests || []);
  const incomingRoomSelections = Array.isArray(payload.roomSelections)
    ? payload.roomSelections
    : Array.isArray(payload.stayLines)
      ? payload.stayLines.map((row) => ({
          roomTypeKey: row.roomTypeKey,
          quantity: Number(row.quantityUnits || row.quantity || 0),
        }))
      : [];
  const activityRequestKeys = normalizeActivityRequestKeys(
    Array.isArray(payload.activityRequestKeys) && payload.activityRequestKeys.length
      ? payload.activityRequestKeys
      : incomingExperienceRequests.map((x) => x.activityKey)
  );

  const activityValidation = await validateActivityKeys(activityRequestKeys, {
    bookingFlow: 'enquiry',
    mode: 'enquiry',
    enquiryType,
  });
  if (!activityValidation.ok) return { ...activityValidation, contractVersion };
  if ((enquiryType === 'surf_activity' || enquiryType === 'activity_enquiry') && activityRequestKeys.length === 0) {
    return {
      ok: false,
      contractVersion,
      code: 'ACTIVITY_REQUIRED',
      message:
        enquiryType === 'surf_activity'
          ? 'Please select at least one surf activity.'
          : 'Please select at least one activity.',
    };
  }
  const activitiesByKeys = await getActivitiesByKeys(activityRequestKeys);
  const mergedExperienceRequests = mergeExperienceRequestMeta(incomingExperienceRequests, activitiesByKeys);
  const activityDatePrefsMap =
    payload.activityDatePrefs && typeof payload.activityDatePrefs === 'object' ? payload.activityDatePrefs : {};
  const experienceRequests = mergedExperienceRequests.map((row) => {
    const key = String(row?.activityKey || '').trim();
    const prefDate = String(activityDatePrefsMap[key] || '').trim();
    if (prefDate && !row.preferredDate) {
      return { ...row, preferredDate: prefDate };
    }
    return row;
  });

  const requestedDates = payload.requestedDates || [payload.checkIn, payload.checkOut].filter(Boolean).join(' -> ');
  const addons = {
    guests,
    enquiryType,
    retreatKey: String(payload.retreatKey || '').trim().toLowerCase(),
    retreatSessionId: String(payload.retreatSessionId || '').trim(),
    retreatPricingSnapshotJson: String(payload.retreatPricingSnapshotJson || payload.pricingSnapshotJson || ''),
    retreatIntakeJson: String(payload.retreatIntakeJson || '').trim(),
    retreatIntakeRequired: normalizeEnquiryType(payload.enquiryType || '') === 'custom_retreat',
    retreatIntakeCompleted:
      normalizeEnquiryType(payload.enquiryType || '') === 'custom_retreat' &&
      !!String(payload.retreatIntakeJson || '').trim(),
    sourcePage,
    requestedDates,
    coreAddons: payload.coreAddons || {},
    activityRequestKeys,
    experienceRequests,
    transportPlan: payload.transportPlan || {},
    activityDatePrefs: payload.activityDatePrefs || {},
    termsAccepted: !!payload.termsAccepted,
    dietaryNotes: payload.dietaryNotes || '',
    activityRequestNotes: notes,
    guestDetails: Array.isArray(payload.guestDetails) ? payload.guestDetails : [],
    roomSelections: incomingRoomSelections,
  };

  const enquiryRes = await createEnquiry({
    activityKey: activityRequestKeys[0] || '',
    activityKeys: activityRequestKeys,
    sourcePage,
    bookingFlow: 'enquiry',
    guestName,
    guestEmail,
    guestPhone: payload.guestPhone || '',
    requestedDates,
    notes,
    addons,
  });
  if (!isObjectLike(enquiryRes)) {
    return invalidInternalResult(contractVersion, 'createEnquiry', enquiryRes, 'enquiryId');
  }
  if (enquiryRes.ok !== true) return { ...enquiryRes, ok: false, contractVersion };
  if (!String(enquiryRes.enquiryId || '').trim()) {
    console.error('[bookingCheckout] submitEnquiryBooking missing enquiryId from createEnquiry result', { enquiryRes });
    return {
      ok: false,
      contractVersion,
      code: 'MISSING_ENQUIRY_REFERENCE',
      message: 'Enquiry reference was not generated. Please retry.',
    };
  }
  const enquiryId = enquiryRes.enquiryId;
  let retreatHold = null;
  if (enquiryType === 'custom_retreat') {
    retreatHold = await ensureRetreatEnquiryInventoryHold({
      enquiryId,
      guestName,
      guestEmail,
      guestPhone: payload.guestPhone || '',
      retreatSessionId: String(payload.retreatSessionId || '').trim(),
      roomSelections: incomingRoomSelections,
      guests,
    });
    if (retreatHold?.ok) {
      const rows = await wixData.query(COLLECTIONS.ENQUIRIES).eq('enquiryId', enquiryId).limit(1).find();
      const current = rows.items?.[0] || null;
      if (current) {
        let currentAddons = {};
        try {
          currentAddons = current.addons ? JSON.parse(current.addons) : {};
        } catch (_e) {
          currentAddons = {};
        }
        await wixData.update(COLLECTIONS.ENQUIRIES, {
          ...current,
          addons: JSON.stringify({
            ...(currentAddons && typeof currentAddons === 'object' ? currentAddons : {}),
            retreatHoldBookingId: retreatHold.bookingId,
          }),
          updatedAt: new Date(),
        });
      }
    }
  }

  const notify = await sendAdminBookingEmail({
    bookingId: enquiryId,
    templateKey: 'new_enquiry_admin_alert',
    bookingFlow: 'enquiry',
    enquiryType,
    retreatKey: String(payload.retreatKey || '').trim().toLowerCase(),
    retreatSessionId: String(payload.retreatSessionId || '').trim(),
    guestName,
    guestEmail,
    guestPhone: payload.guestPhone || '',
    startDateKey: payload.checkIn || '',
    endDateKey: payload.checkOut || '',
    guestCount: guests || '-',
    roomSelections: incomingRoomSelections,
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    transportPlan: payload.transportPlan || {},
    activityDatePrefs: payload.activityDatePrefs || {},
    activityRequestNotes: notes,
    dietaryNotes: payload.dietaryNotes || '',
    guestDetails: payload.guestDetails || [],
    sourcePage,
    retreatIntakeJson: String(payload.retreatIntakeJson || '').trim(),
  });

  const guestNotify = await sendGuestBookingAcknowledgement({
    bookingId: enquiryId,
    bookingFlow: 'enquiry',
    enquiryType,
    guestName,
    guestEmail,
    guestPhone: payload.guestPhone || '',
    startDateKey: payload.checkIn || '',
    endDateKey: payload.checkOut || '',
    guestCount: guests || '-',
    roomSelections: incomingRoomSelections,
    coreAddons: payload.coreAddons || {},
    experienceRequests,
    activityDatePrefs: activityDatePrefsMap,
    // Custom Package enquiry uses `notes` to render the "Requested Elements" section.
    activityRequestNotes: notes,
    pricingSnapshot: parseJsonSafe(payload.retreatPricingSnapshotJson || payload.pricingSnapshotJson, {}),
    transportPlan: payload.transportPlan || {},
    guestDetails: payload.guestDetails || [],
    retreatKey: String(payload.retreatKey || '').trim().toLowerCase(),
    retreatSessionId: String(payload.retreatSessionId || '').trim(),
  });

  await persistCapiTrackingAndFireLead({
    entityType: 'enquiry',
    referenceId: enquiryId,
    payload,
  });

  return {
    ok: true,
    contractVersion,
    enquiryId,
    holdPlaced: retreatHold?.ok === true,
    holdBookingId: retreatHold?.bookingId || '',
    notification: notify,
    guestNotification: guestNotify,
  };
}

export const submitEnquiryBooking = webMethod(Permissions.Anyone, submitEnquiryBookingCore);

// =====================================================================
// Custom Retreat (bespoke 5-step request flow)
// =====================================================================
// This is a self-contained enquiry endpoint for the new bespoke Custom Retreat flow.
// Contract:
//   - NO inventory holds, NO availability checks, NO payment links.
//   - Persists into the Enquiries collection with addons.customRetreatSchema = 'v2',
//     allowing admin UI + email rendering to pick the correct schema.
//   - Sends admin alert + guest acknowledgement using new templates.
// Backwards compatibility: the legacy q1..q9 path inside submitEnquiryBookingCore is
// untouched, so any existing enquiries with the old schema continue to render correctly.
export async function submitCustomRetreatRequestCore(payload = {}) {
  const contractVersion = BOOKING_CHECKOUT_CONTRACT_VERSION;
  const guestName = String(payload.guestName || '').trim();
  const guestEmail = String(payload.guestEmail || '').trim();
  const guestPhone = String(payload.guestPhone || '').trim();
  const guestCountry = String(payload.guestCountry || '').trim();
  const guests = Math.max(0, Number(payload.guestCount || payload.guests || 0));
  const checkIn = String(payload.checkIn || '').trim();
  const checkOut = String(payload.checkOut || '').trim();
  const wholeHouseEnquiry = payload.wholeHouseEnquiry === true;
  const sourcePage = String(payload.sourcePage || 'booking-page').trim() || 'booking-page';

  const incomingRoomSelections = Array.isArray(payload.roomSelections) ? payload.roomSelections : [];
  const roomSelections = wholeHouseEnquiry
    ? []
    : incomingRoomSelections
        .map((row) => ({
          roomTypeKey: String(row?.roomTypeKey || '').trim(),
          quantity: Math.max(0, Number(row?.quantity || row?.quantityUnits || 0)),
        }))
        .filter((row) => row.roomTypeKey && row.quantity > 0);

  const retreatTypes = Array.isArray(payload.retreatTypes)
    ? payload.retreatTypes
        .map((x) => String(x || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  const retreatTypeOther = String(payload.retreatTypeOther || '').trim();
  const vision = String(payload.vision || '').trim();
  const activitiesWanted = String(payload.activitiesWanted || '').trim();
  const specialRequirements = String(payload.specialRequirements || '').trim();

  // Validation — server-side mirror of the per-step UI requirements.
  if (!guestName) {
    return { ok: false, contractVersion, code: 'CONTACT_NAME_REQUIRED', message: 'Please provide your full name.' };
  }
  if (!guestEmail) {
    return { ok: false, contractVersion, code: 'CONTACT_EMAIL_REQUIRED', message: 'Please provide your email.' };
  }
  if (!guestPhone) {
    return { ok: false, contractVersion, code: 'CONTACT_PHONE_REQUIRED', message: 'Please provide a phone or WhatsApp number.' };
  }
  if (!guestCountry) {
    return { ok: false, contractVersion, code: 'COUNTRY_REQUIRED', message: 'Please select your country.' };
  }
  if (!guests) {
    return { ok: false, contractVersion, code: 'GUESTS_REQUIRED', message: 'Please provide a guest count.' };
  }
  if (!checkIn || !checkOut) {
    return { ok: false, contractVersion, code: 'DATES_REQUIRED', message: 'Please provide preferred arrival and departure dates.' };
  }
  if (checkOut <= checkIn) {
    return { ok: false, contractVersion, code: 'DATES_INVALID', message: 'Departure must be after arrival.' };
  }
  if (!wholeHouseEnquiry && roomSelections.length === 0) {
    return { ok: false, contractVersion, code: 'ACCOMMODATION_REQUIRED', message: 'Please select at least one room or request the whole house.' };
  }
  if (retreatTypes.length === 0) {
    return { ok: false, contractVersion, code: 'TYPE_REQUIRED', message: 'Please select at least one retreat type.' };
  }
  if (retreatTypes.includes('other') && !retreatTypeOther) {
    return { ok: false, contractVersion, code: 'TYPE_OTHER_REQUIRED', message: 'Please describe the "Other" retreat type.' };
  }
  if (!vision) {
    return { ok: false, contractVersion, code: 'VISION_REQUIRED', message: 'Please tell us what you are hoping to create.' };
  }
  if (!activitiesWanted) {
    return { ok: false, contractVersion, code: 'ACTIVITIES_REQUIRED', message: 'Please share which activities or experiences you would like included.' };
  }

  const guestDetails = Array.isArray(payload.guestDetails)
    ? payload.guestDetails
        .map((g) => ({
          fullName: String(g?.fullName || '').trim(),
          email: String(g?.email || '').trim(),
          phone: String(g?.phone || '').trim(),
        }))
        .slice(0, Math.max(1, guests))
    : [];

  const intakeJson = JSON.stringify({
    schemaVersion: 'custom_retreat_v2',
    retreatTypes,
    retreatTypeOther: retreatTypes.includes('other') ? retreatTypeOther : '',
    vision,
    activitiesWanted,
    specialRequirements,
  });

  const requestedDates = [checkIn, checkOut].filter(Boolean).join(' -> ');

  const customRetreatPayload = {
    guestCountry,
    wholeHouseEnquiry,
    retreatTypes,
    retreatTypeOther: retreatTypes.includes('other') ? retreatTypeOther : '',
    vision,
    activitiesWanted,
    specialRequirements,
  };

  const addons = {
    enquiryType: 'custom_retreat',
    customRetreatSchema: 'v2',
    guests,
    sourcePage,
    requestedDates,
    wholeHouseEnquiry,
    roomSelections,
    retreatIntakeJson: intakeJson,
    retreatIntakeRequired: true,
    retreatIntakeCompleted: true,
    retreatTypes,
    retreatTypeOther: retreatTypes.includes('other') ? retreatTypeOther : '',
    guestCountry,
    guestDetails,
    coreAddons: {},
    activityRequestKeys: [],
    experienceRequests: [],
    transportPlan: {},
    activityDatePrefs: {},
    termsAccepted: true,
    dietaryNotes: '',
    activityRequestNotes: vision,
  };

  const enquiryRes = await createEnquiry({
    activityKey: '',
    activityKeys: [],
    sourcePage,
    bookingFlow: 'enquiry',
    guestName,
    guestEmail,
    guestPhone,
    requestedDates,
    notes: vision,
    addons,
  });
  if (!isObjectLike(enquiryRes)) {
    return invalidInternalResult(contractVersion, 'createEnquiry', enquiryRes, 'enquiryId');
  }
  if (enquiryRes.ok !== true) return { ...enquiryRes, ok: false, contractVersion };
  if (!String(enquiryRes.enquiryId || '').trim()) {
    console.error('[bookingCheckout] submitCustomRetreatRequest missing enquiryId from createEnquiry result', { enquiryRes });
    return {
      ok: false,
      contractVersion,
      code: 'MISSING_ENQUIRY_REFERENCE',
      message: 'Enquiry reference was not generated. Please retry.',
    };
  }
  const enquiryId = enquiryRes.enquiryId;

  const notify = await sendAdminBookingEmailSafe({
    bookingId: enquiryId,
    templateKey: 'new_custom_retreat_request_admin',
    bookingFlow: 'enquiry',
    enquiryType: 'custom_retreat',
    customRetreatSchema: 'v2',
    customRetreatPayload,
    guestName,
    guestEmail,
    guestPhone,
    startDateKey: checkIn,
    endDateKey: checkOut,
    guestCount: guests || '-',
    roomSelections,
    coreAddons: {},
    experienceRequests: [],
    transportPlan: {},
    activityDatePrefs: {},
    activityRequestNotes: '',
    dietaryNotes: '',
    guestDetails,
    sourcePage,
    retreatIntakeJson: intakeJson,
  });

  const guestNotify = await sendGuestAcknowledgementSafe({
    bookingId: enquiryId,
    bookingFlow: 'enquiry',
    enquiryType: 'custom_retreat',
    customRetreatSchema: 'v2',
    customRetreatPayload,
    guestName,
    guestEmail,
    guestPhone,
    startDateKey: checkIn,
    endDateKey: checkOut,
    guestCount: guests || '-',
    roomSelections,
    coreAddons: {},
    experienceRequests: [],
    activityDatePrefs: {},
    pricingSnapshot: {},
    transportPlan: {},
    guestDetails,
  });

  await persistCapiTrackingAndFireLead({
    entityType: 'enquiry',
    referenceId: enquiryId,
    payload,
  });

  return {
    ok: true,
    contractVersion,
    enquiryId,
    notification: notify,
    guestNotification: guestNotify,
  };
}

export const submitCustomRetreatRequest = webMethod(Permissions.Anyone, submitCustomRetreatRequestCore);

