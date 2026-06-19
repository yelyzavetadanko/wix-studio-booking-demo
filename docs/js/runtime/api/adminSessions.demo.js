import { queryCollection, upsertCollectionRow, getStore, nextDemoId, persistDemoStore } from '../store/demoStore.js';
import { DEFAULT_PREBLOCKED_DORM, PACKAGE_LIMITS_FALLBACK } from '../core/config.js';
import { formatBookingStatusLabel, parseJsonField } from './adminDemoHelpers.js';

function normalizeProduct(row = {}) {
  const packageKey = String(row.packageKey || '').trim();
  return {
    packageKey,
    title: String(row.name || row.title || packageKey).trim(),
    minParticipants: Number(row.minParticipants || PACKAGE_LIMITS_FALLBACK.minParticipants),
    maxParticipants: Number(row.maxParticipants || PACKAGE_LIMITS_FALLBACK.maxParticipants),
    preBlockedDormBeds: Number(row.preBlockedDormBeds || DEFAULT_PREBLOCKED_DORM[packageKey] || 0),
    durationMode: 'fixed',
    defaultNights: 3,
    minNights: 3,
    maxNights: 7,
  };
}

function nightsBetween(start, end) {
  const s = new Date(`${start}T12:00:00Z`).getTime();
  const e = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / 86400000);
}

function countSessionParticipants(sessionId) {
  return queryCollection('bookings').filter((row) => {
    if (String(row.packageSessionId || '') !== String(sessionId || '')) return false;
    const status = String(row.status || '').trim().toLowerCase();
    return status && status !== 'cancelled' && status !== 'released';
  }).reduce((acc, row) => acc + Math.max(0, Number(row.participantsCount || row.guestCount || 0)), 0);
}

function mapSession(row = {}, productMap = {}) {
  const product = productMap[row.packageKey] || {};
  const packageKey = String(row.packageKey || '').trim();
  const minParticipants = Number(row.minParticipantsSnapshot || product.minParticipants || 0);
  const maxParticipants = Number(row.maxParticipantsSnapshot || product.maxParticipants || 0);
  const participantsBooked = countSessionParticipants(row._id);
  const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
  const nights = nightsBetween(row.sessionStartDate, row.sessionEndDate);
  return {
    sessionId: row._id,
    packageKey,
    packageTitle: product.title || packageKey,
    status: row.status || 'open',
    statusLabel: String(row.status || 'open') === 'open' ? 'Open for bookings' : 'Closed',
    sessionStartDate: row.sessionStartDate,
    sessionEndDate: row.sessionEndDate,
    preBlockedDormBeds: Number(row.preBlockedDormBeds || product.preBlockedDormBeds || 0),
    effectivePreBlockedDormBeds: Number(row.preBlockedDormBeds || product.preBlockedDormBeds || 0),
    minParticipants,
    maxParticipants,
    minParticipantsSnapshot: row.minParticipantsSnapshot,
    maxParticipantsSnapshot: row.maxParticipantsSnapshot,
    participantsBooked,
    participantsLeft,
    participantsSummary: `${minParticipants}-${maxParticipants} participants · ${participantsLeft} left`,
    nights,
    durationLabel: `fixed ${nights || 3} nights`,
    hasDurationMismatch: false,
    durationMismatchMessage: '',
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || row.createdAt || '',
  };
}

function mapPackageBooking(row = {}, sessionMap = {}, productMap = {}) {
  const session = sessionMap[String(row.packageSessionId || '')] || {};
  const product = productMap[session.packageKey] || {};
  const status = String(row.status || 'pending_admin_review');
  const guestCount = Math.max(0, Number(row.guestCount || 0));
  const canAct = !['cancelled', 'released'].includes(status.toLowerCase());
  const roomSelections = parseJsonField(row.roomTypeSelections, [{ roomTypeKey: 'dorm', quantity: guestCount || 1 }]);
  return {
    bookingId: row.bookingId || row._id || '',
    packageSessionId: row.packageSessionId || '',
    packageKey: session.packageKey || '',
    packageTitle: product.title || session.packageKey || '',
    sessionLabel: `${session.sessionStartDate || ''} → ${session.sessionEndDate || ''}`,
    status,
    statusLabel: formatBookingStatusLabel(status),
    guestName: row.guestName || '',
    guestEmail: row.guestEmail || '',
    guestPhone: row.guestPhone || '',
    guestCount,
    roomSelectionsCount: Array.isArray(roomSelections) ? roomSelections.length : 1,
    estimatedTotal: Number(row.estimatedTotal || 0),
    currency: row.currency || 'EUR',
    manualPaymentLink: row.manualPaymentLink || '',
    canSendPaymentLink: canAct && status !== 'confirmed',
    canMarkPaid: canAct && ['awaiting_manual_payment', 'pending_admin_review'].includes(status),
    canMarkUnpaid: canAct && status === 'confirmed',
    canCancel: canAct,
    demo: row.demo === true,
    createdAt: row.createdAt || '',
  };
}

async function loadProducts() {
  const rows = queryCollection('package-products');
  const list = rows.map(normalizeProduct).filter((x) => x.packageKey);
  const byKey = Object.fromEntries(list.map((x) => [x.packageKey, x]));
  return { list, byKey };
}

export async function loadAdminSessionBootstrap() {
  getStore();
  const { list, byKey } = await loadProducts();
  const sessions = queryCollection('package-sessions')
    .sort((a, b) => String(b.sessionStartDate || '').localeCompare(String(a.sessionStartDate || '')))
    .map((row) => mapSession(row, byKey));
  return { ok: true, packageProducts: list, sessions };
}

export async function listAdminPackageSessions(input = {}) {
  getStore();
  const { byKey } = await loadProducts();
  const packageKey = String(input.packageKey || '').trim();
  const status = String(input.status || '').trim();
  let rows = queryCollection('package-sessions');
  if (packageKey) rows = rows.filter((r) => String(r.packageKey) === packageKey);
  if (status) rows = rows.filter((r) => String(r.status) === status);
  rows.sort((a, b) => String(b.sessionStartDate || '').localeCompare(String(a.sessionStartDate || '')));
  return { ok: true, sessions: rows.map((row) => mapSession(row, byKey)) };
}

export async function listAdminPackageBookings(input = {}) {
  getStore();
  const { byKey } = await loadProducts();
  const sessionRows = queryCollection('package-sessions');
  const sessionMap = Object.fromEntries(sessionRows.map((r) => [String(r._id), r]));
  const packageSessionId = String(input.packageSessionId || '').trim();
  const packageKey = String(input.packageKey || '').trim();
  const status = String(input.status || '').trim();
  let rows = queryCollection('bookings').filter(
    (r) => String(r.bookingType || '') === 'package' || String(r.bookingFlow || '').startsWith('package_')
  );
  if (packageSessionId) rows = rows.filter((r) => String(r.packageSessionId) === packageSessionId);
  if (packageKey) {
    rows = rows.filter((r) => {
      const session = sessionMap[String(r.packageSessionId || '')];
      return String(session?.packageKey || '') === packageKey;
    });
  }
  if (status) rows = rows.filter((r) => String(r.status) === status);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { ok: true, bookings: rows.map((row) => mapPackageBooking(row, sessionMap, byKey)) };
}

export async function createAdminPackageSession(input = {}) {
  getStore();
  const form = input.session || {};
  const packageKey = String(form.packageKey || '').trim();
  if (!packageKey) return { ok: false, message: 'packageKey is required.' };
  const id = nextDemoId('sess');
  const row = {
    _id: id,
    packageKey,
    sessionStartDate: String(form.sessionStartDate || '').trim(),
    sessionEndDate: String(form.sessionEndDate || '').trim(),
    status: String(form.status || 'open').trim().toLowerCase(),
    preBlockedDormBeds: Number(form.preBlockedDormBeds || 0),
    minParticipantsSnapshot: Number(form.minParticipantsSnapshot || 0),
    maxParticipantsSnapshot: Number(form.maxParticipantsSnapshot || 0),
    demo: true,
    createdAt: new Date().toISOString(),
  };
  upsertCollectionRow('package-sessions', row);
  persistDemoStore();
  const { byKey } = await loadProducts();
  return { ok: true, session: mapSession(row, byKey) };
}

export async function updateAdminPackageSession(input = {}) {
  getStore();
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) return { ok: false, message: 'sessionId is required.' };
  const existing = queryCollection('package-sessions').find((r) => String(r._id) === sessionId);
  if (!existing) return { ok: false, message: 'Session not found.' };
  const row = { ...existing, ...(input.session || {}), _id: sessionId, demo: true, updatedAt: new Date().toISOString() };
  upsertCollectionRow('package-sessions', row);
  persistDemoStore();
  const { byKey } = await loadProducts();
  return { ok: true, session: mapSession(row, byKey) };
}

export async function deleteAdminPackageSession(input = {}) {
  getStore();
  const sessionId = String(input.sessionId || '').trim();
  if (!sessionId) return { ok: false, message: 'sessionId is required.' };
  const store = getStore();
  store['package-sessions'] = (store['package-sessions'] || []).filter((r) => String(r._id) !== sessionId);
  persistDemoStore();
  return { ok: true };
}

export async function previewAdminSessionOverride() {
  return {
    ok: true,
    preview: {
      message: 'Demo preview — changing pre-blocked dorm beds would affect stay availability on overlapping dates.',
      effectivePreBlockedDormBeds: 4,
    },
  };
}

export async function markAdminPackageBookingPaymentLinkSent(input = {}) {
  getStore();
  const bookingId = String(input.bookingId || '').trim();
  const row = queryCollection('bookings').find((r) => String(r.bookingId || r._id) === bookingId);
  if (!row) return { ok: false, message: 'Booking not found.' };
  upsertCollectionRow('bookings', {
    ...row,
    status: 'awaiting_manual_payment',
    manualPaymentLink: String(input.paymentLink || 'https://pay.example.com/demo').trim(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true };
}

export async function setAdminPackageBookingStatus(input = {}) {
  getStore();
  const bookingId = String(input.bookingId || '').trim();
  const status = String(input.status || '').trim();
  const row = queryCollection('bookings').find((r) => String(r.bookingId || r._id) === bookingId);
  if (!row) return { ok: false, message: 'Booking not found.' };
  upsertCollectionRow('bookings', { ...row, status, demo: true, updatedAt: new Date().toISOString() });
  persistDemoStore();
  const sessionRows = queryCollection('package-sessions');
  const sessionMap = Object.fromEntries(sessionRows.map((r) => [String(r._id), r]));
  const { byKey } = await loadProducts();
  return { ok: true, booking: mapPackageBooking({ ...row, status }, sessionMap, byKey) };
}
