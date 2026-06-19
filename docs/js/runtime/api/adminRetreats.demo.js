import { queryCollection, upsertCollectionRow, getStore, nextDemoId, persistDemoStore } from '../store/demoStore.js';

function mapRetreatProduct(row = {}) {
  return {
    retreatKey: String(row.retreatKey || '').trim().toLowerCase(),
    title: String(row.name || row.title || row.retreatKey || '').trim(),
    minParticipantsDefault: Number(row.minParticipantsDefault || row.minParticipants || 4),
    maxParticipantsDefault: Number(row.maxParticipantsDefault || row.maxParticipants || 8),
    currency: row.currency || 'EUR',
  };
}

function countRetreatParticipants(session) {
  const ids = [String(session._id || ''), String(session.retreatSessionId || '')].filter(Boolean);
  return queryCollection('bookings').filter((row) => {
    const sid = String(row.retreatSessionId || '');
    if (!ids.includes(sid) && !ids.includes(String(row.packageSessionId || ''))) return false;
    const status = String(row.status || '').trim();
    return status && status !== 'cancelled' && status !== 'released';
  }).reduce((acc, row) => acc + Math.max(0, Number(row.participantsCount || row.guestCount || 0)), 0);
}

function mapSession(row = {}, productMap = {}) {
  const retreatKey = String(row.retreatKey || '').trim().toLowerCase();
  const product = productMap[retreatKey] || {};
  const maxParticipants = Number(row.maxParticipantsSnapshot || product.maxParticipantsDefault || 0);
  const participantsBooked = countRetreatParticipants(row);
  const participantsLeft = maxParticipants > 0 ? Math.max(0, maxParticipants - participantsBooked) : 0;
  return {
    sessionId: row._id,
    retreatSessionId: row.retreatSessionId || row._id,
    retreatKey,
    sessionStartDate: row.sessionStartDate,
    sessionEndDate: row.sessionEndDate,
    sessionStartDateKey: row.sessionStartDate,
    sessionEndDateKey: row.sessionEndDate,
    status: row.status || 'open',
    minParticipants: Number(row.minParticipantsSnapshot || product.minParticipantsDefault || 0),
    maxParticipants,
    participantsBooked,
    participantsLeft,
    preBlockedDormBeds: Number(row.preBlockedDormBeds || 0),
    blocksFullHouse: row.blocksFullHouse !== false,
    nights: Number(row.nightsOverride || 7),
    isSoldOut: maxParticipants > 0 ? participantsLeft <= 0 : false,
    demo: row.demo === true,
  };
}

function mapEnquiry(row = {}) {
  return {
    enquiryId: row.enquiryId || row._id || '',
    enquiryType: row.enquiryType || '',
    status: row.status || 'new',
    manualPaymentStatus: row.manualPaymentStatus || '',
    guestName: row.guestName || '',
    guestEmail: row.guestEmail || '',
    retreatKey: row.retreatKey || '',
    retreatSessionId: row.retreatSessionId || '',
    guestCount: Number(row.guestCount || 0),
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    canMarkPaymentLinkSent: true,
    canSetPaymentStatus: true,
  };
}

function loadProducts() {
  const products = queryCollection('retreat-products').map(mapRetreatProduct).filter((x) => x.retreatKey);
  const byKey = Object.fromEntries(products.map((x) => [x.retreatKey, x]));
  return { products, byKey };
}

export async function loadAdminRetreatBootstrap() {
  getStore();
  const { products, byKey } = loadProducts();
  const sessions = queryCollection('retreat-sessions')
    .sort((a, b) => String(b.sessionStartDate || '').localeCompare(String(a.sessionStartDate || '')))
    .map((row) => mapSession(row, byKey));
  const enquiries = queryCollection('enquiries')
    .filter((row) => String(row.enquiryType || '') === 'custom_retreat')
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map(mapEnquiry);
  return { ok: true, retreatProducts: products, sessions, enquiries };
}

export async function listAdminRetreatSessions(input = {}) {
  getStore();
  const { byKey } = loadProducts();
  const retreatKey = String(input.retreatKey || '').trim().toLowerCase();
  let rows = queryCollection('retreat-sessions');
  if (retreatKey) rows = rows.filter((r) => String(r.retreatKey || '').toLowerCase() === retreatKey);
  rows.sort((a, b) => String(b.sessionStartDate || '').localeCompare(String(a.sessionStartDate || '')));
  return { ok: true, sessions: rows.map((row) => mapSession(row, byKey)) };
}

export async function listAdminRetreatEnquiries(input = {}) {
  getStore();
  const status = String(input.status || '').trim();
  let rows = queryCollection('enquiries').filter((r) => String(r.enquiryType || '') === 'custom_retreat');
  if (status) rows = rows.filter((r) => String(r.status) === status);
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { ok: true, enquiries: rows.map(mapEnquiry) };
}

export async function getAdminRetreatEnquiryDetails(input = {}) {
  getStore();
  const enquiryId = String(input.enquiryId || '').trim();
  const row = queryCollection('enquiries').find((r) => String(r.enquiryId || r._id) === enquiryId);
  if (!row) return { ok: false, message: 'Enquiry not found.' };
  return { ok: true, enquiry: { ...mapEnquiry(row), notes: row.notes || '', payloadSnapshotJson: row.payloadSnapshotJson || '' } };
}

export async function createAdminRetreatSession(input = {}) {
  getStore();
  const form = input.session || {};
  const retreatKey = String(form.retreatKey || '').trim().toLowerCase();
  if (!retreatKey) return { ok: false, message: 'retreatKey is required.' };
  const id = nextDemoId('retreat_sess');
  const row = {
    _id: id,
    retreatSessionId: `rt_sess_${String(form.sessionStartDate || 'new').replace(/-/g, '_')}_${retreatKey}`,
    retreatKey,
    sessionStartDate: String(form.sessionStartDate || '').trim(),
    sessionEndDate: String(form.sessionEndDate || '').trim(),
    status: 'open',
    minParticipantsSnapshot: Number(form.minParticipantsSnapshot || 4),
    maxParticipantsSnapshot: Number(form.maxParticipantsSnapshot || 8),
    preBlockedDormBeds: Number(form.preBlockedDormBeds || 4),
    blocksFullHouse: form.blocksFullHouse !== false,
    nightsOverride: 7,
    demo: true,
  };
  upsertCollectionRow('retreat-sessions', row);
  persistDemoStore();
  const { byKey } = loadProducts();
  return { ok: true, session: mapSession(row, byKey) };
}

export async function updateAdminRetreatSession(input = {}) {
  getStore();
  const sessionId = String(input.sessionId || '').trim();
  const existing = queryCollection('retreat-sessions').find((r) => String(r._id) === sessionId);
  if (!existing) return { ok: false, message: 'Session not found.' };
  const row = { ...existing, ...(input.session || {}), _id: sessionId, demo: true };
  upsertCollectionRow('retreat-sessions', row);
  persistDemoStore();
  const { byKey } = loadProducts();
  return { ok: true, session: mapSession(row, byKey) };
}

export async function deleteAdminRetreatSession(input = {}) {
  getStore();
  const sessionId = String(input.sessionId || '').trim();
  const store = getStore();
  store['retreat-sessions'] = (store['retreat-sessions'] || []).filter((r) => String(r._id) !== sessionId);
  persistDemoStore();
  return { ok: true };
}

export async function markAdminRetreatEnquiryPaymentLinkSent(input = {}) {
  getStore();
  const enquiryId = String(input.enquiryId || '').trim();
  const row = queryCollection('enquiries').find((r) => String(r.enquiryId || r._id) === enquiryId);
  if (!row) return { ok: false, message: 'Enquiry not found.' };
  upsertCollectionRow('enquiries', { ...row, paymentLinkSentAt: new Date().toISOString(), demo: true });
  persistDemoStore();
  return { ok: true };
}

export async function setAdminRetreatEnquiryPaymentStatus(input = {}) {
  getStore();
  const enquiryId = String(input.enquiryId || '').trim();
  const manualPaymentStatus = String(input.manualPaymentStatus || '').trim();
  const row = queryCollection('enquiries').find((r) => String(r.enquiryId || r._id) === enquiryId);
  if (!row) return { ok: false, message: 'Enquiry not found.' };
  upsertCollectionRow('enquiries', { ...row, manualPaymentStatus, demo: true });
  persistDemoStore();
  return { ok: true, enquiry: mapEnquiry({ ...row, manualPaymentStatus }) };
}
