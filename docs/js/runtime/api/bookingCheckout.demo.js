import { nextDemoId, insertCollectionRow, persistDemoStore } from '../store/demoStore.js';

export async function submitStayBooking(payload = {}) {
  const bookingId = nextDemoId('demo_stay');
  insertCollectionRow('bookings', {
    _id: bookingId,
    bookingId,
    bookingType: 'room',
    bookingFlow: payload.bookingFlow || 'bnb',
    status: 'pending_admin_review',
    guestName: payload.guestName || '',
    guestEmail: payload.guestEmail || '',
    guestPhone: payload.guestPhone || '',
    checkInDate: payload.checkIn || payload.checkInDate || '',
    checkOutDate: payload.checkOut || payload.checkOutDate || '',
    guestCount: Number(payload.guestCount || 0),
    demo: true,
    payloadSnapshotJson: JSON.stringify(payload).slice(0, 8000),
    createdAt: new Date().toISOString(),
  });
  persistDemoStore();
  return {
    ok: true,
    demo: true,
    bookingId,
    status: 'pending_admin_review',
    message: 'Demo booking saved locally in this browser session only.',
  };
}

export async function submitPackageBooking(payload = {}) {
  const bookingId = nextDemoId('demo_pkg');
  insertCollectionRow('bookings', {
    _id: bookingId,
    bookingId,
    bookingFlow: payload.bookingFlow || '',
    packageSessionId: payload.packageSessionId || '',
    status: 'pending_admin_review',
    guestName: payload.guestName || '',
    guestEmail: payload.guestEmail || '',
    demo: true,
    payloadSnapshotJson: JSON.stringify(payload).slice(0, 8000),
    createdAt: new Date().toISOString(),
  });
  persistDemoStore();
  return {
    ok: true,
    demo: true,
    bookingId,
    status: 'pending_admin_review',
    message: 'Demo booking saved locally in this browser session only.',
  };
}

export async function submitEnquiryBooking(payload = {}) {
  const enquiryId = nextDemoId('demo_enq');
  insertCollectionRow('enquiries', {
    _id: enquiryId,
    enquiryId,
    enquiryType: payload.enquiryType || '',
    status: 'new',
    guestName: payload.guestName || '',
    guestEmail: payload.guestEmail || '',
    demo: true,
    payloadSnapshotJson: JSON.stringify(payload).slice(0, 8000),
    createdAt: new Date().toISOString(),
  });
  persistDemoStore();
  return {
    ok: true,
    demo: true,
    enquiryId,
    message: 'Demo enquiry saved locally in this browser session only.',
  };
}

export async function submitCustomRetreatRequest(payload = {}) {
  return submitEnquiryBooking({ ...payload, enquiryType: 'custom_retreat' });
}

export const submitStayBookingBridge = submitStayBooking;
export const submitPackageBookingBridge = submitPackageBooking;
export const submitEnquiryBookingBridge = submitEnquiryBooking;
