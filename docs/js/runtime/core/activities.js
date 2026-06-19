import wixData from '../shims/wixData.js';
import { COLLECTIONS, BOOKING_FLOW } from '../core/config.js';

const PACKAGE_ACTIVITY_BLOCKLIST = {
  BeachReset: new Set([
    // Included in Beach Reset fixed program.
    'sunset-yoga',
    'hammam-spa',
    'deep-tissue-massage',
    // Not allowed for package add-ons per rules.
    'cooking-class',
    'cultural-day-trip',
  ]),
  RootsAndRitual: new Set([
    // Included or explicitly excluded for Roots.
    'sunset-yoga',
    'ancestral-beauty-henna',
    'cooking-class',
    'cultural-day-trip',
  ]),
  SurfAndSoul: new Set([
    // Included in Surf & Soul fixed program.
    'sunset-yoga',
    'hammam-spa',
    'deep-tissue-massage',
    // Not allowed for package add-ons per rules.
    'cooking-class',
    'ancestral-beauty-henna',
    'cultural-day-trip',
  ]),
};

const SURF_ENQUIRY_ACTIVITY_KEYS = new Set([
  'surf-lesson-beginner',
  'surf-lesson-intermediate',
  'surf-guiding',
  'surf-extended-experience',
]);

function isSurfActivityKey(activityKey = '') {
  const key = String(activityKey || '').trim().toLowerCase();
  if (!key) return false;
  return SURF_ENQUIRY_ACTIVITY_KEYS.has(key) || key.startsWith('surf-');
}

function packageKeyFromFlow(flow = '') {
  if (flow === BOOKING_FLOW.PACKAGE_BEACH_RESET) return 'BeachReset';
  if (flow === BOOKING_FLOW.PACKAGE_ROOTS_RITUAL) return 'RootsAndRitual';
  if (flow === BOOKING_FLOW.PACKAGE_SURF_SOUL) return 'SurfAndSoul';
  return '';
}

function isActivityBlockedForPackage(activityKey, packageKey) {
  const block = PACKAGE_ACTIVITY_BLOCKLIST[String(packageKey || '')];
  return !!(block && block.has(String(activityKey || '')));
}

function normalizeEnquiryType(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'custom_package' || key === 'custompackage' || key === 'custom-package') return 'custom_package';
  if (key === 'custom_retreat' || key === 'customretreat' || key === 'custom-retreat') return 'custom_retreat';
  if (key === 'activity_enquiry' || key === 'activity' || key === 'activity-request') return 'activity_enquiry';
  return key;
}

function normalizeBookingFlow(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'retreat_dihya' || key === 'retreat_anzar' || key === 'retreat' || key === 'retreats_flow') {
    return 'retreats';
  }
  return key;
}

function shouldIncludeInEnquiryList(row, enquiryType = '') {
  if (!enquiryType) return true;
  const type = normalizeEnquiryType(enquiryType);
  const key = String(row?.activityKey || '').trim().toLowerCase();
  if (type === 'surf_activity') {
    return SURF_ENQUIRY_ACTIVITY_KEYS.has(key) || key.startsWith('surf-');
  }
  if (type === 'activity_enquiry') {
    return !(SURF_ENQUIRY_ACTIVITY_KEYS.has(key) || key.startsWith('surf-'));
  }
  return true;
}

function isPackageAddonMode(flow = '', mode = '') {
  return String(mode || '') === 'package_addon' || String(flow || '').startsWith('package_');
}

function isStayAddonMode(mode = '') {
  return String(mode || '') === 'stay_addon';
}

function isEnquiryMode(mode = '') {
  return String(mode || '') === 'enquiry';
}

function evaluateActivityRules(row, context = {}) {
  if (!row) return { ok: false };
  if (row.isActive === false) return { ok: false };

  const flow = String(context?.bookingFlow || '');
  const packageKey = String(context?.packageKey || packageKeyFromFlow(flow) || '');
  const mode = String(context?.mode || '');
  const rowKey = String(row?.activityKey || '').trim().toLowerCase();
  const surfStayLessonOverride =
    (flow === BOOKING_FLOW.SURF_STAY || flow === 'surf_stay') &&
    (SURF_ENQUIRY_ACTIVITY_KEYS.has(rowKey) || rowKey.startsWith('surf-lesson-') || rowKey === 'surf-guiding');

  if (isStayAddonMode(mode)) {
    if ((flow === BOOKING_FLOW.BNB || flow === 'bnb') && row.allowBnB === false) {
      return { ok: false };
    }
    if ((flow === BOOKING_FLOW.SURF_STAY || flow === 'surf_stay') && !surfStayLessonOverride && row.allowSurfStay !== true) {
      return { ok: false };
    }
  }

  if (isPackageAddonMode(flow, mode)) {
    const category = String(row.category || '').toLowerCase();
    const durationLabel = String(row.durationLabel || '').toLowerCase();
    const restriction = String(row.timeRestriction || '').toLowerCase();
    if (category === 'workshop' || category === 'retreat') return { ok: false };
    if (durationLabel.includes('full day') || restriction.includes('full day')) return { ok: false };
    if (row.allowPackageAddon !== true) return { ok: false };
    if (packageKey && !matchesPackage(row, packageKey)) return { ok: false };
    if (packageKey && isActivityBlockedForPackage(row.activityKey, packageKey)) return { ok: false };
  }

  if (
    (isStayAddonMode(mode) || isPackageAddonMode(flow, mode)) &&
    row.enquiryOnly === true &&
    !(isStayAddonMode(mode) && surfStayLessonOverride)
  ) {
    return { ok: false };
  }

  if (isEnquiryMode(mode)) {
    const enquiryType = normalizeEnquiryType(context?.enquiryType || '');
    if (!shouldIncludeInEnquiryList(row, enquiryType)) return { ok: false };
  }

  return { ok: true };
}

async function fetchAll(baseQuery, pageSize = 500) {
  let res = await baseQuery.limit(pageSize).find();
  const items = Array.isArray(res.items) ? [...res.items] : [];
  while (res.hasNext()) {
    res = await res.next();
    if (Array.isArray(res.items) && res.items.length) items.push(...res.items);
  }
  return items;
}

export async function listActivitiesForContext(query) {
  const bookingFlow = normalizeBookingFlow(query?.bookingFlow || '');
  const packageKey = String(query?.packageKey || packageKeyFromFlow(bookingFlow) || '');
  const enquiryType = normalizeEnquiryType(query?.enquiryType || '');
  const rows = await fetchAll(wixData.query(COLLECTIONS.ACTIVITY_CATALOG));

  return rows
    .filter((row) => {
      if (bookingFlow === BOOKING_FLOW.BNB || bookingFlow === 'bnb') {
        return evaluateActivityRules(row, { bookingFlow, mode: 'stay_addon' }).ok;
      }
      if (bookingFlow === BOOKING_FLOW.SURF_STAY || bookingFlow === 'surf_stay') {
        return evaluateActivityRules(row, { bookingFlow, mode: 'stay_addon' }).ok;
      }
      if (packageKey) {
        return evaluateActivityRules(row, {
          bookingFlow,
          packageKey,
          mode: 'package_addon',
        }).ok;
      }
      if (bookingFlow === 'retreats') {
        const packageEligible = evaluateActivityRules(row, {
          bookingFlow,
          mode: 'package_addon',
        }).ok;
        const surfLessonEligible =
          isSurfActivityKey(row?.activityKey || '') &&
          evaluateActivityRules(row, {
            bookingFlow: BOOKING_FLOW.SURF_STAY,
            mode: 'stay_addon',
          }).ok;
        return packageEligible || surfLessonEligible;
      }
      if (bookingFlow === BOOKING_FLOW.ENQUIRY || bookingFlow === 'enquiry') {
        return evaluateActivityRules(row, { bookingFlow, mode: 'enquiry', enquiryType }).ok;
      }
      return evaluateActivityRules(row, { bookingFlow, mode: '' }).ok;
    })
    .sort((a, b) => {
      const aFeatured = a.isFeatured === true ? 1 : 0;
      const bFeatured = b.isFeatured === true ? 1 : 0;
      if (aFeatured !== bFeatured) return bFeatured - aFeatured;
      const aOrder = Number(a.sortOrder || 0);
      const bOrder = Number(b.sortOrder || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
}

function matchesPackage(row, packageKey) {
  const keys = (row.packageKeysEligible || '').split(',').map((s) => s.trim());
  if (keys.length === 0 || keys[0] === '') return true;
  return keys.includes(packageKey);
}

export async function getActivitiesByKeys(activityKeys = []) {
  const uniqueKeys = [...new Set((Array.isArray(activityKeys) ? activityKeys : []).map((key) => String(key || '').trim()))].filter(
    Boolean
  );
  if (!uniqueKeys.length) return [];
  const allRows = await fetchAll(wixData.query(COLLECTIONS.ACTIVITY_CATALOG).hasSome('activityKey', uniqueKeys));
  const byKey = new Map(allRows.map((row) => [String(row.activityKey || ''), row]));
  return uniqueKeys.map((key) => byKey.get(key)).filter(Boolean);
}

export async function validateActivityKeys(activityKeys, context) {
  if (!activityKeys || activityKeys.length === 0) return { ok: true };
  const uniqueKeys = [...new Set(activityKeys.map((key) => String(key || '').trim()))].filter(Boolean);
  if (!uniqueKeys.length) return { ok: true };
  const invalid = [];
  const flow = normalizeBookingFlow(context?.bookingFlow || '');
  const packageKey = String(context?.packageKey || packageKeyFromFlow(flow) || '');
  const mode = String(context?.mode || '');
  const enquiryType = normalizeEnquiryType(context?.enquiryType || '');
  const rows = await getActivitiesByKeys(uniqueKeys);
  const byKey = new Map(rows.map((row) => [String(row.activityKey || ''), row]));
  for (const key of uniqueKeys) {
    const row = byKey.get(key);
    if (!row) {
      invalid.push(key);
      continue;
    }
    if (
      !evaluateActivityRules(row, {
        bookingFlow: flow,
        packageKey,
        mode,
        enquiryType,
      }).ok
    ) {
      invalid.push(key);
    }
  }
  if (invalid.length) {
    return { ok: false, code: 'ACTIVITY_NOT_ALLOWED', keys: invalid };
  }
  return { ok: true };
}
