import { queryCollection, upsertCollectionRow, getStore, persistDemoStore } from '../store/demoStore.js';
import { mapRichEnquiry, mapRichStayBooking } from './adminDemoHelpers.js';

const STAY_FLOWS = ['bnb', 'surf_stay'];

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
  const bookings = filterBookings({}).map(mapRichStayBooking);
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
  return { ok: true, bookings: filterBookings(input).map(mapRichStayBooking) };
}

export async function listAdminEnquiries(input = {}) {
  getStore();
  const status = String(input.status || '').trim();
  const guestEmail = String(input.guestEmail || '').trim().toLowerCase();
  let rows = queryCollection('enquiries');
  if (status) rows = rows.filter((r) => String(r.status) === status || String(r.manualPaymentStatus) === status);
  if (guestEmail) rows = rows.filter((r) => String(r.guestEmail || '').toLowerCase().includes(guestEmail));
  rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { ok: true, enquiries: rows.map(mapRichEnquiry) };
}

export async function markAdminStayBookingPaymentLinkSent(input = {}) {
  const id = String(input.bookingId || '').trim();
  if (!id) return { ok: false, message: 'Missing bookingId.' };
  const existing = queryCollection('bookings').find((r) => String(r.bookingId || r._id) === id) || {};
  upsertCollectionRow('bookings', {
    ...existing,
    _id: existing._id || id,
    bookingId: id,
    status: 'awaiting_manual_payment',
    manualPaymentLink: String(input.paymentLink || 'https://pay.example.com/demo').trim(),
    updatedAt: new Date().toISOString(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true, demo: true };
}

export async function markAdminEnquiryPaymentLinkSent(input = {}) {
  const id = String(input.enquiryId || '').trim();
  if (!id) return { ok: false, message: 'Missing enquiryId.' };
  const existing = queryCollection('enquiries').find((r) => String(r.enquiryId || r._id) === id) || {};
  upsertCollectionRow('enquiries', {
    ...existing,
    _id: existing._id || id,
    enquiryId: id,
    manualPaymentStatus: 'payment_link_sent',
    updatedAt: new Date().toISOString(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true, demo: true };
}

export async function setAdminStayBookingStatus(input = {}) {
  const id = String(input.bookingId || '').trim();
  const status = String(input.status || '').trim();
  if (!id || !status) return { ok: false, message: 'Missing bookingId or status.' };
  const existing = queryCollection('bookings').find((r) => String(r.bookingId || r._id) === id) || {};
  upsertCollectionRow('bookings', {
    ...existing,
    _id: existing._id || id,
    bookingId: id,
    status,
    updatedAt: new Date().toISOString(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true, demo: true };
}

export async function setAdminEnquiryPaymentStatus(input = {}) {
  const id = String(input.enquiryId || '').trim();
  const manualPaymentStatus = String(input.manualPaymentStatus || input.status || '').trim();
  if (!id || !manualPaymentStatus) return { ok: false, message: 'Missing enquiryId or status.' };
  const existing = queryCollection('enquiries').find((r) => String(r.enquiryId || r._id) === id) || {};
  upsertCollectionRow('enquiries', {
    ...existing,
    _id: existing._id || id,
    enquiryId: id,
    manualPaymentStatus,
    updatedAt: new Date().toISOString(),
    demo: true,
  });
  persistDemoStore();
  return { ok: true, demo: true };
}
