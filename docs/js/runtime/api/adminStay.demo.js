import { queryCollection, upsertCollectionRow, getStore } from '../store/demoStore.js';

const STAY_FLOWS = ['bnb', 'surf_stay'];

function mapBooking(row) {
  return {
    bookingId: row.bookingId || row._id || '',
    bookingFlow: row.bookingFlow || '',
    status: row.status || 'pending_admin_review',
    guestName: row.guestName || '',
    guestEmail: row.guestEmail || '',
    guestPhone: row.guestPhone || '',
    checkInDate: row.checkInDate || row.checkIn || '',
    checkOutDate: row.checkOutDate || row.checkOut || '',
    guestCount: Number(row.guestCount || 0),
    estimatedTotal: Number(row.estimatedTotal || 0),
    currency: row.currency || 'EUR',
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || row.createdAt || '',
    canMarkPaymentLinkSent: true,
    canSetStatus: true,
    canCancel: true,
  };
}

function mapEnquiry(row) {
  return {
    enquiryId: row.enquiryId || row._id || '',
    enquiryType: row.enquiryType || '',
    status: row.status || 'new',
    manualPaymentStatus: row.manualPaymentStatus || '',
    guestName: row.guestName || '',
    guestEmail: row.guestEmail || '',
    guestPhone: row.guestPhone || '',
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || row.createdAt || '',
  };
}

function filterBookings(input = {}) {
  const bookingFlow = String(input.bookingFlow || '').trim();
  const status = String(input.status || '').trim();
  const guestEmail = String(input.guestEmail || '').trim().toLowerCase();
  let rows = queryCollection('bookings').filter((row) => STAY_FLOWS.includes(String(row.bookingFlow || '')));
  if (bookingFlow) rows = rows.filter((r) => String(r.bookingFlow) === bookingFlow);
  if (status) rows = rows.filter((r) => String(r.status) === status);
  if (guestEmail) {
    rows = rows.filter((r) => String(r.guestEmail || '').toLowerCase().includes(guestEmail));
  }
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return rows;
}

export async function loadAdminStayBootstrap() {
  getStore();
  const bookings = filterBookings({}).map(mapBooking);
  return {
    ok: true,
    flows: [
      { key: 'bnb', label: 'B&B' },
      { key: 'surf_stay', label: 'Surf & Stay' },
      { key: 'enquiries', label: 'Enquiries' },
    ],
    bookings,
  };
}

export async function listAdminStayBookings(input = {}) {
  getStore();
  return { ok: true, bookings: filterBookings(input).map(mapBooking) };
}

export async function listAdminEnquiries(input = {}) {
  getStore();
  const status = String(input.status || '').trim();
  const guestEmail = String(input.guestEmail || '').trim().toLowerCase();
  let rows = queryCollection('enquiries');
  if (status) rows = rows.filter((r) => String(r.status) === status);
  if (guestEmail) rows = rows.filter((r) => String(r.guestEmail || '').toLowerCase().includes(guestEmail));
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { ok: true, enquiries: rows.map(mapEnquiry) };
}

export async function markAdminStayBookingPaymentLinkSent(input = {}) {
  const id = String(input.bookingId || '').trim();
  if (!id) return { ok: false, message: 'Missing bookingId.' };
  upsertCollectionRow('bookings', {
    _id: id,
    bookingId: id,
    manualPaymentStatus: 'payment_link_sent',
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, demo: true };
}

export async function markAdminEnquiryPaymentLinkSent(input = {}) {
  const id = String(input.enquiryId || '').trim();
  if (!id) return { ok: false, message: 'Missing enquiryId.' };
  upsertCollectionRow('enquiries', {
    _id: id,
    enquiryId: id,
    manualPaymentStatus: 'payment_link_sent',
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, demo: true };
}

export async function setAdminStayBookingStatus(input = {}) {
  const id = String(input.bookingId || '').trim();
  const status = String(input.status || '').trim();
  if (!id || !status) return { ok: false, message: 'Missing bookingId or status.' };
  upsertCollectionRow('bookings', {
    _id: id,
    bookingId: id,
    status,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, demo: true };
}

export async function setAdminEnquiryPaymentStatus(input = {}) {
  const id = String(input.enquiryId || '').trim();
  const manualPaymentStatus = String(input.manualPaymentStatus || input.status || '').trim();
  if (!id || !manualPaymentStatus) return { ok: false, message: 'Missing enquiryId or status.' };
  upsertCollectionRow('enquiries', {
    _id: id,
    enquiryId: id,
    manualPaymentStatus,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, demo: true };
}
