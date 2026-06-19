import wixLocationFrontend from '../shims/wixLocationFrontend.js';
import {
  loadPackageRoomOptions,
  loadPackageSessionOptions,
  loadRetreatEnquiryOptions,
  loadRetreatRoomOptions,
  loadRoomTypeMetadata,
  loadStayRoomOptions,
} from '../api/bookingAvailability.js';
import { loadEnquiryOptions, loadStayAddonOptions } from '../api/bookingAddons.js';
import {
  submitCustomRetreatRequest as submitCustomRetreatRequestBridge,
  submitEnquiryBooking as submitEnquiryBookingBridge,
  submitPackageBooking as submitPackageBookingBridge,
  submitStayBooking as submitStayBookingBridge,
} from '../api/bookingCheckout.demo.js';
import {
  generateEventId as generateMetaEventId,
  getCurrentMatchingData as getMetaMatchingData,
  trackInitiateCheckout as trackMetaInitiateCheckout,
  trackLead as trackMetaLead,
} from '../shims/metaPixel.js';
import { $w } from '../shims/wixPublic.js';
const LOG_PREFIX = '[booking-page]';
const VALID_FLOWS = new Set([
  'bnb',
  'surf_stay',
  'package_beach_reset',
  'package_roots_ritual',
  'package_surf_soul',
  'enquiry',
  'retreats',
  'retreat_dihya',
  'retreat_anzar',
]);
const FLOW_ALIASES = {
  surfstay: 'surf_stay',
  'surf-stay': 'surf_stay',
  surf_stay: 'surf_stay',
  packagebeachreset: 'package_beach_reset',
  package_beachreset: 'package_beach_reset',
  'package-beach-reset': 'package_beach_reset',
  package_rootsritual: 'package_roots_ritual',
  'package-roots-ritual': 'package_roots_ritual',
  package_surfsoul: 'package_surf_soul',
  'package-surf-soul': 'package_surf_soul',
  retreat: 'retreats',
  retreats: 'retreats',
  retreats_flow: 'retreats',
  'retreats-flow': 'retreats',
  retreat_dihya: 'retreat_dihya',
  'retreat-dihya': 'retreat_dihya',
  retreat_anzar: 'retreat_anzar',
  'retreat-anzar': 'retreat_anzar',
};
const SURF_ACTIVITY_KEYS = new Set([
  'surf-lesson-beginner',
  'surf-lesson-intermediate',
  'surf-guiding',
  'surf-extended-experience',
]);
const SUBMIT_MAX_ATTEMPTS = 3;
const SUBMIT_RETRY_DELAY_MS = 900;

function log(message, payload) {
  console.log(`${LOG_PREFIX} ${message}`, payload || '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function shouldRetrySubmitResult(result) {
  if (!result || typeof result !== 'object') return true;
  if (result.ok === true) return false;
  const code = String(result.code || '').trim().toUpperCase();
  if (!code) return true;
  return (
    code === 'INVALID_INTERNAL_RESULT' ||
    code === 'INVALID_BACKEND_RESPONSE' ||
    code === 'MISSING_BOOKING_REFERENCE' ||
    code === 'MISSING_ENQUIRY_REFERENCE' ||
    code === 'BOOKING_WRITE_INCONSISTENT'
  );
}

async function runSubmitWithRetries(label, submitFn) {
  let lastResult = null;
  let lastError = null;
  for (let attempt = 1; attempt <= SUBMIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await submitFn();
      lastResult = result;
      if (result?.ok === true) return result;
      const canRetry = attempt < SUBMIT_MAX_ATTEMPTS && shouldRetrySubmitResult(result);
      if (!canRetry) return result;
      log(`${label} transient unsuccessful attempt`, {
        attempt,
        maxAttempts: SUBMIT_MAX_ATTEMPTS,
        code: String(result?.code || ''),
        message: String(result?.message || ''),
      });
    } catch (e) {
      lastError = e;
      if (attempt >= SUBMIT_MAX_ATTEMPTS) throw e;
      log(`${label} transient error attempt`, {
        attempt,
        maxAttempts: SUBMIT_MAX_ATTEMPTS,
        error: String(e?.message || e || ''),
      });
    }
    await delay(SUBMIT_RETRY_DELAY_MS * attempt);
  }
  if (lastResult && typeof lastResult === 'object') return lastResult;
  if (lastError) throw lastError;
  return {
    ok: false,
    code: 'SUBMIT_FAILED_AFTER_RETRIES',
    message: 'Could not submit booking after multiple attempts.',
  };
}

function formatDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeFlow(flow) {
  const raw = String(flow || '').trim().toLowerCase();
  if (!raw) return 'bnb';
  const mapped = FLOW_ALIASES[raw] || raw;
  return VALID_FLOWS.has(mapped) ? mapped : 'bnb';
}

function normalizeEnquiryType(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'custom_package' || key === 'custom_retreat' || key === 'surf_activity' || key === 'activity_enquiry') {
    return key;
  }
  return '';
}

function normalizeRetreatKey(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'dihya' || key === 'beyond_the_break_dihya' || key === 'beyond-the-break-dihya') return 'dihya';
  if (key === 'anzar' || key === 'beyond_the_break_anzar' || key === 'beyond-the-break-anzar') return 'anzar';
  return '';
}

function isSurfActivityKey(activityKey = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  if (!key) return false;
  return SURF_ACTIVITY_KEYS.has(key) || key.startsWith('surf-');
}

function packageKeyFromFlow(flow = '') {
  if (flow === 'package_beach_reset') return 'BeachReset';
  if (flow === 'package_roots_ritual') return 'RootsAndRitual';
  if (flow === 'package_surf_soul') return 'SurfAndSoul';
  return null;
}

function packageTransferIncludedByFlow(flow = '') {
  return flow === 'package_roots_ritual' || flow === 'package_surf_soul' || flow === 'retreats';
}

function readContext() {
  const q = wixLocationFrontend.query || {};
  const rawFlow = q.flow || q.bookingFlow || '';
  const normalizedFlow = normalizeFlow(rawFlow);
  const retreatFromQuery = normalizeRetreatKey(q.retreat || q.retreatKey || '');
  const flowRetreatKey =
    normalizedFlow === 'retreat_dihya' ? 'dihya' : normalizedFlow === 'retreat_anzar' ? 'anzar' : '';
  const retreatKey = retreatFromQuery || flowRetreatKey;
  const enquiryTypeRaw = q.enquiryType || q.enquiryKind || '';
  const normalizedEnquiryType = normalizeEnquiryType(enquiryTypeRaw);
  const explicitCustomRetreatInUrl = normalizedEnquiryType === 'custom_retreat';
  const retreatMode =
    normalizedFlow === 'retreats' ||
    normalizedFlow.startsWith('retreat_') ||
    !!retreatKey ||
    explicitCustomRetreatInUrl;
  const flow = retreatMode ? (retreatKey ? 'retreats' : 'enquiry') : normalizedFlow;
  const activityKey = q.activityKey || null;
  const inferredEnquiryType =
    flow === 'enquiry' && activityKey ? (isSurfActivityKey(activityKey) ? 'surf_activity' : 'activity_enquiry') : null;
  // Custom Retreat — the new bespoke 5-step request flow.
  // Triggered when URL explicitly carries enquiryType=custom_retreat and no preset retreatKey.
  const customRetreatRequestMode = explicitCustomRetreatInUrl && !retreatKey;
  // Retreat browse — show 3-card selector (Dihya / Anzar / Custom Retreat) when user lands on a
  // generic retreats URL with no specific choice yet.
  const retreatBrowseMode = retreatMode && !retreatKey && !explicitCustomRetreatInUrl;
  return {
    flow,
    requestedFlow: normalizedFlow,
    retreatMode,
    retreatKey: retreatKey || null,
    retreatSessionId: q.retreatSessionId || q.session || null,
    packageKey: q.packageKey || packageKeyFromFlow(flow),
    sessionId: q.sessionId || null,
    enquiryType: retreatMode ? 'custom_retreat' : normalizedEnquiryType || inferredEnquiryType,
    roomPreset: q.roomPreset || null,
    activityKey,
    checkIn: q.checkIn || q.arrival || null,
    checkOut: q.checkOut || q.departure || null,
    guestCount: q.guests ? Math.max(1, Number(q.guests) || 1) : null,
    customRetreatRequestMode,
    retreatBrowseMode,
  };
}

function setJsonAttr(el, key, value) {
  el.setAttribute(key, JSON.stringify(value || {}));
}

function getCapacityPerUnit(roomTypeKey, options) {
  const row = (options || []).find((x) => x.roomTypeKey === roomTypeKey);
  if (row && Number(row.capacityPerUnit) > 0) return Number(row.capacityPerUnit);
  return roomTypeKey === 'double' ? 2 : 1;
}

function getNights(checkIn, checkOut) {
  const start = new Date(`${checkIn}T12:00:00`).getTime();
  const end = new Date(`${checkOut}T12:00:00`).getTime();
  if (!start || !end || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function parseDateKeyToTime(dateKey = '') {
  const key = String(dateKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const ts = new Date(`${key}T12:00:00`).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function extractDateKeyFromDateTime(value = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function normalizeDateTimeLocalValue(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(' ', 'T');
  const m = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!m) return raw;
  return `${m[1]}T${m[2]}:${m[3]}`;
}

function isTransferArrivalOnOrBeforeCheckIn(arrivalDateTime, checkInDateKey) {
  const arrivalDateKey = extractDateKeyFromDateTime(arrivalDateTime);
  const checkInKey = String(checkInDateKey || '').trim();
  if (!arrivalDateKey || !checkInKey) return false;
  return arrivalDateKey <= checkInKey;
}

function isDateKeyWithinRange(dateKey, minDateKey, maxDateKey) {
  const ts = parseDateKeyToTime(dateKey);
  const minTs = parseDateKeyToTime(minDateKey);
  const maxTs = parseDateKeyToTime(maxDateKey);
  if (ts == null || minTs == null || maxTs == null) return false;
  return ts >= minTs && ts <= maxTs;
}

function getSelectedSlots(roomSelections, options) {
  return (roomSelections || []).reduce((acc, row) => {
    const qty = Math.max(0, Number(row.quantity || row.quantityUnits || 0));
    const cap = getCapacityPerUnit(row.roomTypeKey, options);
    return acc + qty * cap;
  }, 0);
}

function getTotalAvailableGuestSlots(options) {
  return (options || []).reduce((acc, row) => {
    const available = Math.max(0, Number(row?.available || 0));
    const cap = getCapacityPerUnit(row?.roomTypeKey, options);
    return acc + available * cap;
  }, 0);
}

function exceedsAvailability(roomSelections, options) {
  return (roomSelections || []).some((row) => {
    const qty = Math.max(0, Number(row.quantity || row.quantityUnits || 0));
    const available = Math.max(
      0,
      Number((options || []).find((x) => x.roomTypeKey === row.roomTypeKey)?.available || 0)
    );
    return qty > available;
  });
}

function suggestStayRoomSelections(guestCount, options) {
  const guests = Math.max(0, Number(guestCount || 0));
  if (guests <= 0) return [];
  const getAvailable = (key) =>
    Math.max(0, Number((options || []).find((x) => x.roomTypeKey === key)?.available || 0));
  const maxDouble = Math.min(getAvailable('double'), Math.floor(guests / 2));
  const availableSingle = getAvailable('single');
  const availableDorm = getAvailable('dorm');
  const variants = [];
  for (let doubles = maxDouble; doubles >= 0; doubles -= 1) {
    const afterDoubles = guests - doubles * 2;
    const singles = Math.min(availableSingle, afterDoubles);
    const dorms = afterDoubles - singles;
    if (dorms < 0 || dorms > availableDorm) continue;
    variants.push({
      doubles,
      singles,
      dorms,
      roomsUsed: doubles + singles + dorms,
    });
  }
  variants.sort((a, b) => {
    if (a.roomsUsed !== b.roomsUsed) return a.roomsUsed - b.roomsUsed;
    if (a.dorms !== b.dorms) return a.dorms - b.dorms;
    if (a.doubles !== b.doubles) return b.doubles - a.doubles;
    return b.singles - a.singles;
  });
  const best = variants[0];
  if (!best) return [];
  const result = [];
  if (best.doubles > 0) result.push({ roomTypeKey: 'double', quantity: best.doubles });
  if (best.singles > 0) result.push({ roomTypeKey: 'single', quantity: best.singles });
  if (best.dorms > 0) result.push({ roomTypeKey: 'dorm', quantity: best.dorms });
  return result;
}

function suggestStayRoomSelectionsPreferSingles(guestCount, options) {
  const guests = Math.max(0, Number(guestCount || 0));
  if (guests <= 0) return [];
  const getAvailable = (key) =>
    Math.max(0, Number((options || []).find((x) => x.roomTypeKey === key)?.available || 0));
  const availableSingle = getAvailable('single');
  const availableDouble = getAvailable('double');
  const availableDorm = getAvailable('dorm');

  let remaining = guests;
  const singles = Math.min(availableSingle, remaining);
  remaining -= singles;
  const doubles = Math.min(availableDouble, Math.floor(remaining / 2));
  remaining -= doubles * 2;
  const dorms = Math.min(availableDorm, remaining);
  remaining -= dorms;
  if (remaining > 0) return [];

  const result = [];
  if (doubles > 0) result.push({ roomTypeKey: 'double', quantity: doubles });
  if (singles > 0) result.push({ roomTypeKey: 'single', quantity: singles });
  if (dorms > 0) result.push({ roomTypeKey: 'dorm', quantity: dorms });
  return result;
}

function normalizeRoomRecommendation(next) {
  const safe = next || {};
  const suggestedSelections = Array.isArray(safe.suggestedSelections)
    ? safe.suggestedSelections.map((row) => ({
        roomTypeKey: row.roomTypeKey,
        quantity: Math.max(0, Number(row.quantity || 0)),
      }))
    : [];
  const status = safe.status || 'none';
  return { status, suggestedSelections };
}

// Suffix appended to availability/inventory error messages on Step 1.
// Reassures users who got bounced back after a successful submission attempt that
// their booking may have actually gone through, and where to look / who to contact.
const RECENT_SUBMISSION_HELP =
  '\n\nIf you have just tried to make a booking and are seeing this message, please check your email — your booking has likely gone through successfully. If you do not receive a confirmation shortly, please contact us at bookings@aourirwaves.com';

function withRecentSubmissionHelp(message) {
  const base = String(message || '').trim();
  if (!base) return base;
  return `${base}${RECENT_SUBMISSION_HELP}`;
}

function getSubmitContactStep(state, { isPackageVariant = false, isEnquiryVariant = false } = {}) {
  if (isEnquiryVariant) return 2;
  if (isPackageVariant && String(state.bookingFlow || '') === 'retreats') return 3;
  return 4;
}

function isInventorySubmitErrorCode(code = '') {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return false;
  return (
    normalized.includes('UNAVAILABLE') ||
    normalized.includes('CAPACITY_MISMATCH') ||
    normalized.includes('INVENTORY') ||
    normalized === 'NO_INVENTORY' ||
    normalized.includes('SESSION_FULL') ||
    normalized.includes('SESSION_CLOSED') ||
    (normalized.includes('SESSION') && normalized !== 'SESSION_REQUIRED') ||
    (normalized.includes('PACKAGE') && normalized !== 'PACKAGE_REQUIRED')
  );
}

const SUBMIT_UNAVAILABLE_MESSAGE =
  'These rooms are no longer available for your selected dates. Please go back to Step 1, choose different dates or rooms, and try again.';

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

function transferVehiclesLimitByGuests(guestCount) {
  return Math.max(1, Number(guestCount || 0));
}

function clampTransferVehicles(rawValue, guestCount) {
  const max = transferVehiclesLimitByGuests(guestCount);
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(max, Math.round(n)));
}

function normalizeCoreAddons(next, guestCount) {
  const safe = next || {};
  const guests = Math.max(1, Number(guestCount != null ? guestCount : safe.guestCount || 1));
  const transferTypes = getSelectedTransferTypes(safe);
  const isSplit = transferTypes.length >= 2;
  // For split arrivals, each transfer type carries its own vehicle count and the
  // aggregate `transferVehicles` is derived as the sum so legacy consumers
  // (admin email vehicle totals, BD addon rows fallback) keep a sensible value.
  let transferAirportVehicles = isSplit
    ? clampTransferVehicles(safe.transferAirportVehicles || 1, guests)
    : (transferTypes.includes('airport') ? clampTransferVehicles(safe.transferVehicles || 1, guests) : 0);
  let transferBusVehicles = isSplit
    ? clampTransferVehicles(safe.transferBusVehicles || 1, guests)
    : (transferTypes.includes('bus') ? clampTransferVehicles(safe.transferVehicles || 1, guests) : 0);
  let transferVehicles;
  if (transferTypes.length === 0) {
    transferVehicles = 1;
  } else if (isSplit) {
    transferVehicles = Math.max(1, transferAirportVehicles + transferBusVehicles);
  } else {
    transferVehicles = clampTransferVehicles(safe.transferVehicles || 1, guests);
  }
  return {
    dinner: !!safe.dinner,
    transferType: transferTypes[0] || 'none',
    transferTypes,
    transferVehicles,
    transferAirportVehicles,
    transferBusVehicles,
    transferTravelTogether: guests > 1 && safe.transferTravelTogether === 'no' ? 'no' : 'yes',
    dinnerStandardRate: Number(safe.dinnerStandardRate || 0),
    dinnerDoubleSingleOccRate: Number(safe.dinnerDoubleSingleOccRate || 0),
    dinnerDoubleDoubleOccRate: Number(safe.dinnerDoubleDoubleOccRate || 0),
    transferAirportRate: Number(safe.transferAirportRate || 0),
    transferBusRate: Number(safe.transferBusRate || 0),
    currency: safe.currency || 'EUR',
  };
}

function normalizeCoreAddonsWithPackageTransfer(next, guestCount, bookingFlow = '') {
  const normalized = normalizeCoreAddons(next, guestCount);
  if (!packageTransferIncludedByFlow(bookingFlow)) return normalized;
  const selectedTransferTypes = getSelectedTransferTypes(normalized);
  if (selectedTransferTypes.length > 0) return normalized;
  return normalizeCoreAddons({
    ...normalized,
    transferType: 'airport',
    transferTypes: ['airport'],
    transferVehicles: clampTransferVehicles(normalized.transferVehicles || 1, guestCount),
    transferTravelTogether: Number(guestCount || 1) > 1 && normalized.transferTravelTogether === 'no' ? 'no' : 'yes',
  }, guestCount);
}

function normalizeGuestDetails(list, guestCount) {
  const guests = Math.max(1, Number(guestCount || 1));
  const current = Array.isArray(list) ? list : [];
  return Array.from({ length: guests }).map((_, idx) => {
    const row = current[idx] || {};
    return {
      fullName: row.fullName || '',
      email: row.email || '',
      phone: row.phone || '',
      surfLevel: row.surfLevel || '',
      surfedBefore: row.surfedBefore || '',
      waterConfidence: row.waterConfidence || '',
      surfGoals: row.surfGoals || '',
      surfNotes: row.surfNotes || '',
      surfLessonRequest: row.surfLessonRequest || '',
      enquiryActivityKey: row.enquiryActivityKey || '',
      lessonFormat: row.lessonFormat || '',
      preferredDate: row.preferredDate || '',
      arrivalTransferType: row.arrivalTransferType || '',
      arrivalReference: row.arrivalReference || '',
      arrivalTime: row.arrivalTime || '',
    };
  });
}

function isSurfActivityEnquiry(state = {}) {
  return String(state.bookingFlow || '') === 'enquiry' && String(state.enquiryType || '').toLowerCase() === 'surf_activity';
}

function getSurfActivityOptions(list = []) {
  return (Array.isArray(list) ? list : []).filter((row) => {
    return isSurfActivityKey(row.activityKey);
  });
}

function buildExperienceRequestsByKeys(activityKeys = [], options = [], lessonFormatsByActivity = {}) {
  const map = new Map((options || []).map((row) => [String(row.activityKey || ''), row]));
  return [...new Set(activityKeys.filter(Boolean))].map((key) => {
    const match = map.get(String(key)) || {};
    const lessonFormat = normalizeLessonFormatForActivity(
      key,
      lessonFormatsByActivity && typeof lessonFormatsByActivity === 'object' ? lessonFormatsByActivity[key] : '',
      'enquiry'
    );
    const normalizedPriceLabel = String(match.priceLabel || '').trim();
    const supportsFormat = activitySupportsLessonFormat(key);
    const resolvedPriceLabel =
      supportsFormat && normalizedPriceLabel
        ? lessonFormat === 'extended'
          ? normalizedPriceLabel
              .split('|')
              .map((x) => String(x || '').trim())
              .find((x) => x.toLowerCase().includes('extended')) || normalizedPriceLabel
          : normalizedPriceLabel
              .split('|')
              .map((x) => String(x || '').trim())
              .find((x) => x.toLowerCase().includes('2-hour')) ||
            normalizedPriceLabel
              .split('|')
              .map((x) => String(x || '').trim())
              .find((x) => !x.toLowerCase().includes('extended')) ||
            normalizedPriceLabel
        : normalizedPriceLabel;
    const priceFromEur = Number(match.priceFromEur || 0);
    const effectivePriceEur = resolveActivityEffectivePriceEur(resolvedPriceLabel, priceFromEur);
    return {
      activityKey: key,
      title: match.title || key,
      lessonFormat,
      priceLabel: resolvedPriceLabel,
      priceFromEur,
      effectivePriceEur,
      currency: String(match.currency || 'EUR').trim() || 'EUR',
    };
  });
}

function resolveActivityEffectivePriceEur(priceLabel = '', priceFromEur = 0) {
  const label = String(priceLabel || '').trim();
  const fallback = Number(priceFromEur || 0);
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

function normalizeLessonFormatForActivity(activityKey = '', lessonFormat = '', bookingFlow = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  if (!activitySupportsLessonFormat(activityKey)) return '';
  if (String(bookingFlow || '').trim().toLowerCase() === 'surf_stay' && key === 'surf-lesson-beginner') return 'extended';
  return String(lessonFormat || '').trim().toLowerCase() === 'extended' ? 'extended' : '';
}

function deriveSurfedBeforeFromLevel(surfLevel = '') {
  const key = String(surfLevel || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'beginner') return 'no';
  if (key === 'intermediate' || key === 'advanced' || key === 'beginner_improver') return 'yes';
  return '';
}

function mapActivityKeyToSurfLessonRequest(activityKey = '', lessonFormat = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  const format = String(lessonFormat || '').trim().toLowerCase();
  if (format === 'extended' && activitySupportsLessonFormat(key)) return 'extended_experience';
  if (key === 'surf-lesson-beginner') return 'lesson_beginner';
  if (key === 'surf-lesson-intermediate') return 'lesson_intermediate';
  if (key === 'surf-guiding') return 'surf_guiding';
  return '';
}

function getSurfLessonOptionsFromAddons(optionsState = {}) {
  const list = Array.isArray(optionsState?.addons?.experiences) ? optionsState.addons.experiences : [];
  return list.filter((row) => {
    const key = String(row?.activityKey || '').trim().toLowerCase();
    if (!key) return false;
    if (key === 'surf-extended-experience' || key === 'extended_experience') return false;
    return isSurfActivityKey(key);
  });
}

function ensureSurfStayLessonDefaults(guestDetails, optionsState) {
  const list = Array.isArray(guestDetails) ? guestDetails : [];
  if (!list.length) return list;
  const surfOptions = getSurfLessonOptionsFromAddons(optionsState);
  const preferredDefaultKey =
    String(
      surfOptions.find((row) => String(row?.activityKey || '').trim().toLowerCase() === 'surf-lesson-beginner')?.activityKey ||
        surfOptions[0]?.activityKey ||
        ''
    ).trim();
  const fallbackKey =
    String(list[0]?.enquiryActivityKey || '').trim() ||
    preferredDefaultKey;
  if (!fallbackKey) return list;
  return list.map((row) => {
    const nextKey = String(row?.enquiryActivityKey || fallbackKey).trim();
    const nextLessonFormat = normalizeLessonFormatForActivity(nextKey, row?.lessonFormat || '', 'surf_stay');
    return {
      ...row,
      enquiryActivityKey: nextKey,
      lessonFormat: nextLessonFormat,
      surfLessonRequest: row?.surfLessonRequest || mapActivityKeyToSurfLessonRequest(nextKey, nextLessonFormat),
    };
  });
}

function normalizeTransportShared(next = {}) {
  return {
    transferType: next.transferType || '',
    arrivalReference: next.arrivalReference || '',
    arrivalTime: next.arrivalTime || '',
  };
}

function buildAssignedStayLines(guestCount, roomSelections, options) {
  const selected = (roomSelections || [])
    .map((row) => ({
      roomTypeKey: row.roomTypeKey,
      quantityUnits: Math.max(0, Number(row.quantity || row.quantityUnits || 0)),
      capacityPerUnit: Math.max(1, getCapacityPerUnit(row.roomTypeKey, options)),
    }))
    .filter((row) => row.quantityUnits > 0);
  const assignedByKey = {};
  let remaining = Math.max(0, Number(guestCount || 0));
  // First pass: keep mixed allocations intuitive by placing at least one guest
  // into each selected room type when guest count allows it.
  for (const row of selected) {
    if (remaining <= 0) break;
    const minAssigned = Math.min(1, row.quantityUnits * row.capacityPerUnit);
    if (minAssigned <= 0) continue;
    assignedByKey[row.roomTypeKey] = minAssigned;
    remaining -= minAssigned;
  }
  // Second pass: fill remaining guests within selected capacities.
  for (const row of selected) {
    if (remaining <= 0) break;
    const alreadyAssigned = Math.max(0, Number(assignedByKey[row.roomTypeKey] || 0));
    const maxGuests = row.quantityUnits * row.capacityPerUnit;
    const canAdd = Math.max(0, maxGuests - alreadyAssigned);
    if (canAdd <= 0) continue;
    const add = Math.min(remaining, canAdd);
    assignedByKey[row.roomTypeKey] = alreadyAssigned + add;
    remaining -= add;
  }
  for (const row of selected) {
    if (assignedByKey[row.roomTypeKey] == null) assignedByKey[row.roomTypeKey] = 0;
  }
  return {
    ok: remaining <= 0,
    remainingGuests: remaining,
    lines: selected.map((row) => ({
      roomTypeKey: row.roomTypeKey,
      quantityUnits: Math.max(
        0,
        Math.min(
          row.quantityUnits,
          Math.ceil(Math.max(0, Number(assignedByKey[row.roomTypeKey] || 0)) / row.capacityPerUnit)
        )
      ),
      guestsAssigned: assignedByKey[row.roomTypeKey] || 0,
    })).filter((row) => Number(row.quantityUnits || 0) > 0 && Number(row.guestsAssigned || 0) > 0),
  };
}

function normalizeRoomSelectionsForGuestCount(roomSelections, guestCount, preferredRoomTypeKey = '') {
  const normalized = (roomSelections || [])
    .map((row) => ({
      roomTypeKey: String(row?.roomTypeKey || '').trim(),
      quantity: Math.max(0, Number(row?.quantity || row?.quantityUnits || 0)),
    }))
    .filter((row) => row.roomTypeKey);
  if (Number(guestCount || 0) !== 1) return normalized;
  const positive = normalized.filter((row) => row.quantity > 0);
  if (!positive.length) return normalized.filter((row) => row.quantity > 0);
  const preferredKey = String(preferredRoomTypeKey || '').trim();
  const keepKey = positive.some((row) => row.roomTypeKey === preferredKey)
    ? preferredKey
    : positive[positive.length - 1].roomTypeKey;
  return normalized
    .map((row) => ({
      roomTypeKey: row.roomTypeKey,
      quantity: row.roomTypeKey === keepKey ? Math.max(1, row.quantity) : 0,
    }))
    .filter((row) => row.quantity > 0);
}

function buildStayPricingSnapshot({ bookingFlow, checkIn, checkOut, guests, stayLines, options, coreAddons, experienceRequests }) {
  const nights = getNights(checkIn, checkOut);
  const isRetreatFlow = String(bookingFlow || '') === 'retreats';
  const isPackageLikeFlow = String(bookingFlow || '').startsWith('package_') || isRetreatFlow;
  const roomByKey = new Map((options || []).map((x) => [x.roomTypeKey, x]));
  const lines = [];
  let total = 0;

  const lineByKey = new Map((stayLines || []).map((x) => [x.roomTypeKey, x]));
  const dorm = lineByKey.get('dorm');
  const single = lineByKey.get('single');
  const double = lineByKey.get('double');

  if (bookingFlow === 'surf_stay') {
    const dormRule = roomByKey.get('dorm');
    const basePerGuest = Number(dormRule?.unitPrice || 0);
    const baseTotal = basePerGuest * Number(guests || 0) * nights;
    if (basePerGuest > 0) {
      lines.push({
        key: 'surf_base',
        label: 'Surf & Stay base',
        qty: Number(guests || 0),
        nights,
        unitPrice: basePerGuest,
        currency: dormRule?.currency || 'EUR',
        total: baseTotal,
      });
      total += baseTotal;
    }

    const singleRule = roomByKey.get('single');
    const singleUpgrade = Number(singleRule?.unitPrice || 0);
    const singleGuests = Number(single?.guestsAssigned || 0);
    if (singleUpgrade > 0 && singleGuests > 0) {
      const singleTotal = singleUpgrade * singleGuests * nights;
      lines.push({
        key: 'surf_upgrade_single',
        label: 'Single room upgrade',
        qty: singleGuests,
        nights,
        unitPrice: singleUpgrade,
        currency: singleRule?.currency || 'EUR',
        total: singleTotal,
      });
      total += singleTotal;
    }

    const doubleRule = roomByKey.get('double');
    const doubleQty = Number(double?.quantityUnits || 0);
    if (doubleQty > 0) {
      const assigned = Math.max(0, Number(double?.guestsAssigned || 0));
      const doubleOccRooms = Math.min(doubleQty, Math.floor(assigned / 2));
      const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
      const singleOccRate = Number(doubleRule?.singleOccPrice || doubleRule?.unitPrice || 0);
      const doubleOccRate = Number(doubleRule?.doubleOccPrice || singleOccRate || 0);
      const doubleTotal = nights * (singleOccRooms * singleOccRate + doubleOccRooms * doubleOccRate);
      if (singleOccRate > 0 || doubleOccRate > 0) {
        lines.push({
          key: 'surf_upgrade_double',
          label: 'Double room upgrade',
          qty: doubleQty,
          nights,
          singleOccRooms,
          doubleOccRooms,
          singleOccRate,
          doubleOccRate,
          currency: doubleRule?.currency || 'EUR',
          total: doubleTotal,
        });
        total += doubleTotal;
      }
    }
  } else if (isPackageLikeFlow) {
    const dormRule = roomByKey.get('dorm');
    const basePerGuest = Number(dormRule?.unitPrice || 0);
    const baseTotal = basePerGuest * Number(guests || 0);
    if (basePerGuest > 0) {
      lines.push({
        key: isRetreatFlow ? 'retreat_base' : 'package_base',
        label: isRetreatFlow ? 'Retreat base (dorm included)' : 'Package base (dorm included)',
        qty: Number(guests || 0),
        unitPrice: basePerGuest,
        currency: dormRule?.currency || 'EUR',
        total: baseTotal,
      });
      total += baseTotal;
    }

    const singleRule = roomByKey.get('single');
    const singleUpgrade = Number(singleRule?.unitPrice || 0);
    const singleGuests = Number(single?.guestsAssigned || 0);
    if (singleUpgrade > 0 && singleGuests > 0) {
      const singleTotal = singleUpgrade * singleGuests;
      lines.push({
        key: isRetreatFlow ? 'retreat_upgrade_single' : 'package_upgrade_single',
        label: 'Single room upgrade',
        qty: singleGuests,
        unitPrice: singleUpgrade,
        currency: singleRule?.currency || 'EUR',
        total: singleTotal,
      });
      total += singleTotal;
    }

    const doubleRule = roomByKey.get('double');
    const doubleQty = Number(double?.quantityUnits || 0);
    if (doubleQty > 0) {
      const assigned = Math.max(0, Number(double?.guestsAssigned || 0));
      const singleOccGuests = assigned % 2;
      const doubleOccGuests = Math.max(0, assigned - singleOccGuests);
      const singleOccRate = Number(doubleRule?.singleOccPrice || doubleRule?.unitPrice || 0);
      const doubleOccRate = Number(doubleRule?.doubleOccPrice || singleOccRate || 0);
      const doubleTotal = singleOccGuests * singleOccRate + doubleOccGuests * doubleOccRate;
      if (doubleTotal > 0 || singleOccRate > 0 || doubleOccRate > 0) {
        lines.push({
          key: isRetreatFlow ? 'retreat_upgrade_double' : 'package_upgrade_double',
          label: 'Double room upgrade',
          qty: doubleQty,
          singleOccGuests,
          doubleOccGuests,
          singleOccRate,
          doubleOccRate,
          currency: doubleRule?.currency || 'EUR',
          total: doubleTotal,
        });
        total += doubleTotal;
      }
    }
  } else {
    for (const row of stayLines || []) {
      const opt = roomByKey.get(row.roomTypeKey);
      const qty = Number(row.quantityUnits || 0);
      if (!opt || qty <= 0) continue;
      const lineTotal = Number(opt.unitPrice || 0) * qty * nights;
      lines.push({
        key: `stay_${row.roomTypeKey}`,
        label: opt.title || row.roomTypeKey,
        qty,
        nights,
        unitPrice: Number(opt.unitPrice || 0),
        currency: opt.currency || 'EUR',
        total: lineTotal,
      });
      total += lineTotal;
    }
  }

  const addon = coreAddons || {};
  if (addon.dinner && !isPackageLikeFlow) {
    const dinnerStandard = Number(addon.dinnerStandardRate || 0);
    const dinnerDoubleSingle = Number(addon.dinnerDoubleSingleOccRate || 0);
    const dinnerDoubleDouble = Number(addon.dinnerDoubleDoubleOccRate || 0);
    const doubleLine = lineByKey.get('double');
    const doubleQty = Number(doubleLine?.quantityUnits || 0);
    const assignedDouble = Math.max(0, Number(doubleLine?.guestsAssigned || 0));
    const doubleOccRooms = Math.min(doubleQty, Math.floor(assignedDouble / 2));
    const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
    const nonDoubleGuests = Math.max(0, Number(guests || 0) - assignedDouble);
    const dinnerTotal =
      nights * (nonDoubleGuests * dinnerStandard + singleOccRooms * dinnerDoubleSingle + doubleOccRooms * dinnerDoubleDouble);
    if (dinnerTotal > 0) {
      lines.push({
        key: 'addon_dinner',
        label: 'Dinner add-on',
        nights,
        currency: addon.currency || 'EUR',
        total: dinnerTotal,
      });
      total += dinnerTotal;
    }
  }

  const transferTypes = getSelectedTransferTypes(addon);
  if (transferTypes.length > 0) {
    const isSplit = transferTypes.length >= 2;
    for (const transferType of transferTypes) {
      const rate = transferType === 'airport' ? Number(addon.transferAirportRate || 0) : Number(addon.transferBusRate || 0);
      const vehiclesForType = isSplit
        ? clampTransferVehicles(
            transferType === 'airport' ? addon.transferAirportVehicles || 1 : addon.transferBusVehicles || 1,
            guests
          )
        : clampTransferVehicles(addon.transferVehicles || 1, guests);
      const transferTotal = rate * vehiclesForType;
      if (transferTotal <= 0) continue;
      lines.push({
        key: `addon_transfer_${transferType}`,
        label: transferType === 'airport' ? 'Airport transfer' : 'Bus transfer',
        qty: vehiclesForType,
        currency: addon.currency || 'EUR',
        total: transferTotal,
      });
      total += transferTotal;
    }
  }

  const experienceList = Array.isArray(experienceRequests) ? experienceRequests : [];
  const flowLower = String(bookingFlow || '').trim().toLowerCase();
  for (const exp of experienceList) {
    const activityKey = String(exp?.activityKey || '').trim();
    if (!activityKey) continue;
    if (flowLower === 'surf_stay' && activityKey.toLowerCase() === 'surf-lesson-beginner') continue;
    const unit = Number(exp?.effectivePriceEur || exp?.priceFromEur || 0);
    if (!(unit > 0)) continue;
    const qty = Math.max(1, Number(guests || 0));
    const lineTotal = unit * qty;
    lines.push({
      key: `addon_activity_${activityKey}`,
      label: `${String(exp?.title || activityKey).trim()} (estimate)`,
      qty,
      unitPrice: unit,
      currency: String(exp?.currency || 'EUR').trim() || 'EUR',
      total: lineTotal,
      estimateOnly: true,
      preferredDate: String(exp?.preferredDate || '').trim(),
      priceLabel: String(exp?.priceLabel || '').trim(),
    });
    total += lineTotal;
  }

  return {
    flow: bookingFlow,
    nights,
    lines,
    total,
    currency: lines[0]?.currency || 'EUR',
  };
}

$w.onReady(() => {
  log('page ready');
  const ce = $w('#bookingWizard');
  if (!ce) {
    log('custom element not found', { expectedId: '#bookingWizard' });
    return;
  }

  const context = readContext();
  const state = {
    bookingFlow: context.flow,
    packageKey: context.packageKey || packageKeyFromFlow(context.flow),
    packageSessionId: context.sessionId || '',
    packageMinParticipants: 0,
    packageMaxParticipants: 0,
    enquiryType: context.enquiryType || '',
    retreatMode: context.retreatMode === true,
    retreatKey: context.retreatKey || '',
    retreatSessionId: context.retreatSessionId || '',
    currentStep: 1,
    submissionStatus: 'idle',
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    roomSelections: [],
    roomRecommendation: normalizeRoomRecommendation({
      status: 'none',
      suggestedSelections: [],
    }),
    coreAddons: normalizeCoreAddonsWithPackageTransfer({
      dinner: false,
      transferType: 'none',
      transferTypes: [],
      transferVehicles: 1,
      transferTravelTogether: 'yes',
    }, 1, context.flow),
    experienceRequests: [],
    experienceLessonFormats: {},
    guestDetails: normalizeGuestDetails([], 1),
    activityDatePrefs: {},
    stayPreferSingleRooms: false,
    bnbPreferSingleRooms: false,
    transportShared: normalizeTransportShared({}),
    surfStayOfferDismissed: context.flow === 'surf_stay',
    termsAccepted: false,
    dietaryNotes: '',
    retreatIntakeJson: {},
    // Custom Retreat (bespoke 5-step request) state:
    customRetreatRequestMode: context.customRetreatRequestMode === true,
    retreatBrowseMode: context.retreatBrowseMode === true,
    // True once the user has explicitly opted into the bespoke Custom Retreat flow
    // (either via URL with enquiryType=custom_retreat OR by clicking the third card in browse mode).
    customRetreatChosen: context.customRetreatRequestMode === true,
    wholeHouseEnquiry: false,
    guestCountry: '',
    guestCount: context.guestCount || 1,
    checkIn: context.checkIn || '',
    checkOut: context.checkOut || '',
  };
  const theme = {
    accent: '#de7a45',
    bg: 'transparent',
    surface: '#ffffff',
  };
  const optionsState = {
    packageSessions: [],
    retreatCatalog: [],
    retreatSessions: [],
    stayRooms: [],
    // Static room metadata used by the Custom Retreat (bespoke) flow only.
    // Loaded once via loadRoomTypeMetadata() — image/title/maxUnits, no availability.
    customRetreatRoomMeta: [],
    addons: {
      core: {},
      experiences: [],
      nights: 1,
    },
  };

  async function ensureCustomRetreatRoomMeta() {
    if (Array.isArray(optionsState.customRetreatRoomMeta) && optionsState.customRetreatRoomMeta.length > 0) {
      return;
    }
    try {
      const res = await loadRoomTypeMetadata();
      if (res?.ok && Array.isArray(res.options)) {
        optionsState.customRetreatRoomMeta = res.options;
        syncOptions();
        log('loadRoomTypeMetadata loaded', res.options);
      }
    } catch (e) {
      log('loadRoomTypeMetadata error', e);
    }
  }
  let loadingWatchdog = null;
  let submitInFlight = false;

  function syncOptions() {
    setJsonAttr(ce, 'options-json', optionsState);
  }

  function setLoading(isLoading, options = {}) {
    ce.setAttribute('loading', isLoading ? 'true' : 'false');
    if (loadingWatchdog) {
      clearTimeout(loadingWatchdog);
      loadingWatchdog = null;
    }
    if (isLoading) {
      const watchdogMs = Math.max(15000, Number(options.watchdogMs || 0) || 15000);
      loadingWatchdog = setTimeout(() => {
        ce.setAttribute('loading', 'false');
        submitInFlight = false;
        log('loading watchdog auto-released');
      }, watchdogMs);
    }
  }

  function waitForNextFrame() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 16);
    });
  }

  async function waitForRenderFrames(count = 1) {
    const frames = Math.max(1, Number(count) || 1);
    for (let i = 0; i < frames; i += 1) {
      await waitForNextFrame();
    }
  }

  const isPackageFlow =
    String(state.bookingFlow || '').startsWith('package_') || String(state.bookingFlow || '') === 'retreats';
  const isEnquiryFlow = String(state.bookingFlow || '') === 'enquiry';
  const isRetreatFlow = String(state.bookingFlow || '') === 'retreats';

  async function refreshPackageSessions() {
    if (!isPackageFlow) return;
    if (isRetreatFlow) return;
    const sessionsRes = await loadPackageSessionOptions({
      bookingFlow: state.bookingFlow,
      packageKey: state.packageKey || context.packageKey,
    });
    log('loadPackageSessionOptions response', sessionsRes);
    if (!sessionsRes?.ok) {
      setJsonAttr(ce, 'errors-json', { step1: sessionsRes?.message || 'Could not load package sessions.' });
      return;
    }
    optionsState.packageSessions = Array.isArray(sessionsRes.sessions) ? sessionsRes.sessions : [];
    if (!state.packageKey && sessionsRes.packageKey) state.packageKey = sessionsRes.packageKey;
    if (!state.packageSessionId && optionsState.packageSessions[0]?.sessionId) {
      state.packageSessionId = String(optionsState.packageSessions[0].sessionId || '');
    }
    if (context.sessionId && optionsState.packageSessions.some((row) => String(row.sessionId) === String(context.sessionId))) {
      state.packageSessionId = String(context.sessionId);
    }
    const selected = optionsState.packageSessions.find(
      (row) => String(row.sessionId || '') === String(state.packageSessionId || '')
    ) || optionsState.packageSessions[0];
    if (selected) {
      state.packageMinParticipants = Number(selected.minParticipants || 0) || 0;
      state.packageMaxParticipants = Number(selected.maxParticipants || 0) || 0;
      state.packageParticipantsLeft = Math.max(
        0,
        Number(selected.participantsLeft != null ? selected.participantsLeft : state.packageMaxParticipants || 0) || 0
      );
      if (Number(state.packageParticipantsLeft || 0) > 0) {
        state.guestCount = Math.min(
          Math.max(1, Number(state.guestCount || 1)),
          Number(state.packageParticipantsLeft)
        );
      } else if (Number(state.packageMaxParticipants || 0) > 0) {
        state.guestCount = 1;
      }
    }
    state.coreAddons = normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
    syncOptions();
    setJsonAttr(ce, 'state-json', state);
  }

  async function refreshRetreatSessions() {
    if (!isRetreatFlow) return;
    const retreatRes = await loadRetreatEnquiryOptions({
      retreatKey: state.retreatKey || context.retreatKey || '',
      retreatSessionId: state.retreatSessionId || context.retreatSessionId || '',
    });
    log('loadRetreatEnquiryOptions (retreat flow) response', retreatRes);
    if (!retreatRes?.ok) {
      setJsonAttr(ce, 'errors-json', { step1: retreatRes?.message || 'Could not load retreat sessions.' });
      return;
    }
    optionsState.retreatCatalog = Array.isArray(retreatRes.retreats) ? retreatRes.retreats : [];
    optionsState.retreatSessions = Array.isArray(retreatRes.sessions) ? retreatRes.sessions : [];
    const resolvedRetreatKey = String(
      state.retreatKey || context.retreatKey || retreatRes.selectedRetreatKey || ''
    );
    optionsState.packageSessions = (optionsState.retreatSessions || [])
      .filter((row) => String(row.retreatKey || '') === resolvedRetreatKey)
      .map((row) => ({
        sessionId: row.sessionId,
        packageKey: row.retreatKey,
        sessionStartDateKey: row.sessionStartDateKey,
        sessionEndDateKey: row.sessionEndDateKey,
        nights: row.nights,
        minParticipants: row.minParticipants,
        maxParticipants: row.maxParticipants,
        participantsBooked: row.participantsBooked,
        participantsLeft: row.participantsLeft,
        isSoldOut: row.isSoldOut === true,
      }));
    if (!state.retreatKey && retreatRes.selectedRetreatKey) state.retreatKey = String(retreatRes.selectedRetreatKey || '');
    if (!context.retreatKey && retreatRes.selectedRetreatKey) context.retreatKey = String(retreatRes.selectedRetreatKey || '');
    if (!state.packageSessionId && retreatRes.selectedSessionId) state.packageSessionId = String(retreatRes.selectedSessionId || '');
    if (!state.retreatSessionId && retreatRes.selectedSessionId) state.retreatSessionId = String(retreatRes.selectedSessionId || '');
    if (!context.retreatSessionId && retreatRes.selectedSessionId) context.retreatSessionId = String(retreatRes.selectedSessionId || '');
    const selectedSession = (optionsState.retreatSessions || []).find(
      (row) => String(row.sessionId || '') === String(state.retreatSessionId || state.packageSessionId || '')
    );
    if (selectedSession) {
      state.checkIn = selectedSession.sessionStartDateKey || '';
      state.checkOut = selectedSession.sessionEndDateKey || '';
    }
    syncOptions();
    setJsonAttr(ce, 'context-json', context);
    setJsonAttr(ce, 'state-json', state);
  }

  async function refreshEnquiryOptions() {
    if (!isEnquiryFlow) return;
    const enquiryType = normalizeEnquiryType(state.enquiryType || context.enquiryType || '');
    const retreatEnquiryMode = enquiryType === 'custom_retreat';
    const surfActivityMode = enquiryType === 'surf_activity';
    if (retreatEnquiryMode) {
      const retreatRes = await loadRetreatEnquiryOptions({
        retreatKey: state.retreatKey || context.retreatKey || '',
        retreatSessionId: state.retreatSessionId || context.retreatSessionId || '',
      });
      log('loadRetreatEnquiryOptions response', retreatRes);
      if (!retreatRes?.ok) {
        setJsonAttr(ce, 'errors-json', { step1: retreatRes?.message || 'Could not load retreat options.' });
        return;
      }
      optionsState.retreatCatalog = Array.isArray(retreatRes.retreats) ? retreatRes.retreats : [];
      optionsState.retreatSessions = Array.isArray(retreatRes.sessions) ? retreatRes.sessions : [];
      if (!state.retreatKey && retreatRes.selectedRetreatKey) state.retreatKey = String(retreatRes.selectedRetreatKey || '');
      if (!context.retreatKey && retreatRes.selectedRetreatKey) context.retreatKey = String(retreatRes.selectedRetreatKey || '');
      const currentSessionId = String(state.retreatSessionId || context.retreatSessionId || '').trim();
      const sessionMatchesRetreat = optionsState.retreatSessions.some(
        (row) =>
          String(row.sessionId || '') === currentSessionId &&
          String(row.retreatKey || '') === String(state.retreatKey || context.retreatKey || '')
      );
      if ((!currentSessionId || !sessionMatchesRetreat) && retreatRes.selectedSessionId) {
        state.retreatSessionId = String(retreatRes.selectedSessionId || '');
        context.retreatSessionId = String(retreatRes.selectedSessionId || '');
      }
      const selectedSession = optionsState.retreatSessions.find((row) => {
        return (
          String(row.sessionId || '') === String(state.retreatSessionId || context.retreatSessionId || '') &&
          String(row.retreatKey || '') === String(state.retreatKey || context.retreatKey || '')
        );
      });
      optionsState.packageSessions = (optionsState.retreatSessions || [])
        .filter((row) => String(row.retreatKey || '') === String(state.retreatKey || context.retreatKey || ''))
        .map((row) => ({
          sessionId: row.sessionId,
          packageKey: row.retreatKey,
          sessionStartDateKey: row.sessionStartDateKey,
          sessionEndDateKey: row.sessionEndDateKey,
          nights: row.nights,
          minParticipants: row.minParticipants,
          maxParticipants: row.maxParticipants,
          participantsBooked: row.participantsBooked,
          participantsLeft: row.participantsLeft,
          isSoldOut: row.isSoldOut === true,
        }));
      if (selectedSession) {
        state.checkIn = selectedSession.sessionStartDateKey || '';
        state.checkOut = selectedSession.sessionEndDateKey || '';
      }
    }
    let enquiryRes = { ok: false, core: {}, experiences: [] };
    try {
      enquiryRes = await loadEnquiryOptions({
        bookingFlow: 'enquiry',
        packageKey: '',
        enquiryType,
      });
      log('loadEnquiryOptions response', enquiryRes);
    } catch (e) {
      log('loadEnquiryOptions threw', e);
      enquiryRes = { ok: false, core: {}, experiences: [] };
    }
    if (!enquiryRes?.ok && !retreatEnquiryMode) {
      setJsonAttr(ce, 'errors-json', { step1: enquiryRes?.message || 'Could not load enquiry options.' });
      return;
    }
    const allExperiences = Array.isArray(enquiryRes?.experiences) ? enquiryRes.experiences : [];
    const experienceOptions = surfActivityMode ? getSurfActivityOptions(allExperiences) : allExperiences;
    optionsState.addons = {
      core: enquiryRes?.core || {},
      experiences: experienceOptions,
      nights: 1,
    };
    state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
      ...state.coreAddons,
      dinner: false,
      transferType: 'none',
      transferTypes: [],
      transferVehicles: 1,
      transferTravelTogether: 'yes',
      dinnerStandardRate: Number(optionsState.addons.core?.dinner?.standardRate || 0),
      dinnerDoubleSingleOccRate: Number(optionsState.addons.core?.dinner?.doubleSingleOccRate || 0),
      dinnerDoubleDoubleOccRate: Number(optionsState.addons.core?.dinner?.doubleDoubleOccRate || 0),
      transferAirportRate: Number(optionsState.addons.core?.transfer?.airportRate || 0),
      transferBusRate: Number(optionsState.addons.core?.transfer?.busRate || 0),
      currency: optionsState.addons.core?.dinner?.currency || optionsState.addons.core?.transfer?.currency || 'EUR',
    }, state.guestCount, state.bookingFlow);
    const fallbackActivityKey = String(context.activityKey || '').trim();
    const matchedByContext = fallbackActivityKey
      ? experienceOptions.find((row) => String(row.activityKey) === fallbackActivityKey)
      : null;
    const selectedDefault = matchedByContext || experienceOptions[0] || null;
    if (!retreatEnquiryMode && selectedDefault) {
      state.experienceRequests = [
        {
          activityKey: selectedDefault.activityKey,
          title: selectedDefault.title || selectedDefault.activityKey,
          priceLabel: selectedDefault.priceLabel || '',
        },
      ];
      state.experienceLessonFormats = {};
      const guests = Math.max(1, Number(state.guestCount || 1));
      const list = normalizeGuestDetails(state.guestDetails, guests);
      list[0] = {
        ...list[0],
        enquiryActivityKey: list[0].enquiryActivityKey || selectedDefault.activityKey,
        lessonFormat: '',
      };
      state.guestDetails = list;
    }
    if (retreatEnquiryMode) {
      state.experienceRequests = [];
      state.experienceLessonFormats = {};
      state.activityDatePrefs = {};
    }
    syncOptions();
    setJsonAttr(ce, 'state-json', state);
  }

  log('url context parsed', context);
  setLoading(true);
  setJsonAttr(ce, 'context-json', context);
  setJsonAttr(ce, 'state-json', state);
  syncOptions();
  setJsonAttr(ce, 'errors-json', {});
  setJsonAttr(ce, 'theme-json', theme);
  const initTasks = [];
  if (isPackageFlow) {
    initTasks.push(
      refreshPackageSessions().catch((e) => {
        log('loadPackageSessionOptions error', e);
        setJsonAttr(ce, 'errors-json', { step1: 'Could not load package sessions.' });
      })
    );
  }
  if (isEnquiryFlow) {
    initTasks.push(
      refreshEnquiryOptions().catch((e) => {
        log('loadEnquiryOptions error', e);
        setJsonAttr(ce, 'errors-json', { step1: 'Could not load enquiry options.' });
      })
    );
  }
  if (isRetreatFlow) {
    initTasks.push(
      refreshRetreatSessions().catch((e) => {
        log('refreshRetreatSessions init error', e);
        setJsonAttr(ce, 'errors-json', { step1: 'Could not load retreat sessions.' });
      })
    );
  }
  // Custom Retreat (bespoke flow) — preload room metadata for the accommodation step.
  if (state.customRetreatChosen === true || context.customRetreatRequestMode === true || context.retreatBrowseMode === true) {
    initTasks.push(
      ensureCustomRetreatRoomMeta().catch((e) => {
        log('ensureCustomRetreatRoomMeta init error', e);
      })
    );
  }
  if (initTasks.length) {
    Promise.all(initTasks).finally(() => setLoading(false));
  } else {
    setLoading(false);
  }

  ce.on('layout-height', (event) => {
    const height = Number(event.detail?.height || 0);
    if (!(height > 0)) return;
    const nextHeight = Math.max(480, Math.min(12000, Math.ceil(height)));
    try {
      ce.height = nextHeight;
    } catch (e) {
      log('layout-height apply failed', e);
    }
  });

  ce.on('booking-init', () => {
    log('event booking-init');
    setLoading(true);
    setJsonAttr(ce, 'context-json', context);
    setJsonAttr(ce, 'state-json', state);
    syncOptions();
    setJsonAttr(ce, 'errors-json', {});
    setJsonAttr(ce, 'theme-json', theme);
    const tasks = [];
    if (isPackageFlow) {
      tasks.push(
        refreshPackageSessions().catch((e) => {
          log('refreshPackageSessions on booking-init error', e);
        })
      );
    }
    if (isEnquiryFlow) {
      tasks.push(
        refreshEnquiryOptions().catch((e) => {
          log('refreshEnquiryOptions on booking-init error', e);
        })
      );
    }
    if (isRetreatFlow) {
      tasks.push(
        refreshRetreatSessions().catch((e) => {
          log('refreshRetreatSessions on booking-init error', e);
        })
      );
    }
    if (state.customRetreatChosen === true || context.customRetreatRequestMode === true || context.retreatBrowseMode === true) {
      tasks.push(
        ensureCustomRetreatRoomMeta().catch((e) => {
          log('ensureCustomRetreatRoomMeta on booking-init error', e);
        })
      );
    }
    if (tasks.length) {
      Promise.all(tasks).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  });

  ce.on('step-submit', async (event) => {
    const detail = event.detail || {};
    log('event step-submit', detail);

    if (detail.variant !== 'stay' && detail.variant !== 'package' && detail.variant !== 'enquiry') return;

    // Bespoke Custom Retreat 5-step flow.
    // Pure enquiry: validates per-step requirements only, never touches inventory/holds.
    if (detail.variant === 'enquiry' && detail.flow === 'custom_retreat') {
      const payload = detail.payload || {};
      const todayKey = new Date().toISOString().slice(0, 10);
      if (detail.step === 1) {
        const guests = Math.max(1, Math.min(20, Number(payload.guests || 0)));
        const checkIn = String(payload.checkIn || '').trim();
        const checkOut = String(payload.checkOut || '').trim();
        if (!guests) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please provide a guest count.' });
          return;
        }
        if (!checkIn || !checkOut) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please provide preferred arrival and departure dates.' });
          return;
        }
        if (checkOut <= checkIn) {
          setJsonAttr(ce, 'errors-json', { step1: 'Departure must be after arrival.' });
          return;
        }
        if (checkIn < todayKey) {
          setJsonAttr(ce, 'errors-json', { step1: 'Arrival date cannot be in the past.' });
          return;
        }
        state.guestCount = guests;
        state.checkIn = checkIn;
        state.checkOut = checkOut;
        state.guestDetails = normalizeGuestDetails(state.guestDetails, guests);
        state.currentStep = 2;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        return;
      }
      if (detail.step === 2) {
        const wholeHouse = payload.wholeHouseEnquiry === true;
        const roomSelections = Array.isArray(payload.roomSelections) ? payload.roomSelections : [];
        const totalUnits = roomSelections.reduce((acc, row) => acc + Math.max(0, Number(row.quantity || 0)), 0);
        if (!wholeHouse && totalUnits === 0) {
          setJsonAttr(ce, 'errors-json', {
            step2: 'Please select at least one room or tick the "whole house" option.',
          });
          return;
        }
        state.wholeHouseEnquiry = wholeHouse;
        state.roomSelections = wholeHouse ? [] : roomSelections;
        state.currentStep = 3;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        return;
      }
      if (detail.step === 3) {
        const types = Array.isArray(payload.retreatTypes) ? payload.retreatTypes.filter(Boolean) : [];
        const otherText = String(payload.retreatTypeOther || '').trim();
        if (types.length === 0) {
          setJsonAttr(ce, 'errors-json', { step3: 'Please select at least one retreat type.' });
          return;
        }
        if (types.includes('other') && !otherText) {
          setJsonAttr(ce, 'errors-json', { step3: 'Please describe the "Other" retreat type.' });
          return;
        }
        const current = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
        state.retreatIntakeJson = {
          ...current,
          retreatTypes: types,
          retreatTypeOther: types.includes('other') ? otherText : '',
        };
        state.currentStep = 4;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        return;
      }
      if (detail.step === 4) {
        const vision = String(payload.vision || '').trim();
        const activitiesWanted = String(payload.activitiesWanted || '').trim();
        const specialRequirements = String(payload.specialRequirements || '').trim();
        if (!vision) {
          setJsonAttr(ce, 'errors-json', { step4: 'Please tell us what you are hoping to create.' });
          return;
        }
        if (!activitiesWanted) {
          setJsonAttr(ce, 'errors-json', { step4: 'Please share which activities or experiences you would like.' });
          return;
        }
        const current = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
        state.retreatIntakeJson = {
          ...current,
          vision,
          activitiesWanted,
          specialRequirements,
        };
        state.currentStep = 5;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        return;
      }
      return;
    }

    if (detail.variant === 'enquiry') {
      if (detail.step === 1) {
        const payload = detail.payload || {};
        const guests = Math.max(0, Number(payload.guests || state.guestCount || 0));
        const notes = String(payload.notes || state.activityRequestNotes || '').trim();
        const enquiryType = normalizeEnquiryType(state.enquiryType || '');
        const isRetreatEnquiry = enquiryType === 'custom_retreat';
        const surfActivityMode = enquiryType === 'surf_activity';
        const activityEnquiryMode = enquiryType === 'activity_enquiry';
        if (isRetreatEnquiry && !normalizeRetreatKey(state.retreatKey || context.retreatKey || '')) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please select your retreat before continuing.' });
          return;
        }
        if (isRetreatEnquiry) {
          const sessionId = String(payload.retreatSessionId || state.retreatSessionId || context.retreatSessionId || '').trim();
          const selectedSession = (optionsState.retreatSessions || []).find(
            (row) => String(row.sessionId || '') === sessionId && String(row.retreatKey || '') === String(state.retreatKey || context.retreatKey || '')
          );
          if (!sessionId || !selectedSession) {
            setJsonAttr(ce, 'errors-json', { step1: 'Please select an available retreat session.' });
            return;
          }
          if (selectedSession.isSoldOut === true || Number(selectedSession.participantsLeft || 0) <= 0) {
            setJsonAttr(ce, 'errors-json', { step1: 'This retreat session is currently full. Please choose another date.' });
            return;
          }
          if (guests > Number(selectedSession.participantsLeft || 0)) {
            setJsonAttr(ce, 'errors-json', {
              step1: `Only ${selectedSession.participantsLeft} participant slots are left for this retreat session.`,
            });
            return;
          }
          state.retreatSessionId = sessionId;
          context.retreatSessionId = sessionId;
          state.checkIn = selectedSession.sessionStartDateKey || '';
          state.checkOut = selectedSession.sessionEndDateKey || '';
        }
        if (!guests) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please provide guest count.' });
          return;
        }
        if (enquiryType === 'custom_package' && guests < 3) {
          setJsonAttr(ce, 'errors-json', { step1: 'Custom Package enquiry requires at least 3 guests.' });
          return;
        }
        if (enquiryType === 'custom_package' && !notes) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please describe your custom request.' });
          return;
        }
        if (activityEnquiryMode) {
          const requestedActivity =
            String(context.activityKey || '') ||
            String(state.experienceRequests?.[0]?.activityKey || '') ||
            String(optionsState.addons.experiences?.[0]?.activityKey || '');
          if (!requestedActivity) {
            setJsonAttr(ce, 'errors-json', { step1: 'No activity was selected for this enquiry.' });
            return;
          }
        }
        state.guestCount = guests;
        state.activityRequestNotes = surfActivityMode ? String(state.activityRequestNotes || '').trim() : notes;
        state.checkIn = payload.checkIn || state.checkIn || '';
        state.checkOut = payload.checkOut || state.checkOut || '';
        state.coreAddons = normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
        const list = normalizeGuestDetails(state.guestDetails, guests);
        if (surfActivityMode) {
          const defaultActivityKey =
            String(list[0]?.enquiryActivityKey || '') ||
            String(context.activityKey || '') ||
            String(state.experienceRequests?.[0]?.activityKey || '') ||
            String(optionsState.addons.experiences?.[0]?.activityKey || '');
          if (defaultActivityKey) {
            list[0] = { ...list[0], enquiryActivityKey: list[0].enquiryActivityKey || defaultActivityKey, lessonFormat: '' };
            for (let i = 1; i < list.length; i += 1) {
              if (!String(list[i].enquiryActivityKey || '').trim()) {
                list[i] = { ...list[i], enquiryActivityKey: defaultActivityKey, lessonFormat: '' };
              }
            }
          }
        }
        state.guestDetails = list;
        state.currentStep = 2;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});

        // Meta CAPI: enquiry funnel reaches the data-entry step → InitiateCheckout.
        try {
          const retreatKeyForId = normalizeRetreatKey(state.retreatKey || context.retreatKey || '');
          const contentIds = [retreatKeyForId || state.enquiryType || 'enquiry'].filter(Boolean);
          await trackMetaInitiateCheckout({
            currency: 'EUR',
            contentType: 'product',
            contentCategory: state.bookingFlow || 'enquiry',
            contentName: String(state.enquiryType || ''),
            contentIds,
            numItems: Number(state.guestCount || 0) || undefined,
          });
        } catch (e) {
          log('trackMetaInitiateCheckout (enquiry) error', e);
        }
      }
      return;
    }

    if (detail.step === 1) {
      const payload = detail.payload || {};
      const guests = Number(payload.guests || 0);
      const isPackageVariant = detail.variant === 'package';
      if (!guests) {
        setJsonAttr(ce, 'errors-json', { step1: 'Please provide valid guest count.' });
        return;
      }
      setLoading(true);
      try {
        let roomResult;
        if (isPackageVariant) {
          const packageSessionId = String(payload.packageSessionId || payload.retreatSessionId || '').trim();
          if (!packageSessionId) {
            setJsonAttr(ce, 'errors-json', { step1: 'Please select a package session.' });
            return;
          }
          const selectedSession = (optionsState.packageSessions || []).find(
            (row) => String(row.sessionId || '') === packageSessionId
          );
          const participantsLeft = Math.max(0, Number(selectedSession?.participantsLeft || 0));
          if (selectedSession && (selectedSession.isSoldOut === true || participantsLeft <= 0)) {
            setJsonAttr(ce, 'errors-json', {
              step1: 'This session is fully booked. Please choose another session.',
            });
            return;
          }
          state.packageSessionId = packageSessionId;
          roomResult =
            state.bookingFlow === 'retreats'
              ? await loadRetreatRoomOptions({
                  retreatSessionId: packageSessionId,
                })
              : await loadPackageRoomOptions({
                  bookingFlow: state.bookingFlow,
                  packageSessionId,
                });
          log('loadPackageRoomOptions response', roomResult);
          if (roomResult?.ok) {
            state.checkIn = roomResult.checkIn || '';
            state.checkOut = roomResult.checkOut || '';
            if (roomResult.packageKey) state.packageKey = roomResult.packageKey;
            if (state.bookingFlow === 'retreats') {
              state.retreatSessionId = packageSessionId;
              context.retreatSessionId = packageSessionId;
            }
            state.packageMinParticipants = Number(roomResult.minParticipants || state.packageMinParticipants || 0) || 0;
            state.packageMaxParticipants = Number(roomResult.maxParticipants || state.packageMaxParticipants || 0) || 0;
            state.packageParticipantsLeft = Math.max(
              0,
              Number(
                roomResult.participantsLeft != null
                  ? roomResult.participantsLeft
                  : selectedSession?.participantsLeft || state.packageParticipantsLeft || 0
              ) || 0
            );
          }
          if (Number(state.packageParticipantsLeft || 0) > 0 && guests > Number(state.packageParticipantsLeft)) {
            setJsonAttr(ce, 'errors-json', {
              step1: `Only ${state.packageParticipantsLeft} participant slots left for this session.`,
            });
            return;
          }
          if (Number(state.packageParticipantsLeft || 0) <= 0) {
            setJsonAttr(ce, 'errors-json', { step1: 'This session is fully booked. Please choose another session.' });
            return;
          }
        } else {
          if (!payload.checkIn || !payload.checkOut || payload.checkOut <= payload.checkIn) {
            setJsonAttr(ce, 'errors-json', { step1: 'Please provide valid guests and dates.' });
            return;
          }
          roomResult = await loadStayRoomOptions({ ...payload, bookingFlow: state.bookingFlow });
          log('loadStayRoomOptions response', roomResult);
          if (roomResult?.ok) {
            state.checkIn = payload.checkIn;
            state.checkOut = payload.checkOut;
          }
        }
        if (!roomResult.ok) {
          setJsonAttr(ce, 'errors-json', { step1: roomResult.message || 'Failed to load room availability.' });
          return;
        }
        const loadedStayRooms = Array.isArray(roomResult.options) ? roomResult.options : [];
        const totalAvailableSlots = getTotalAvailableGuestSlots(loadedStayRooms);
        if (totalAvailableSlots <= 0) {
          setJsonAttr(ce, 'errors-json', {
            step1: isPackageVariant
              ? 'This session is currently fully booked. Please choose another session.'
              : 'No rooms are available for your selected dates. Please choose different dates.',
          });
          return;
        }
        if (guests > totalAvailableSlots) {
          setJsonAttr(ce, 'errors-json', {
            step1: isPackageVariant
              ? `Only ${totalAvailableSlots} place(s) are currently available for this session.`
              : `Only ${totalAvailableSlots} place(s) are currently available for your selected dates.`,
          });
          return;
        }
        state.currentStep = 2;
        state.submissionStatus = 'idle';
        state.guestCount = guests;
        state.coreAddons = normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
        state.guestDetails = normalizeGuestDetails(state.guestDetails, guests);
        optionsState.stayRooms = loadedStayRooms;
        const existingSelections = normalizeRoomSelectionsForGuestCount(
          Array.isArray(state.roomSelections) ? state.roomSelections : [],
          guests
        );
        const existingHasSelection = existingSelections.some((row) => row.quantity > 0);
        const existingSlots = getSelectedSlots(existingSelections, optionsState.stayRooms);
        const existingInvalid = exceedsAvailability(existingSelections, optionsState.stayRooms);
        const existingAssigned = buildAssignedStayLines(guests, existingSelections, optionsState.stayRooms);
        const existingMatchesDemand = existingAssigned.ok;
        const canKeepExistingSelections =
          existingHasSelection && !existingInvalid && existingMatchesDemand;
        const preferSingles = state.stayPreferSingleRooms === true || state.bnbPreferSingleRooms === true;
        const preferredSelections = preferSingles ? suggestStayRoomSelectionsPreferSingles(guests, optionsState.stayRooms) : [];
        const preferredAssigned = buildAssignedStayLines(guests, preferredSelections, optionsState.stayRooms);
        const canUsePreferredSelections =
          preferredSelections.length > 0 &&
          !exceedsAvailability(preferredSelections, optionsState.stayRooms) &&
          preferredAssigned.ok;
        const suggestedSelections = suggestStayRoomSelections(guests, optionsState.stayRooms);
        if (canKeepExistingSelections) {
          state.roomSelections = existingSelections;
          state.roomRecommendation = normalizeRoomRecommendation({
            ...state.roomRecommendation,
            suggestedSelections,
          });
        } else if (canUsePreferredSelections) {
          state.roomSelections = preferredSelections;
          state.roomRecommendation = normalizeRoomRecommendation({
            status: 'none',
            suggestedSelections,
          });
        } else if (isPackageVariant) {
          const dormAvailable = Math.max(
            0,
            Number(optionsState.stayRooms.find((x) => String(x.roomTypeKey || '') === 'dorm')?.available || 0)
          );
          state.roomSelections = [{ roomTypeKey: 'dorm', quantity: Math.min(guests, dormAvailable) }];
          state.roomRecommendation = {
            status: suggestedSelections.length ? 'pending' : 'none',
            suggestedSelections,
          };
        } else {
          state.roomSelections = [];
          state.roomRecommendation = {
            status: suggestedSelections.length ? 'pending' : 'none',
            suggestedSelections,
          };
        }
        log('suggested room combination', {
          guests,
          suggested: suggestedSelections,
        });
        optionsState.addons.nights = getNights(state.checkIn, state.checkOut);
        setJsonAttr(ce, 'state-json', state);
        syncOptions();
        setJsonAttr(ce, 'errors-json', {});
      } catch (e) {
        log('loadStayRoomOptions error', e);
        setJsonAttr(ce, 'errors-json', { step1: 'Failed to load room availability.' });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (detail.step === 2) {
      const guestCount = Number(state.guestCount || 0);
      const overSelected = (state.roomSelections || []).some((row) => {
        const opt = optionsState.stayRooms.find((x) => x.roomTypeKey === row.roomTypeKey);
        const max = Math.max(0, Number(opt?.available || 0));
        return Number(row.quantity || 0) > max;
      });
      const assigned = buildAssignedStayLines(guestCount, state.roomSelections, optionsState.stayRooms);
      if (guestCount <= 0) {
        setJsonAttr(ce, 'errors-json', {
          step2: 'Guest count is required before room allocation.',
        });
        return;
      }
      if (overSelected) {
        setJsonAttr(ce, 'errors-json', {
          step2: 'Selected quantity exceeds current availability. Please refresh room options.',
        });
        return;
      }
      if (!assigned.ok) {
        setJsonAttr(ce, 'errors-json', {
          step2: `Room assignment is incomplete. Remaining guests: ${assigned.remainingGuests}.`,
        });
        return;
      }
      setLoading(true);
      try {
        if (state.bookingFlow === 'retreats') {
          state.experienceRequests = [];
          state.activityDatePrefs = {};
          state.currentStep = 3;
          setJsonAttr(ce, 'state-json', state);
          setJsonAttr(ce, 'errors-json', {});
          return;
        }
        const addonResult = await loadStayAddonOptions({
          bookingFlow: state.bookingFlow,
          checkIn: state.checkIn,
          checkOut: state.checkOut,
          guests: state.guestCount,
          packageKey: state.packageKey || context.packageKey,
        });
        log('loadStayAddonOptions response', addonResult);
        if (!addonResult.ok) {
          setJsonAttr(ce, 'errors-json', { step3: addonResult.message || 'Could not load add-ons.' });
          return;
        }
        optionsState.addons = {
          core: addonResult.core || {},
          experiences: Array.isArray(addonResult.experiences) ? addonResult.experiences : [],
          nights: Number(addonResult.nights || optionsState.addons.nights || 1),
        };
        state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
          dinner: false,
          transferType: 'none',
          transferTypes: [],
          transferVehicles: 1,
          transferTravelTogether: 'yes',
          dinnerStandardRate: Number(optionsState.addons.core?.dinner?.standardRate || 0),
          dinnerDoubleSingleOccRate: Number(optionsState.addons.core?.dinner?.doubleSingleOccRate || 0),
          dinnerDoubleDoubleOccRate: Number(optionsState.addons.core?.dinner?.doubleDoubleOccRate || 0),
          transferAirportRate: Number(optionsState.addons.core?.transfer?.airportRate || 0),
          transferBusRate: Number(optionsState.addons.core?.transfer?.busRate || 0),
          currency: optionsState.addons.core?.dinner?.currency || optionsState.addons.core?.transfer?.currency || 'EUR',
        }, state.guestCount, state.bookingFlow);
        if (state.bookingFlow === 'surf_stay' && detail.variant !== 'package') {
          state.guestDetails = ensureSurfStayLessonDefaults(
            normalizeGuestDetails(state.guestDetails, state.guestCount),
            optionsState
          );
        }
        state.currentStep = 3;
        setJsonAttr(ce, 'state-json', state);
        syncOptions();
        setJsonAttr(ce, 'errors-json', {});
      } catch (e) {
        log('loadStayAddonOptions error', e);
        setJsonAttr(ce, 'errors-json', { step3: 'Could not load add-ons.' });
      } finally {
        setLoading(false);
      }
    }

    if (detail.step === 3) {
      const transferTypes = getSelectedTransferTypes(state.coreAddons || {});
      const travelTogether = state.coreAddons?.transferTravelTogether || '';
      if (transferTypes.length > 0 && Number(state.guestCount || 0) > 1 && travelTogether !== 'yes' && travelTogether !== 'no') {
        setJsonAttr(ce, 'errors-json', {
          step3: 'Please confirm whether all guests are travelling together.',
        });
        return;
      }
      if (state.bookingFlow === 'surf_stay' && detail.variant === 'stay') {
        const surfLessonOptions = getSurfLessonOptionsFromAddons(optionsState);
        const nextGuests = ensureSurfStayLessonDefaults(
          normalizeGuestDetails(state.guestDetails, state.guestCount),
          optionsState
        );
        if (surfLessonOptions.length > 0) {
          const missingLesson = nextGuests
            .map((row, idx) => ({ idx, key: String(row.enquiryActivityKey || '').trim() }))
            .filter((row) => !row.key)
            .map((row) => row.idx + 1);
          if (missingLesson.length > 0) {
            setJsonAttr(ce, 'errors-json', {
              step3: `Please select a surf lesson for guest(s): ${missingLesson.join(', ')}.`,
            });
            return;
          }
        }
        state.guestDetails = nextGuests;
      }
      if (transferTypes.length > 0) {
        const singleTransferType = transferTypes.length === 1 ? transferTypes[0] : '';
        if (travelTogether === 'yes') {
          const currentShared = normalizeTransportShared(state.transportShared || {});
          state.transportShared = normalizeTransportShared({
            ...currentShared,
            transferType: currentShared.transferType || singleTransferType,
          });
        } else if (travelTogether === 'no' && singleTransferType) {
          const nextGuests = normalizeGuestDetails(state.guestDetails, state.guestCount).map((row) => ({
            ...row,
            arrivalTransferType: String(row.arrivalTransferType || '').trim() || singleTransferType,
          }));
          state.guestDetails = nextGuests;
        }
      }
      state.currentStep = state.bookingFlow === 'retreats' ? 3 : 4;
      setJsonAttr(ce, 'state-json', state);
      setJsonAttr(ce, 'errors-json', {});

      // Meta CAPI: stay/package funnel — user finished selecting services and
      // moves to data-entry. Fire InitiateCheckout here. We don't pass value
      // because pricingSnapshot is computed only at submit-booking time.
      try {
        const packageKeyForId =
          String(state.packageKey || context.packageKey || '').trim() ||
          String(state.bookingFlow || '').trim();
        await trackMetaInitiateCheckout({
          currency: 'EUR',
          contentType: 'product',
          contentCategory: String(state.bookingFlow || ''),
          contentName: packageKeyForId,
          contentIds: packageKeyForId ? [packageKeyForId] : [],
          numItems: Number(state.guestCount || 0) || undefined,
        });
      } catch (e) {
        log('trackMetaInitiateCheckout (stay/package) error', e);
      }
    }
  });

  ce.on('request-options', async (event) => {
    const detail = event.detail || {};
    log('event request-options', detail);
    if (detail.type !== 'stay-room-options' && detail.type !== 'stay-addon-options') return;
    setLoading(true);
    try {
      if (detail.type === 'stay-room-options') {
        log('refresh room options request', detail.payload || {});
        const roomResult =
          String(state.bookingFlow || '').startsWith('package_') || String(state.bookingFlow || '') === 'retreats'
            ? String(state.bookingFlow || '') === 'retreats'
              ? await loadRetreatRoomOptions({
                  retreatSessionId: state.retreatSessionId || state.packageSessionId,
                })
              : await loadPackageRoomOptions({
                  bookingFlow: state.bookingFlow,
                  packageSessionId: state.packageSessionId,
                })
            : await loadStayRoomOptions({
                ...(detail.payload || {}),
                bookingFlow: state.bookingFlow,
              });
        log('refresh room options response', roomResult);
        if (!roomResult.ok) {
          setJsonAttr(ce, 'errors-json', { step2: roomResult.message || 'Could not refresh room options.' });
        } else {
          optionsState.stayRooms = Array.isArray(roomResult.options) ? roomResult.options : [];
          const slots = getSelectedSlots(state.roomSelections, optionsState.stayRooms);
          const invalid = exceedsAvailability(state.roomSelections, optionsState.stayRooms);
          const hasSelection = (state.roomSelections || []).some(
            (row) => Number(row.quantity || 0) > 0
          );
          const suggestedSelections = suggestStayRoomSelections(
            Number(state.guestCount || 0),
            optionsState.stayRooms
          );
          const assigned = buildAssignedStayLines(state.guestCount, state.roomSelections, optionsState.stayRooms);
          const selectionMatchesDemand = assigned.ok;
          if (!hasSelection || invalid || !selectionMatchesDemand) {
            if (invalid) {
              state.roomSelections = [];
            }
            state.roomRecommendation = normalizeRoomRecommendation({
              status: suggestedSelections.length ? 'pending' : 'none',
              suggestedSelections,
            });
            if (isPackageFlow && (!hasSelection || invalid || !assigned.ok)) {
              const guests = Math.max(1, Number(state.guestCount || 1));
              const dormAvailable = Math.max(
                0,
                Number(optionsState.stayRooms.find((x) => String(x.roomTypeKey || '') === 'dorm')?.available || 0)
              );
              state.roomSelections = [{ roomTypeKey: 'dorm', quantity: Math.min(guests, dormAvailable) }];
            }
            log('room recommendation refreshed after room refresh', {
              guests: state.guestCount,
              suggested: suggestedSelections,
              hadSelection: hasSelection,
              invalid,
              slots,
            });
            setJsonAttr(ce, 'state-json', state);
          }
          syncOptions();
          setJsonAttr(ce, 'errors-json', {});
        }
      } else {
        log('refresh addon options request', detail.payload || {});
        const addonResult = await loadStayAddonOptions({
          bookingFlow: state.bookingFlow,
          checkIn: state.checkIn,
          checkOut: state.checkOut,
          guests: state.guestCount,
          packageKey: state.packageKey || context.packageKey,
        });
        log('refresh addon options response', addonResult);
        if (!addonResult.ok) {
          setJsonAttr(ce, 'errors-json', { step3: addonResult.message || 'Could not refresh add-ons.' });
        } else {
          optionsState.addons = {
            core: addonResult.core || {},
            experiences: Array.isArray(addonResult.experiences) ? addonResult.experiences : [],
            nights: Number(addonResult.nights || optionsState.addons.nights || 1),
          };
          state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
            ...state.coreAddons,
            dinnerStandardRate: Number(optionsState.addons.core?.dinner?.standardRate || 0),
            dinnerDoubleSingleOccRate: Number(optionsState.addons.core?.dinner?.doubleSingleOccRate || 0),
            dinnerDoubleDoubleOccRate: Number(optionsState.addons.core?.dinner?.doubleDoubleOccRate || 0),
            transferAirportRate: Number(optionsState.addons.core?.transfer?.airportRate || 0),
            transferBusRate: Number(optionsState.addons.core?.transfer?.busRate || 0),
            currency: optionsState.addons.core?.dinner?.currency || optionsState.addons.core?.transfer?.currency || 'EUR',
          }, state.guestCount, state.bookingFlow);
          if (state.bookingFlow === 'surf_stay') {
            state.guestDetails = ensureSurfStayLessonDefaults(
              normalizeGuestDetails(state.guestDetails, state.guestCount),
              optionsState
            );
          }
          setJsonAttr(ce, 'state-json', state);
          setJsonAttr(ce, 'errors-json', {});
        }
        syncOptions();
      }
    } catch (e) {
      if (detail.type === 'stay-room-options') {
        log('refresh room options error', e);
        setJsonAttr(ce, 'errors-json', { step2: 'Could not refresh room options.' });
      } else {
        log('refresh addon options error', e);
        setJsonAttr(ce, 'errors-json', { step3: 'Could not refresh add-ons.' });
      }
    } finally {
      setLoading(false);
    }
  });

  ce.on('draft-update', async (event) => {
    const detail = event.detail || {};
    log('event draft-update', detail);
    if (detail.type === 'step-jump') {
      const maxStep = state.bookingFlow === 'enquiry' ? 2 : 4;
      const requested = Math.min(maxStep, Math.max(1, Number(detail.payload?.step || 1)));
      const current = Math.max(1, Number(state.currentStep || 1));
      if (state.submissionStatus !== 'success' && requested < current) {
        state.currentStep = requested;
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
      }
      return;
    }
    if (detail.type === 'custom-retreat-chosen') {
      // User clicked the "Custom Retreat" card from the retreat browse selector.
      // Switch into the bespoke 5-step Custom Retreat request flow without changing the URL.
      // This flow is a pure enquiry: no inventory holds, no availability checks.
      state.customRetreatChosen = true;
      state.retreatBrowseMode = false;
      state.customRetreatRequestMode = true;
      state.bookingFlow = 'enquiry';
      state.enquiryType = 'custom_retreat';
      state.retreatKey = '';
      state.retreatSessionId = '';
      state.currentStep = 1;
      state.guestCount = Math.max(1, Number(state.guestCount || 1));
      state.guestDetails = normalizeGuestDetails(state.guestDetails, state.guestCount);
      context.flow = 'enquiry';
      context.enquiryType = 'custom_retreat';
      context.retreatKey = null;
      context.customRetreatRequestMode = true;
      context.retreatBrowseMode = false;
      ensureCustomRetreatRoomMeta().catch((e) => {
        log('ensureCustomRetreatRoomMeta on custom-retreat-chosen error', e);
      });
      setJsonAttr(ce, 'context-json', context);
      setJsonAttr(ce, 'state-json', state);
      setJsonAttr(ce, 'errors-json', {});
      log('custom retreat chosen — switched to bespoke flow');
      return;
    }
    if (detail.type === 'retreat-select') {
      const nextRetreatKey = normalizeRetreatKey(detail.payload?.retreatKey || '');
      if (!nextRetreatKey) return;
      state.bookingFlow = 'retreats';
      context.flow = 'retreats';
      state.retreatMode = true;
      state.retreatKey = nextRetreatKey;
      state.enquiryType = 'custom_retreat';
      state.currentStep = 1;
      // User picked a preset retreat (Dihya/Anzar) — exit any custom retreat state we might be in.
      state.customRetreatChosen = false;
      state.customRetreatRequestMode = false;
      state.retreatBrowseMode = false;
      context.retreatMode = true;
      context.retreatKey = nextRetreatKey;
      context.enquiryType = 'custom_retreat';
      context.customRetreatRequestMode = false;
      context.retreatBrowseMode = false;
      state.experienceRequests = [];
      state.experienceLessonFormats = {};
      state.activityDatePrefs = {};
      state.guestDetails = normalizeGuestDetails(state.guestDetails, Math.max(1, Number(state.guestCount || 1))).map((row) => ({
        ...row,
        enquiryActivityKey: '',
        lessonFormat: '',
        surfLessonRequest: '',
      }));
      setLoading(true);
      try {
        const retreatRes = await loadRetreatEnquiryOptions({
          retreatKey: nextRetreatKey,
          retreatSessionId: '',
        });
        log('loadRetreatEnquiryOptions on retreat-select response', retreatRes);
        if (retreatRes?.ok) {
          optionsState.retreatCatalog = Array.isArray(retreatRes.retreats) ? retreatRes.retreats : optionsState.retreatCatalog;
          optionsState.retreatSessions = Array.isArray(retreatRes.sessions) ? retreatRes.sessions : [];
        } else {
          setJsonAttr(ce, 'errors-json', { step1: retreatRes?.message || 'Could not load retreat sessions.' });
        }
      } catch (e) {
        log('loadRetreatEnquiryOptions on retreat-select error', e);
        setJsonAttr(ce, 'errors-json', { step1: 'Could not load retreat sessions.' });
      } finally {
        setLoading(false);
      }
      const retreatSessionsForKey = (optionsState.retreatSessions || []).filter(
        (row) => String(row.retreatKey || '') === nextRetreatKey
      );
      const firstOpenSession = retreatSessionsForKey.find((row) => row.isSoldOut !== true);
      optionsState.packageSessions = retreatSessionsForKey.map((row) => ({
        sessionId: row.sessionId,
        packageKey: row.retreatKey,
        sessionStartDateKey: row.sessionStartDateKey,
        sessionEndDateKey: row.sessionEndDateKey,
        nights: row.nights,
        minParticipants: row.minParticipants,
        maxParticipants: row.maxParticipants,
        participantsBooked: row.participantsBooked,
        participantsLeft: row.participantsLeft,
        isSoldOut: row.isSoldOut === true,
      }));
      state.retreatSessionId = String(firstOpenSession?.sessionId || '');
      state.packageSessionId = String(firstOpenSession?.sessionId || '');
      context.retreatSessionId = String(firstOpenSession?.sessionId || '');
      if (firstOpenSession) {
        state.checkIn = firstOpenSession.sessionStartDateKey || '';
        state.checkOut = firstOpenSession.sessionEndDateKey || '';
      } else {
        state.checkIn = '';
        state.checkOut = '';
      }
      syncOptions();
      setJsonAttr(ce, 'context-json', context);
      setJsonAttr(ce, 'state-json', state);
      setJsonAttr(ce, 'errors-json', {});
      return;
    }
    if (detail.type === 'retreat-session-select') {
      const nextSessionId = String(detail.payload?.retreatSessionId || '').trim();
      state.retreatSessionId = nextSessionId;
      context.retreatSessionId = nextSessionId;
      const selected = (optionsState.retreatSessions || []).find((row) => String(row.sessionId || '') === nextSessionId);
      if (selected) {
        state.checkIn = selected.sessionStartDateKey || '';
        state.checkOut = selected.sessionEndDateKey || '';
      }
      syncOptions();
      setJsonAttr(ce, 'context-json', context);
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'enquiry-guest-count') {
      const guests = Math.max(1, Number(detail.payload?.guests || 1));
      state.guestCount = guests;
      const enquiryType = normalizeEnquiryType(state.enquiryType || context.enquiryType || '');
      if (enquiryType === 'surf_activity') {
        const list = normalizeGuestDetails(state.guestDetails, guests);
        const fallbackActivityKey =
          String(list[0]?.enquiryActivityKey || '') ||
          String(context.activityKey || '') ||
          String(state.experienceRequests?.[0]?.activityKey || '') ||
          String(optionsState.addons.experiences?.[0]?.activityKey || '');
        if (fallbackActivityKey) {
          for (let i = 0; i < list.length; i += 1) {
            const nextKey = String(list[i].enquiryActivityKey || fallbackActivityKey).trim();
            list[i] = {
              ...list[i],
              enquiryActivityKey: nextKey,
              lessonFormat: activitySupportsLessonFormat(nextKey) ? list[i].lessonFormat || '' : '',
            };
          }
        }
        state.guestDetails = list;
      } else {
        state.guestDetails = normalizeGuestDetails(state.guestDetails, guests);
      }
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'stay-flow-offer-dismiss') {
      state.surfStayOfferDismissed = true;
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'stay-single-preference' || detail.type === 'bnb-single-preference') {
      const nextValue = detail.payload?.value === true;
      state.stayPreferSingleRooms = nextValue;
      state.bnbPreferSingleRooms = nextValue;
      if (nextValue && Number(state.guestCount || 0) > 1 && Array.isArray(optionsState.stayRooms) && optionsState.stayRooms.length) {
        const preferredSelections = suggestStayRoomSelectionsPreferSingles(state.guestCount, optionsState.stayRooms);
        const preferredAssigned = buildAssignedStayLines(state.guestCount, preferredSelections, optionsState.stayRooms);
        if (
          preferredSelections.length > 0 &&
          !exceedsAvailability(preferredSelections, optionsState.stayRooms) &&
          preferredAssigned.ok
        ) {
          state.roomSelections = preferredSelections;
        }
      }
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'stay-flow-switch') {
      const payload = detail.payload || {};
      const nextFlow = normalizeFlow(payload.flow || '');
      if (nextFlow === 'bnb' || nextFlow === 'surf_stay') {
        const guestCount = Math.max(1, Number(state.guestCount || 1));
        state.bookingFlow = nextFlow;
        context.flow = nextFlow;
        state.currentStep = 1;
        state.surfStayOfferDismissed = true;
        state.roomSelections = [];
        state.roomRecommendation = normalizeRoomRecommendation({
          status: 'none',
          suggestedSelections: [],
        });
        state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
          ...state.coreAddons,
          dinner: false,
          transferType: 'none',
          transferTypes: [],
          transferVehicles: 1,
          transferTravelTogether: 'yes',
          dinnerStandardRate: Number(optionsState.addons.core?.dinner?.standardRate || state.coreAddons?.dinnerStandardRate || 0),
          dinnerDoubleSingleOccRate: Number(
            optionsState.addons.core?.dinner?.doubleSingleOccRate || state.coreAddons?.dinnerDoubleSingleOccRate || 0
          ),
          dinnerDoubleDoubleOccRate: Number(
            optionsState.addons.core?.dinner?.doubleDoubleOccRate || state.coreAddons?.dinnerDoubleDoubleOccRate || 0
          ),
          transferAirportRate: Number(optionsState.addons.core?.transfer?.airportRate || state.coreAddons?.transferAirportRate || 0),
          transferBusRate: Number(optionsState.addons.core?.transfer?.busRate || state.coreAddons?.transferBusRate || 0),
          currency: optionsState.addons.core?.dinner?.currency || optionsState.addons.core?.transfer?.currency || state.coreAddons?.currency || 'EUR',
        }, state.guestCount, state.bookingFlow);
        state.experienceRequests = [];
        state.experienceLessonFormats = {};
        state.activityDatePrefs = {};
        state.transportShared = normalizeTransportShared({});
        state.guestDetails = normalizeGuestDetails(state.guestDetails, guestCount);
        setJsonAttr(ce, 'context-json', context);
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
      }
      return;
    }
    if (detail.type === 'stay-room-quantity') {
      const payload = detail.payload || {};
      const roomTypeKey = payload.roomTypeKey;
      const quantity = Number(payload.quantity || 0);
      const list = Array.isArray(state.roomSelections) ? state.roomSelections : [];
      const existing = list.find((r) => r.roomTypeKey === roomTypeKey);
      if (existing) existing.quantity = quantity;
      else list.push({ roomTypeKey, quantity });
      state.roomSelections = normalizeRoomSelectionsForGuestCount(list, state.guestCount, roomTypeKey);
      if (state.roomRecommendation?.status === 'pending') {
        state.roomRecommendation = normalizeRoomRecommendation({
          ...state.roomRecommendation,
          status: 'dismissed',
        });
      }
    }
    if (detail.type === 'stay-room-selections') {
      const payload = detail.payload || {};
      const rows = Array.isArray(payload.roomSelections) ? payload.roomSelections : [];
      state.roomSelections = normalizeRoomSelectionsForGuestCount(rows, state.guestCount);
      if (state.roomRecommendation?.status === 'pending') {
        state.roomRecommendation = normalizeRoomRecommendation({
          ...state.roomRecommendation,
          status: 'dismissed',
        });
      }
    }
    if (detail.type === 'package-session-select') {
      const payload = detail.payload || {};
      state.packageSessionId = String(payload.packageSessionId || '');
      if (state.bookingFlow === 'retreats') {
        state.retreatSessionId = String(payload.packageSessionId || '');
        context.retreatSessionId = String(payload.packageSessionId || '');
      }
      const selected = (optionsState.packageSessions || []).find(
        (row) => String(row.sessionId || '') === String(state.packageSessionId || '')
      );
      if (selected) {
        state.packageMinParticipants = Number(selected.minParticipants || 0) || 0;
        state.packageMaxParticipants = Number(selected.maxParticipants || 0) || 0;
        state.packageParticipantsLeft = Math.max(
          0,
          Number(selected.participantsLeft != null ? selected.participantsLeft : state.packageMaxParticipants || 0) || 0
        );
        if (Number(state.packageParticipantsLeft || 0) > 0) {
          state.guestCount = Math.min(
            Math.max(1, Number(state.guestCount || 1)),
            Number(state.packageParticipantsLeft)
          );
        } else {
          state.guestCount = 1;
        }
      }
    }
    if (detail.type === 'room-recommendation-action') {
      const action = detail.payload?.action || '';
      const suggested = Array.isArray(state.roomRecommendation?.suggestedSelections)
        ? state.roomRecommendation.suggestedSelections
        : [];
      if (action === 'apply') {
        state.roomSelections = suggested.map((row) => ({
          roomTypeKey: row.roomTypeKey,
          quantity: Number(row.quantity || 0),
        }));
        state.roomRecommendation = normalizeRoomRecommendation({
          ...state.roomRecommendation,
          status: 'accepted',
        });
      }
      if (action === 'dismiss') {
        state.roomRecommendation = normalizeRoomRecommendation({
          ...state.roomRecommendation,
          status: 'dismissed',
        });
      }
    }
    if (detail.type === 'core-addon-toggle') {
      const payload = detail.payload || {};
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
        ...state.coreAddons,
        [payload.key]: !!payload.value,
      }, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'core-transfer-select') {
      const payload = detail.payload || {};
      const transferType = payload.transferType || 'none';
      const transferTypes = transferType === 'none' ? [] : [transferType];
      const suggestedVehicles = Math.max(1, Math.ceil(Number(state.guestCount || 1) / 6));
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
        ...state.coreAddons,
        transferType,
        transferTypes,
        transferVehicles: transferTypes.length === 0 ? 1 : Number(state.coreAddons.transferVehicles || suggestedVehicles),
        transferTravelTogether:
          transferTypes.length === 0
            ? 'yes'
            : state.coreAddons.transferTravelTogether === 'no'
              ? 'no'
              : 'yes',
      }, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'core-transfer-types') {
      const payload = detail.payload || {};
      const requestedTypes = Array.isArray(payload.transferTypes) ? payload.transferTypes : [];
      const transferTypes = [...new Set(requestedTypes)].filter((item) => item === 'airport' || item === 'bus');
      const suggestedVehicles = Math.max(1, Math.ceil(Number(state.guestCount || 1) / 6));
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
        ...state.coreAddons,
        transferType: transferTypes[0] || 'none',
        transferTypes,
        transferVehicles: transferTypes.length === 0 ? 1 : Number(state.coreAddons.transferVehicles || suggestedVehicles),
      }, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'core-transfer-group') {
      const payload = detail.payload || {};
      const nextTravelTogether = payload.transferTravelTogether === 'no' ? 'no' : 'yes';
      const selectedTypes = getSelectedTransferTypes(state.coreAddons || {});
      const primaryType = selectedTypes[0] || (state.coreAddons?.transferType || 'none');
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
        ...state.coreAddons,
        transferTravelTogether: nextTravelTogether,
        transferType: nextTravelTogether === 'yes' ? primaryType : state.coreAddons?.transferType || primaryType,
        transferTypes: nextTravelTogether === 'yes' ? (primaryType === 'none' ? [] : [primaryType]) : selectedTypes,
      }, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'core-transfer-vehicles') {
      const payload = detail.payload || {};
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer({
        ...state.coreAddons,
        transferVehicles: clampTransferVehicles(payload.transferVehicles || 1, state.guestCount),
      }, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'core-transfer-vehicles-by-type') {
      const payload = detail.payload || {};
      const type = String(payload.transferType || '').toLowerCase();
      const vehicles = clampTransferVehicles(payload.vehicles || 1, state.guestCount);
      const next = { ...state.coreAddons };
      if (type === 'airport') next.transferAirportVehicles = vehicles;
      if (type === 'bus') next.transferBusVehicles = vehicles;
      state.coreAddons = normalizeCoreAddonsWithPackageTransfer(next, state.guestCount, state.bookingFlow);
    }
    if (detail.type === 'experience-toggle') {
      const payload = detail.payload || {};
      const key = payload.activityKey;
      const selected = !!payload.selected;
      const list = Array.isArray(state.experienceRequests) ? state.experienceRequests : [];
      const idx = list.findIndex((x) => x.activityKey === key);
      if (selected && idx < 0) {
        list.push({
          activityKey: key,
          title: payload.title || key,
        });
      } else if (!selected && idx >= 0) {
        list.splice(idx, 1);
        if (state.experienceLessonFormats && typeof state.experienceLessonFormats === 'object') {
          const nextFormats = { ...state.experienceLessonFormats };
          delete nextFormats[key];
          state.experienceLessonFormats = nextFormats;
        }
        if (state.activityDatePrefs && typeof state.activityDatePrefs === 'object') {
          const next = { ...state.activityDatePrefs };
          delete next[key];
          state.activityDatePrefs = next;
        }
      }
      state.experienceRequests = list;
    }
    if (detail.type === 'experience-lesson-format') {
      const payload = detail.payload || {};
      const activityKey = String(payload.activityKey || '').trim();
      if (activityKey && activitySupportsLessonFormat(activityKey)) {
        const nextFormats = {
          ...(state.experienceLessonFormats && typeof state.experienceLessonFormats === 'object'
            ? state.experienceLessonFormats
            : {}),
        };
        const normalized = normalizeLessonFormatForActivity(activityKey, payload.lessonFormat || '', state.bookingFlow);
        if (normalized) nextFormats[activityKey] = normalized;
        else delete nextFormats[activityKey];
        state.experienceLessonFormats = nextFormats;
      }
    }
    if (detail.type === 'activity-date-field') {
      const payload = detail.payload || {};
      const key = String(payload.activityKey || '').trim();
      if (key) {
        const next = {
          ...(state.activityDatePrefs && typeof state.activityDatePrefs === 'object' ? state.activityDatePrefs : {}),
        };
        next[key] = String(payload.value || '').trim();
        state.activityDatePrefs = next;
      }
    }
    if (detail.type === 'retreat-intake-field') {
      const payload = detail.payload || {};
      const key = String(payload.key || '').trim();
      if (key) {
        const current = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
        state.retreatIntakeJson = {
          ...current,
          [key]: payload.value,
        };
      }
    }
    // ---- Custom Retreat (bespoke 5-step request flow) draft updates ----
    if (detail.type === 'custom-retreat-guest-count') {
      const payload = detail.payload || {};
      const guests = Math.max(1, Math.min(20, Number(payload.guests || 1)));
      state.guestCount = guests;
      state.guestDetails = normalizeGuestDetails(state.guestDetails, guests);
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-dates') {
      const payload = detail.payload || {};
      state.checkIn = String(payload.checkIn || '').trim();
      state.checkOut = String(payload.checkOut || '').trim();
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-whole-house') {
      const payload = detail.payload || {};
      state.wholeHouseEnquiry = payload.value === true;
      if (state.wholeHouseEnquiry) state.roomSelections = [];
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-room-qty') {
      const payload = detail.payload || {};
      const roomTypeKey = String(payload.roomTypeKey || '').trim();
      const quantity = Math.max(0, Number(payload.quantity || 0));
      if (!roomTypeKey) return;
      const current = Array.isArray(state.roomSelections) ? state.roomSelections : [];
      const next = current.filter((row) => row.roomTypeKey !== roomTypeKey);
      if (quantity > 0) next.push({ roomTypeKey, quantity });
      state.roomSelections = next;
      // Manual room change clears the whole-house flag.
      if (quantity > 0) state.wholeHouseEnquiry = false;
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-types') {
      const payload = detail.payload || {};
      const types = Array.isArray(payload.retreatTypes) ? payload.retreatTypes.filter(Boolean) : [];
      const otherText = String(payload.retreatTypeOther || '').trim();
      const current = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
      state.retreatIntakeJson = {
        ...current,
        retreatTypes: types,
        retreatTypeOther: types.includes('other') ? otherText : '',
      };
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-country') {
      state.guestCountry = String(detail.payload?.country || '').trim();
      setJsonAttr(ce, 'state-json', state);
      return;
    }
    if (detail.type === 'custom-retreat-step-back') {
      const target = Math.max(1, Math.min(5, Number(detail.payload?.step || 1)));
      state.currentStep = target;
      setJsonAttr(ce, 'state-json', state);
      setJsonAttr(ce, 'errors-json', {});
      return;
    }
    if (detail.type === 'contact-field') {
      const payload = detail.payload || {};
      if (payload.key === 'termsAccepted') {
        state.termsAccepted = payload.value === true;
      } else {
        state[payload.key] = payload.value || '';
      }
    }
    if (detail.type === 'guest-detail-field') {
      const payload = detail.payload || {};
      const guestCount = Number(state.guestCount || 1);
      const index = Math.max(0, Math.min(guestCount - 1, Number(payload.index || 0)));
      const key = payload.key || '';
      if (key) {
        const list = normalizeGuestDetails(state.guestDetails, guestCount);
        const nextRow = {
          ...list[index],
          [key]: key === 'arrivalTime' ? normalizeDateTimeLocalValue(payload.value || '') : payload.value || '',
        };
        if (key === 'enquiryActivityKey') {
          if (!activitySupportsLessonFormat(nextRow.enquiryActivityKey)) {
            nextRow.lessonFormat = '';
          }
        }
        if (key === 'enquiryActivityKey' || key === 'lessonFormat') {
          nextRow.lessonFormat = normalizeLessonFormatForActivity(
            nextRow.enquiryActivityKey,
            nextRow.lessonFormat,
            state.bookingFlow
          );
          nextRow.surfLessonRequest = mapActivityKeyToSurfLessonRequest(nextRow.enquiryActivityKey, nextRow.lessonFormat);
        }
        if (key === 'surfLevel') {
          nextRow.surfedBefore = deriveSurfedBeforeFromLevel(nextRow.surfLevel);
        }
        if (key === 'surfNotes') {
          nextRow.surfGoals = String(nextRow.surfNotes || '').trim();
        }
        list[index] = nextRow;
        state.guestDetails = list;
      }
    }
    if (detail.type === 'transfer-shared-field') {
      const payload = detail.payload || {};
      const key = payload.key || '';
      if (key) {
        state.transportShared = normalizeTransportShared({
          ...state.transportShared,
          [key]: key === 'arrivalTime' ? normalizeDateTimeLocalValue(payload.value || '') : payload.value || '',
        });
      }
    }
    state.coreAddons = normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
    setJsonAttr(ce, 'state-json', state);
  });

  ce.on('submit-booking', async (event) => {
    const detail = event.detail || {};
    log('event submit-booking', detail);
    if (detail.variant !== 'stay' && detail.variant !== 'package' && detail.variant !== 'enquiry') return;
    if (submitInFlight || state.submissionStatus === 'success') {
      log('submit-booking ignored', {
        submitInFlight,
        submissionStatus: state.submissionStatus,
      });
      return;
    }
    const isCustomRetreatRequest =
      detail.variant === 'enquiry' && (detail.flow === 'custom_retreat' || state.customRetreatChosen === true);

    // Bespoke Custom Retreat 5-step request flow.
    // Pure enquiry: no inventory holds, no payment links — just persist + email notify.
    if (isCustomRetreatRequest) {
      const guests = Math.max(1, Number(state.guestCount || 1));
      const guestDetails = normalizeGuestDetails(state.guestDetails, guests);
      const primary = guestDetails[0] || {};
      const contactName = String(primary.fullName || '').trim();
      const contactEmail = String(primary.email || '').trim();
      const contactPhone = String(primary.phone || '').trim();
      if (!contactName) {
        setJsonAttr(ce, 'errors-json', { step5: 'Please provide your full name.' });
        return;
      }
      if (!contactEmail) {
        setJsonAttr(ce, 'errors-json', { step5: 'Please provide your email.' });
        return;
      }
      if (!contactPhone) {
        setJsonAttr(ce, 'errors-json', { step5: 'Please provide a phone or WhatsApp number.' });
        return;
      }
      const country = String(state.guestCountry || '').trim();
      if (!country) {
        setJsonAttr(ce, 'errors-json', { step5: 'Please select your country.' });
        return;
      }
      const intake = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
      const retreatTypes = Array.isArray(intake.retreatTypes) ? intake.retreatTypes.filter(Boolean) : [];
      const vision = String(intake.vision || '').trim();
      const activitiesWanted = String(intake.activitiesWanted || '').trim();
      if (!retreatTypes.length || !vision || !activitiesWanted) {
        setJsonAttr(ce, 'errors-json', { step5: 'Some retreat details are missing — please complete previous steps.' });
        return;
      }
      const leadEventIdLocal = generateMetaEventId();
      const metaMatchingLocal = getMetaMatchingData();
      const requestPayload = {
        guestCount: guests,
        checkIn: String(state.checkIn || '').trim(),
        checkOut: String(state.checkOut || '').trim(),
        wholeHouseEnquiry: state.wholeHouseEnquiry === true,
        roomSelections: state.wholeHouseEnquiry === true ? [] : (state.roomSelections || []),
        retreatTypes,
        retreatTypeOther: String(intake.retreatTypeOther || ''),
        vision,
        activitiesWanted,
        specialRequirements: String(intake.specialRequirements || ''),
        guestName: contactName,
        guestEmail: contactEmail,
        guestPhone: contactPhone,
        guestCountry: country,
        guestDetails: guestDetails.map((g) => ({
          fullName: String(g.fullName || '').trim(),
          email: String(g.email || '').trim(),
          phone: String(g.phone || '').trim(),
        })),
        capiTracking: {
          fbp: metaMatchingLocal.fbp,
          fbc: metaMatchingLocal.fbc,
          externalId: metaMatchingLocal.externalId,
          clientUserAgent: metaMatchingLocal.clientUserAgent,
          eventSourceUrl: metaMatchingLocal.eventSourceUrl,
          leadEventId: leadEventIdLocal,
        },
      };
      submitInFlight = true;
      setLoading(true, { watchdogMs: 60000 });
      let shouldDelayLoadingRelease = false;
      try {
        const res = await runSubmitWithRetries(
          'submitCustomRetreatRequest',
          () => submitCustomRetreatRequestBridge(requestPayload)
        );
        log('submitCustomRetreatRequest response', res);
        if (res?.ok) {
          state.submissionStatus = 'success';
          state.currentStep = 5;
          setJsonAttr(ce, 'state-json', state);
          setJsonAttr(ce, 'errors-json', {});
          shouldDelayLoadingRelease = true;
          try {
            await trackMetaLead({
              currency: 'EUR',
              contentName: 'custom_retreat_request',
              contentCategory: 'enquiry',
              eventId: leadEventIdLocal,
            });
          } catch (e) {
            log('trackMetaLead (custom retreat) error', e);
          }
        } else {
          setJsonAttr(ce, 'errors-json', {
            step5: res?.message || 'Could not submit your retreat request. Please try again.',
          });
        }
      } catch (err) {
        log('submitCustomRetreatRequest error', err);
        setJsonAttr(ce, 'errors-json', {
          step5: 'Network error. Please try again in a moment.',
        });
      } finally {
        if (shouldDelayLoadingRelease) {
          await waitForRenderFrames(2);
        }
        submitInFlight = false;
        setLoading(false);
      }
      return;
    }

    const isEnquiryVariant = detail.variant === 'enquiry';
    const isPackageVariant = detail.variant === 'package';
    let shouldDelayLoadingRelease = false;

    // Meta CAPI: pre-generate the Lead event_id and capture browser-side
    // matching tokens ONCE per submission. The backend will persist these on
    // the booking/enquiry row and fire CAPI Lead with `leadEventId`; the
    // browser will mirror with `fbq('track','Lead',..,{eventID: leadEventId})`
    // using the same id, so Meta deduplicates Pixel + CAPI Lead deliveries.
    const leadEventId = generateMetaEventId();
    const metaMatching = getMetaMatchingData();
    const capiTracking = {
      fbp: metaMatching.fbp,
      fbc: metaMatching.fbc,
      externalId: metaMatching.externalId,
      clientUserAgent: metaMatching.clientUserAgent,
      eventSourceUrl: metaMatching.eventSourceUrl,
      leadEventId,
    };

    submitInFlight = true;
    setLoading(true, { watchdogMs: 60000 });
    try {
      if (isEnquiryVariant) {
        if (!state.termsAccepted) {
          setJsonAttr(ce, 'errors-json', { step2: 'Please accept the booking terms and policy before submitting.' });
          return;
        }
        const guests = Math.max(0, Number(state.guestCount || 0));
        if (!guests) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please provide guest count.' });
          return;
        }
        const enquiryType = normalizeEnquiryType(state.enquiryType || '');
        const surfActivityMode = enquiryType === 'surf_activity';
        const activityEnquiryMode = enquiryType === 'activity_enquiry';
        if (enquiryType === 'custom_package' && guests < 3) {
          setJsonAttr(ce, 'errors-json', { step1: 'Custom Package enquiry requires at least 3 guests.' });
          return;
        }
        const notes = String(state.activityRequestNotes || '').trim();
        if (enquiryType === 'custom_package' && !notes) {
          setJsonAttr(ce, 'errors-json', { step1: 'Please describe your custom request.' });
          return;
        }
        let guestDetails = normalizeGuestDetails(state.guestDetails, guests);
        const participantOne = guestDetails[0] || {};
        const guestNameFinal = String(state.guestName || participantOne.fullName || '').trim();
        const guestEmailFinal = String(state.guestEmail || participantOne.email || '').trim();
        const guestPhoneFinal = String(state.guestPhone || participantOne.phone || '').trim();
        guestDetails[0] = {
          ...participantOne,
          fullName: guestNameFinal,
          email: guestEmailFinal,
          phone: guestPhoneFinal,
        };
        if (!guestNameFinal || !guestEmailFinal) {
          setJsonAttr(ce, 'errors-json', {
            step2: surfActivityMode
              ? 'Please complete full name and email for participant 1 (contact person).'
              : 'Please provide name and email before submitting.',
          });
          return;
        }
        if (!guestPhoneFinal) {
          setJsonAttr(ce, 'errors-json', {
            step2: surfActivityMode
              ? 'Please add a phone or WhatsApp number for participant 1 (contact person).'
              : 'Please provide a phone or WhatsApp number before submitting.',
          });
          return;
        }
        if (surfActivityMode) {
          const fallbackActivityKey =
            String(guestDetails[0].enquiryActivityKey || '') ||
            String(context.activityKey || '') ||
            String(state.experienceRequests?.[0]?.activityKey || '') ||
            String(optionsState.addons.experiences?.[0]?.activityKey || '');
          if (!fallbackActivityKey) {
            setJsonAttr(ce, 'errors-json', { step2: 'No surf activity is available for this enquiry.' });
            return;
          }
          for (let i = 0; i < guestDetails.length; i += 1) {
            guestDetails[i] = {
              ...guestDetails[i],
              enquiryActivityKey: guestDetails[i].enquiryActivityKey || fallbackActivityKey,
            };
          }
          const missingGuestNames = guestDetails
            .map((row, idx) => ({ idx, fullName: String(row.fullName || '').trim() }))
            .filter((row) => !row.fullName)
            .map((row) => row.idx + 1);
          if (missingGuestNames.length > 0) {
            setJsonAttr(ce, 'errors-json', {
              step2: `Please provide full name for participant(s): ${missingGuestNames.join(', ')}.`,
            });
            return;
          }
          const missingSurfQualification = guestDetails
            .map((row, idx) => ({
              idx,
              missing: !String(row.surfLevel || '').trim() || !String(row.waterConfidence || '').trim(),
            }))
            .filter((row) => row.missing)
            .map((row) => row.idx + 1);
          if (missingSurfQualification.length > 0) {
            setJsonAttr(ce, 'errors-json', {
              step2: `Please complete surf qualification for participant(s): ${missingSurfQualification.join(', ')}.`,
            });
            return;
          }
          guestDetails = guestDetails.map((row) => ({
            ...row,
            surfedBefore: deriveSurfedBeforeFromLevel(row.surfLevel || ''),
            surfGoals: String(row.surfNotes || row.surfGoals || '').trim(),
          }));
        }
        const fallbackActivityKey =
          String(context.activityKey || '') ||
          String(state.experienceRequests?.[0]?.activityKey || '') ||
          String(optionsState.addons.experiences?.[0]?.activityKey || '');
        const activityRequestKeys = surfActivityMode
          ? guestDetails.map((row) => row.enquiryActivityKey).filter(Boolean)
          : activityEnquiryMode
            ? [...new Set([...(state.experienceRequests || []).map((x) => x.activityKey), fallbackActivityKey].filter(Boolean))]
            : (state.experienceRequests || []).map((x) => x.activityKey).filter(Boolean);
        if ((surfActivityMode || activityEnquiryMode) && activityRequestKeys.length === 0) {
          setJsonAttr(ce, 'errors-json', {
            step2: surfActivityMode ? 'Please select at least one surf activity.' : 'Please select at least one activity.',
          });
          return;
        }
        const experienceRequests = buildExperienceRequestsByKeys(
          activityRequestKeys,
          optionsState.addons.experiences || [],
          activityEnquiryMode ? state.experienceLessonFormats || {} : {}
        );
        const preferredDates = surfActivityMode
          ? guestDetails
              .map((row, idx) => ({ idx: idx + 1, date: String(row.preferredDate || '').trim() }))
              .filter((row) => !!row.date)
          : [];
        const activityDatePrefsRaw = state.activityDatePrefs && typeof state.activityDatePrefs === 'object' ? state.activityDatePrefs : {};
        const activityDatePrefs = activityEnquiryMode
          ? Object.fromEntries(
              activityRequestKeys.map((key) => [key, String(activityDatePrefsRaw[key] || '').trim()])
            )
          : {};
        if (activityEnquiryMode) {
          const missingDateActivities = activityRequestKeys.filter((key) => !String(activityDatePrefs[key] || '').trim());
          if (missingDateActivities.length > 0) {
            const byKey = new Map((optionsState.addons.experiences || []).map((row) => [String(row.activityKey || ''), row]));
            const names = missingDateActivities.map((key) => byKey.get(String(key))?.title || key);
            setJsonAttr(ce, 'errors-json', {
              step2: `Please choose preferred date for: ${names.join(', ')}.`,
            });
            return;
          }
        }
        const requestedDates =
          preferredDates.length > 0
            ? preferredDates.map((row) => `Guest ${row.idx}: ${row.date}`).join(' | ')
            : activityEnquiryMode
              ? activityRequestKeys
                  .map((key) => {
                    const label = (optionsState.addons.experiences || []).find((row) => String(row.activityKey || '') === String(key))?.title || key;
                    return `${label}: ${activityDatePrefs[key] || '-'}`;
                  })
                  .join(' | ')
            : state.checkIn && state.checkOut
              ? `${state.checkIn} -> ${state.checkOut}`
              : state.checkIn || state.checkOut || '';
        const transferTypes = getSelectedTransferTypes(state.coreAddons || {});
        const sharedTransport = normalizeTransportShared(state.transportShared || {});
        const enquiryPayload = {
          sourcePage: 'booking-page',
          enquiryType,
          retreatKey: normalizeRetreatKey(state.retreatKey || context.retreatKey || ''),
          retreatSessionId: String(state.retreatSessionId || context.retreatSessionId || ''),
          guestName: guestNameFinal,
          guestEmail: guestEmailFinal,
          guestPhone: guestPhoneFinal,
          guests,
          checkIn: state.checkIn || '',
          checkOut: state.checkOut || '',
          requestedDates,
          notes,
          termsAccepted: !!state.termsAccepted,
          coreAddons: surfActivityMode ? {} : state.coreAddons || {},
          activityRequestKeys,
          experienceRequests,
          transportPlan: surfActivityMode
            ? {}
            : {
                transferTypes,
                transferVehicles: Number(state.coreAddons?.transferVehicles || 1),
                transferAirportVehicles: Number(state.coreAddons?.transferAirportVehicles || 0),
                transferBusVehicles: Number(state.coreAddons?.transferBusVehicles || 0),
                sharedArrival: sharedTransport,
              },
          activityDatePrefs,
          dietaryNotes: state.dietaryNotes || '',
          guestDetails,
          capiTracking,
          capiLeadData: {
            currency: 'EUR',
            // No firm value at enquiry stage — Meta will still attribute Lead.
            contentType: 'product',
            contentCategory: state.bookingFlow || 'enquiry',
            contentName: String(state.enquiryType || ''),
            contentIds: [
              normalizeRetreatKey(state.retreatKey || context.retreatKey || '') ||
                state.enquiryType ||
                'enquiry',
            ].filter(Boolean),
            numItems: Number(guests || 0) || undefined,
          },
        };
        log('submitEnquiryBooking request', enquiryPayload);
        const enquiryResult = await runSubmitWithRetries('submitEnquiryBooking', () => submitEnquiryBookingBridge(enquiryPayload));
        log('submitEnquiryBooking response', enquiryResult);
        if (!enquiryResult.ok) {
          setJsonAttr(ce, 'errors-json', {
            step2: enquiryResult.message || 'Could not submit enquiry.',
          });
          return;
        }
        const enquiryId = String(enquiryResult.enquiryId || '').trim();
        if (!enquiryId) {
          log('submitEnquiryBooking missing enquiryId in successful response', enquiryResult);
          setJsonAttr(ce, 'errors-json', {
            step2: 'Submission was accepted but no reference was returned. Please retry.',
          });
          return;
        }
        state.guestDetails = guestDetails;
        state.experienceRequests = experienceRequests;
        if (activityEnquiryMode) {
          const nextFormats = { ...(state.experienceLessonFormats || {}) };
          const validKeys = new Set(activityRequestKeys);
          Object.keys(nextFormats).forEach((key) => {
            if (!validKeys.has(key)) delete nextFormats[key];
          });
          state.experienceLessonFormats = nextFormats;
        }
        state.guestName = guestNameFinal;
        state.guestEmail = guestEmailFinal;
        state.guestPhone = guestPhoneFinal;
        state.submissionStatus = 'success';
        state.currentStep = getSubmitContactStep(state, { isEnquiryVariant: true });
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        shouldDelayLoadingRelease = true;

        // Meta CAPI: backend already fired the Lead event via CAPI using
        // `leadEventId`. Now mirror it on the Pixel side with the same id
        // so the two deliveries are deduplicated by Meta.
        try {
          await trackMetaLead({
            eventId: leadEventId,
            pixelOnly: true,
            orderId: enquiryId,
            currency: 'EUR',
            email: guestEmailFinal,
            phone: guestPhoneFinal,
            fullName: guestNameFinal,
            contentCategory: state.bookingFlow || 'enquiry',
            contentName: String(state.enquiryType || ''),
            contentIds: [
              normalizeRetreatKey(state.retreatKey || context.retreatKey || '') ||
                state.enquiryType ||
                'enquiry',
            ].filter(Boolean),
            numItems: Number(guests || 0) || undefined,
          });
        } catch (e) {
          log('trackMetaLead (enquiry pixel) error', e);
        }
        return;
      }

      if (!state.guestName || !state.guestEmail) {
        setJsonAttr(ce, 'errors-json', { step4: 'Please provide name and email before submitting.' });
        return;
      }
      if (!String(state.guestPhone || '').trim()) {
        setJsonAttr(ce, 'errors-json', { step4: 'Please provide a phone or WhatsApp number before submitting.' });
        return;
      }
      if (!state.termsAccepted) {
        setJsonAttr(ce, 'errors-json', { step4: 'Please accept the booking terms and policy before submitting.' });
        return;
      }
      const guestCount = Math.max(1, Number(state.guestCount || 1));
      let guestDetails = normalizeGuestDetails(state.guestDetails, guestCount);
      if (state.bookingFlow === 'surf_stay' && !isPackageVariant) {
        guestDetails = ensureSurfStayLessonDefaults(guestDetails, optionsState);
      }
      const isRetreatFlow = state.bookingFlow === 'retreats';
      const selectedExperienceKeys = isRetreatFlow
        ? []
        : (state.experienceRequests || []).map((x) => String(x.activityKey || '').trim()).filter(Boolean);
      const retreatHasSurfActivity = false;
      const selectedActivityDatePrefsRaw =
        state.activityDatePrefs && typeof state.activityDatePrefs === 'object' ? state.activityDatePrefs : {};
      if (!isRetreatFlow && selectedExperienceKeys.length > 0) {
        const byKey = new Map((optionsState.addons.experiences || []).map((row) => [String(row.activityKey || ''), row]));
        const missingDateKeys = selectedExperienceKeys.filter((key) => !String(selectedActivityDatePrefsRaw[key] || '').trim());
        if (missingDateKeys.length > 0) {
          const names = missingDateKeys.map((key) => byKey.get(key)?.title || key);
          setJsonAttr(ce, 'errors-json', {
            step4: `Please choose preferred date for: ${names.join(', ')}.`,
          });
          return;
        }
        const outOfRangeDateKeys = selectedExperienceKeys.filter(
          (key) => !isDateKeyWithinRange(selectedActivityDatePrefsRaw[key], state.checkIn, state.checkOut)
        );
        if (outOfRangeDateKeys.length > 0) {
          const names = outOfRangeDateKeys.map((key) => byKey.get(key)?.title || key);
          setJsonAttr(ce, 'errors-json', {
            step4: `Activity dates must be within booking stay (${state.checkIn} -> ${state.checkOut}): ${names.join(', ')}.`,
          });
          return;
        }
      }
      guestDetails[0] = {
        ...guestDetails[0],
        fullName: state.guestName || '',
        email: state.guestEmail || '',
        phone: state.guestPhone || '',
      };
      const missingNames = guestDetails
        .map((row, idx) => ({ idx, fullName: String(row.fullName || '').trim() }))
        .filter((row) => !row.fullName)
        .map((row) => row.idx + 1);
      if (missingNames.length > 0) {
        setJsonAttr(ce, 'errors-json', {
          step4: `Please provide full name for guest(s): ${missingNames.join(', ')}.`,
        });
        return;
      }
      const isSurfStay = state.bookingFlow === 'surf_stay';
      if (isSurfStay && !isPackageVariant) {
        const surfLessonOptions = getSurfLessonOptionsFromAddons(optionsState);
        if (surfLessonOptions.length > 0) {
          const missingLesson = guestDetails
            .map((row, idx) => ({ idx, key: String(row.enquiryActivityKey || '').trim() }))
            .filter((row) => !row.key)
            .map((row) => row.idx + 1);
          if (missingLesson.length > 0) {
            setJsonAttr(ce, 'errors-json', {
              step4: `Please select a surf lesson for guest(s): ${missingLesson.join(', ')}.`,
            });
            return;
          }
        }
        guestDetails = guestDetails.map((row) => {
          const normalizedLessonFormat = normalizeLessonFormatForActivity(
            row.enquiryActivityKey,
            row.lessonFormat,
            state.bookingFlow
          );
          return {
            ...row,
            lessonFormat: normalizedLessonFormat,
            surfLessonRequest: mapActivityKeyToSurfLessonRequest(row.enquiryActivityKey, normalizedLessonFormat),
            surfedBefore: deriveSurfedBeforeFromLevel(row.surfLevel || ''),
            surfGoals: String(row.surfNotes || row.surfGoals || '').trim(),
          };
        });
      }
      if ((isSurfStay && !isPackageVariant) || retreatHasSurfActivity) {
        const missingSurf = guestDetails
          .map((row, idx) => ({
            idx,
            missing:
              !String(row.surfLevel || '').trim() ||
              !String(row.waterConfidence || '').trim(),
          }))
          .filter((row) => row.missing)
          .map((row) => row.idx + 1);
        if (missingSurf.length > 0) {
          setJsonAttr(ce, 'errors-json', {
            step4: `Please complete surf profile fields for guest(s): ${missingSurf.join(', ')}.`,
          });
          return;
        }
        if (retreatHasSurfActivity) {
          guestDetails = guestDetails.map((row) => ({
            ...row,
            surfedBefore: deriveSurfedBeforeFromLevel(row.surfLevel || ''),
            surfGoals: String(row.surfNotes || row.surfGoals || '').trim(),
          }));
        }
      }
      const retreatDateKeys = [];
      if (isRetreatFlow && retreatDateKeys.length > 0) {
        const activityDatePrefsRaw = state.activityDatePrefs && typeof state.activityDatePrefs === 'object' ? state.activityDatePrefs : {};
        const activityDatePrefs = Object.fromEntries(
          retreatDateKeys.map((key) => [key, String(activityDatePrefsRaw[key] || '').trim()])
        );
        const byKey = new Map((optionsState.addons.experiences || []).map((row) => [String(row.activityKey || ''), row]));
        const missingDateKeys = retreatDateKeys.filter((key) => !activityDatePrefs[key]);
        if (missingDateKeys.length > 0) {
          const names = missingDateKeys.map((key) => byKey.get(key)?.title || key);
          setJsonAttr(ce, 'errors-json', {
            step4: `Please choose preferred date for: ${names.join(', ')}.`,
          });
          return;
        }
        const outOfRangeDateKeys = retreatDateKeys.filter(
          (key) => !isDateKeyWithinRange(activityDatePrefs[key], state.checkIn, state.checkOut)
        );
        if (outOfRangeDateKeys.length > 0) {
          const names = outOfRangeDateKeys.map((key) => byKey.get(key)?.title || key);
          setJsonAttr(ce, 'errors-json', {
            step4: `Activity dates must be within retreat session (${state.checkIn} -> ${state.checkOut}): ${names.join(', ')}.`,
          });
          return;
        }
      }
      const effectiveCoreAddons = isPackageVariant
        ? normalizeCoreAddonsWithPackageTransfer({
            ...state.coreAddons,
            dinner: false,
          }, state.guestCount, state.bookingFlow)
        : normalizeCoreAddonsWithPackageTransfer(state.coreAddons || {}, state.guestCount, state.bookingFlow);
      const transferTypes = getSelectedTransferTypes(effectiveCoreAddons || {});
      const transferIncluded = isPackageVariant && packageTransferIncludedByFlow(state.bookingFlow);
      const hasTransfer = !isRetreatFlow && (transferTypes.length > 0 || transferIncluded);
      const travelTogether = effectiveCoreAddons?.transferTravelTogether === 'no' ? 'no' : 'yes';
      const sharedTransport = normalizeTransportShared(state.transportShared || {});
      if (hasTransfer && travelTogether === 'yes') {
        if (!sharedTransport.transferType || !sharedTransport.arrivalReference || !sharedTransport.arrivalTime) {
          setJsonAttr(ce, 'errors-json', {
            step4: 'Please complete shared transfer arrival details for the group.',
          });
          return;
        }
        if (!isTransferArrivalOnOrBeforeCheckIn(sharedTransport.arrivalTime, state.checkIn)) {
          setJsonAttr(ce, 'errors-json', {
            step4: `Shared transfer arrival date must be on or before check-in date (${state.checkIn}).`,
          });
          return;
        }
      }
      if (hasTransfer && travelTogether === 'no') {
        const missingArrival = guestDetails
          .map((row, idx) => ({
            idx,
            missing:
              !String(row.arrivalTransferType || '').trim() ||
              !String(row.arrivalReference || '').trim() ||
              !String(row.arrivalTime || '').trim(),
          }))
          .filter((row) => row.missing)
          .map((row) => row.idx + 1);
        if (missingArrival.length > 0) {
          setJsonAttr(ce, 'errors-json', {
            step4: `Please complete transfer arrival details for guest(s): ${missingArrival.join(', ')}.`,
          });
          return;
        }
        const invalidArrivalDate = guestDetails
          .map((row, idx) => ({
            idx,
            invalid: !isTransferArrivalOnOrBeforeCheckIn(row.arrivalTime, state.checkIn),
          }))
          .filter((row) => row.invalid)
          .map((row) => row.idx + 1);
        if (invalidArrivalDate.length > 0) {
          setJsonAttr(ce, 'errors-json', {
            step4: `Transfer arrival date must be on or before check-in date (${state.checkIn}) for guest(s): ${invalidArrivalDate.join(', ')}.`,
          });
          return;
        }
      }
      state.guestDetails = guestDetails;
      if (state.bookingFlow === 'retreats') {
        const intake = state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {};
        const requiredTextKeys = ['q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
        const missingText = requiredTextKeys.some((key) => !String(intake[key] || '').trim());
        const q2List = Array.isArray(intake.q2) ? intake.q2.filter(Boolean) : [];
        if (missingText || q2List.length === 0) {
          setJsonAttr(ce, 'errors-json', {
            step4: 'Please complete the mandatory retreat intake questionnaire before submitting.',
          });
          return;
        }
      }
      const selectedSurfLessonKeys =
        isSurfStay && !isPackageVariant
          ? guestDetails.map((row) => String(row.enquiryActivityKey || '').trim()).filter((key) => key && isSurfActivityKey(key))
          : [];
      const mergedActivityRequestKeys = [...new Set([...selectedExperienceKeys, ...selectedSurfLessonKeys])];
      const retreatLessonFormatsByActivity = {};
      const activityDatePrefsRaw = state.activityDatePrefs && typeof state.activityDatePrefs === 'object' ? state.activityDatePrefs : {};
      const preferredDateByActivity = mergedActivityRequestKeys.reduce((acc, key) => {
        const k = String(key || '').trim();
        if (!k) return acc;
        const fromPrefs = String(activityDatePrefsRaw[k] || '').trim();
        if (fromPrefs) {
          acc[k] = fromPrefs;
          return acc;
        }
        const fromGuests = guestDetails.find(
          (row) => String(row.enquiryActivityKey || '').trim() === k && String(row.preferredDate || '').trim()
        );
        if (fromGuests) acc[k] = String(fromGuests.preferredDate || '').trim();
        return acc;
      }, {});
      const mergedExperienceRequests = buildExperienceRequestsByKeys(
        mergedActivityRequestKeys,
        optionsState.addons.experiences || [],
        {
          ...(state.experienceLessonFormats && typeof state.experienceLessonFormats === 'object' ? state.experienceLessonFormats : {}),
          ...retreatLessonFormatsByActivity,
        }
      ).map((row) => ({
        ...row,
        preferredDate: String(preferredDateByActivity[String(row.activityKey || '').trim()] || '').trim(),
      }));
      const assigned = buildAssignedStayLines(state.guestCount, state.roomSelections, optionsState.stayRooms);
      if (!assigned.ok) {
        setJsonAttr(ce, 'errors-json', {
          step4: `Room assignment is incomplete. Remaining guests: ${assigned.remainingGuests}.`,
        });
        return;
      }
      const pricingSnapshot = buildStayPricingSnapshot({
        bookingFlow: state.bookingFlow,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        guests: state.guestCount,
        stayLines: assigned.lines,
        options: optionsState.stayRooms,
        coreAddons: effectiveCoreAddons || {},
        experienceRequests: mergedExperienceRequests,
      });
      const surfProfileJson =
        state.bookingFlow === 'surf_stay'
          ? {
              guests: guestDetails.map((row, idx) => ({
                guestIndex: idx + 1,
                fullName: row.fullName || '',
                surfLevel: row.surfLevel || '',
                surfedBefore: row.surfedBefore || '',
                waterConfidence: row.waterConfidence || '',
                surfGoals: row.surfGoals || '',
                surfNotes: row.surfNotes || '',
                surfLessonRequest:
                  row.surfLessonRequest || mapActivityKeyToSurfLessonRequest(row.enquiryActivityKey, row.lessonFormat),
              })),
            }
          : null;
      const splitRooms = (assigned.lines || []).filter((row) => Number(row.quantityUnits || 0) > 0).length > 1;
      const requestPayload = {
        bookingFlow: state.bookingFlow,
        packageKey: state.packageKey || context.packageKey || packageKeyFromFlow(state.bookingFlow),
        packageSessionId: state.packageSessionId || '',
        guests: state.guestCount,
        participants: state.guestCount,
        checkIn: state.checkIn,
        checkOut: state.checkOut,
        stayLines: assigned.lines,
        guestName: state.guestName || '',
        guestEmail: state.guestEmail || '',
        guestPhone: state.guestPhone || '',
        coreAddons: effectiveCoreAddons || {},
        experienceRequests: mergedExperienceRequests,
        activityRequestKeys: mergedActivityRequestKeys,
        activityRequestNotes: state.activityRequestNotes || '',
        splitRooms,
        surfProfileJson,
        termsAccepted: !!state.termsAccepted,
        dietaryNotes: state.dietaryNotes || '',
        guestDetails,
        transportPlan: {
          transferTravelTogether: hasTransfer ? travelTogether : '',
          transferTypes:
            transferTypes.length > 0
              ? transferTypes
              : transferIncluded
                ? ['airport', 'bus']
                : [],
          transferVehicles: hasTransfer ? Number(effectiveCoreAddons?.transferVehicles || 1) : 0,
          transferAirportVehicles: hasTransfer ? Number(effectiveCoreAddons?.transferAirportVehicles || 0) : 0,
          transferBusVehicles: hasTransfer ? Number(effectiveCoreAddons?.transferBusVehicles || 0) : 0,
          sharedArrival: hasTransfer && travelTogether === 'yes' ? sharedTransport : {},
          guests: !hasTransfer
            ? []
            : travelTogether === 'no'
              ? guestDetails.map((row, idx) => ({
                  guestIndex: idx + 1,
                  fullName: row.fullName || '',
                  transferType: row.arrivalTransferType || '',
                  arrivalReference: row.arrivalReference || '',
                  arrivalTime: row.arrivalTime || '',
                }))
              : guestDetails.map((row, idx) => ({
                  guestIndex: idx + 1,
                  fullName: row.fullName || '',
                  transferType: sharedTransport?.transferType || '',
                  arrivalReference: sharedTransport?.arrivalReference || '',
                  arrivalTime: sharedTransport?.arrivalTime || '',
                })),
        },
        pricingSnapshotJson: JSON.stringify(pricingSnapshot),
        retreatIntakeJson:
          state.bookingFlow === 'retreats'
            ? JSON.stringify(state.retreatIntakeJson && typeof state.retreatIntakeJson === 'object' ? state.retreatIntakeJson : {})
            : '',
        capiTracking,
        capiLeadData: {
          currency: String(pricingSnapshot?.currency || 'EUR').toUpperCase(),
          value: Number(pricingSnapshot?.total || 0) || undefined,
          contentType: 'product',
          contentCategory: String(state.bookingFlow || ''),
          contentName: String(state.packageKey || context.packageKey || ''),
          contentIds: [
            String(state.packageKey || context.packageKey || state.bookingFlow || '').trim(),
          ].filter(Boolean),
          numItems: Number(state.guestCount || 0) || undefined,
        },
      };
      const isRetreatPackageLike = isPackageVariant && state.bookingFlow === 'retreats';
      log(
        isRetreatPackageLike
          ? 'submitEnquiryBooking request (retreat package-like)'
          : isPackageVariant
            ? 'submitPackageBooking request'
            : 'submitStayBooking request',
        requestPayload
      );
      const result = isRetreatPackageLike
        ? await runSubmitWithRetries('submitEnquiryBooking(retreat package-like)', () =>
            submitEnquiryBookingBridge({
              sourcePage: 'booking-page',
              enquiryType: 'custom_retreat',
              retreatKey: normalizeRetreatKey(state.retreatKey || context.retreatKey || ''),
              retreatSessionId: String(state.retreatSessionId || state.packageSessionId || context.retreatSessionId || ''),
              guestName: requestPayload.guestName,
              guestEmail: requestPayload.guestEmail,
              guestPhone: requestPayload.guestPhone,
              guests: requestPayload.guests,
              checkIn: requestPayload.checkIn,
              checkOut: requestPayload.checkOut,
              termsAccepted: requestPayload.termsAccepted,
              notes: requestPayload.activityRequestNotes || '',
              roomSelections: (requestPayload.stayLines || []).map((row) => ({
                roomTypeKey: row.roomTypeKey,
                quantity: Number(row.quantityUnits || 0),
              })),
              coreAddons: requestPayload.coreAddons,
              dietaryNotes: requestPayload.dietaryNotes || '',
              guestDetails: requestPayload.guestDetails || [],
              transportPlan: requestPayload.transportPlan || {},
              requestedDates: `${requestPayload.checkIn || ''} -> ${requestPayload.checkOut || ''}`,
              retreatPricingSnapshotJson: requestPayload.pricingSnapshotJson || '',
              retreatIntakeJson: requestPayload.retreatIntakeJson || '',
              capiTracking: requestPayload.capiTracking,
              capiLeadData: requestPayload.capiLeadData,
            })
          )
        : isPackageVariant
          ? await runSubmitWithRetries('submitPackageBooking', () => submitPackageBookingBridge(requestPayload))
          : await runSubmitWithRetries('submitStayBooking', () => submitStayBookingBridge(requestPayload));
      log(
        isRetreatPackageLike
          ? 'submitEnquiryBooking response (retreat package-like)'
          : isPackageVariant
            ? 'submitPackageBooking response'
            : 'submitStayBooking response',
        result
      );
      const contractVersion = String(result?.contractVersion || '').trim();
      if (!contractVersion) {
        log('submit booking response missing backend contractVersion', result);
      }
      if (!result.ok) {
        if (state.submissionStatus === 'success') return;
        const code = String(result.code || '').trim();
        if (isInventorySubmitErrorCode(code)) {
          setJsonAttr(ce, 'errors-json', {
            step4: result.message || SUBMIT_UNAVAILABLE_MESSAGE,
          });
        } else {
          setJsonAttr(ce, 'errors-json', { step4: result.message || 'Could not submit booking.' });
        }
      } else {
        const referenceId = String(result.bookingId || result.enquiryId || '').trim();
        if (!referenceId) {
          log('submit booking missing reference id in successful response', result);
          setJsonAttr(ce, 'errors-json', {
            step4: 'Submission was accepted but no booking reference was returned. Please retry.',
          });
          return;
        }
        log('submitStayBooking accepted payload snapshot', requestPayload);
        state.submissionStatus = 'success';
        state.currentStep = getSubmitContactStep(state, { isPackageVariant });
        setJsonAttr(ce, 'state-json', state);
        setJsonAttr(ce, 'errors-json', {});
        shouldDelayLoadingRelease = true;

        // Meta CAPI: backend fired CAPI Lead with `leadEventId`. Mirror it on
        // the Pixel side here with the same id for dedup.
        try {
          await trackMetaLead({
            eventId: leadEventId,
            pixelOnly: true,
            orderId: referenceId,
            currency: String(pricingSnapshot?.currency || 'EUR').toUpperCase(),
            value: Number(pricingSnapshot?.total || 0) || undefined,
            email: state.guestEmail || '',
            phone: state.guestPhone || '',
            fullName: state.guestName || '',
            contentCategory: String(state.bookingFlow || ''),
            contentName: String(state.packageKey || context.packageKey || ''),
            contentIds: [
              String(state.packageKey || context.packageKey || state.bookingFlow || '').trim(),
            ].filter(Boolean),
            numItems: Number(state.guestCount || 0) || undefined,
          });
        } catch (e) {
          log('trackMetaLead (stay/package pixel) error', e);
        }
      }
    } catch (e) {
      log('submitStayBooking error', e);
      setJsonAttr(ce, 'errors-json', { step4: 'Could not submit booking.' });
    } finally {
      if (shouldDelayLoadingRelease) {
        await waitForRenderFrames(2);
      }
      submitInFlight = false;
      setLoading(false);
    }
  });

});
