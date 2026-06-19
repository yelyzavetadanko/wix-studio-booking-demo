import { queryCollection } from '../store/demoStore.js';

const STATUS_LABELS = {
  pending_admin_review: 'Pending review',
  awaiting_manual_payment: 'Awaiting payment',
  manually_paid: 'Manually paid',
  payment_pending: 'Payment pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  pending_hold: 'Hold',
  released: 'Released',
};

const ENQUIRY_PAYMENT_LABELS = {
  new: 'New',
  awaiting_payment: 'Awaiting payment',
  payment_link_sent: 'Payment link sent',
  manually_paid: 'Manually paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export function formatBookingStatusLabel(status = '') {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_LABELS[key] || key.replace(/_/g, ' ') || 'Unknown';
}

export function formatEnquiryPaymentLabel(status = '') {
  const key = String(status || '').trim().toLowerCase();
  return ENQUIRY_PAYMENT_LABELS[key] || key.replace(/_/g, ' ') || 'New';
}

export function parseJsonField(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

export function buildDemoGuestRows(row = {}, count = 1) {
  const guests = Math.max(1, Number(count || row.guestCount || 1));
  const baseName = String(row.guestName || 'Demo Guest').trim() || 'Demo Guest';
  const email = String(row.guestEmail || 'guest@example.com').trim();
  const phone = String(row.guestPhone || '+34 600 000 000').trim();
  return Array.from({ length: guests }, (_, idx) => ({
    index: idx + 1,
    fullName: guests === 1 ? baseName : `${baseName.split(' ')[0] || 'Guest'} ${idx + 1}`,
    email,
    phone,
    arrivalTransferType: idx === 0 ? 'airport' : 'none',
    arrivalReference: idx === 0 ? 'FR1234' : '',
    arrivalTime: idx === 0 ? '2026-07-01T14:30' : '',
    surfLevel: row.bookingFlow === 'surf_stay' ? 'beginner' : '',
    waterConfidence: row.bookingFlow === 'surf_stay' ? 'comfortable' : '',
  }));
}

export function buildDemoExperienceLines(row = {}) {
  if (row.bookingFlow !== 'surf_stay') {
    return [
      {
        activityKey: 'sandboarding',
        title: 'Sandboarding',
        categoryLabel: 'Adventure',
        preferredDate: row.checkInDate || row.startDate || '2026-07-02',
        priceLabel: 'From €12',
      },
    ];
  }
  return [
    {
      activityKey: 'surf-lesson-beginner',
      title: 'Surf lesson (beginner)',
      categoryLabel: 'Surf',
      preferredDate: row.checkInDate || row.startDate || '2026-07-02',
      priceLabel: 'Included in Surf & Stay',
    },
  ];
}

export function mapRichStayBooking(row = {}) {
  const flow = String(row.bookingFlow || '').trim();
  const roomSelections = parseJsonField(row.roomTypeSelections, []);
  const status = String(row.status || 'pending_admin_review').trim();
  const guestCount = Math.max(0, Number(row.guestCount || 0));
  const canAct = !['cancelled', 'released'].includes(status.toLowerCase());
  return {
    bookingId: row.bookingId || row._id || '',
    bookingItemId: row._id || '',
    bookingFlow: flow,
    bookingFlowTitle: flow === 'surf_stay' ? 'Surf & Stay' : 'B&B',
    status,
    statusLabel: formatBookingStatusLabel(status),
    guestName: String(row.guestName || '').trim(),
    guestEmail: String(row.guestEmail || '').trim(),
    guestPhone: String(row.guestPhone || '').trim(),
    guestCount,
    checkInDate: row.checkInDate || row.startDate || '',
    checkOutDate: row.checkOutDate || row.endDate || '',
    roomSelectionsCount: Array.isArray(roomSelections) ? roomSelections.length : 1,
    experienceRequestsCount: flow === 'surf_stay' ? 1 : 1,
    hasDinnerAddon: true,
    hasTransferAddon: true,
    transferSummaryLine: 'Airport transfer · 1 vehicle',
    sharedArrivalLine: 'Flight FR1234 · 1 Jul 2026, 14:30',
    experienceLines: buildDemoExperienceLines(row),
    bookingGuests: buildDemoGuestRows(row, guestCount),
    activityRequestNotes: String(row.activityRequestNotes || '').trim(),
    dietaryNotes: 'Vegetarian',
    adminNotes: 'Demo booking — portfolio preview only.',
    manualPaymentLink: row.manualPaymentLink || '',
    invoiceStatus: status === 'confirmed' ? 'sent' : '',
    invoiceSentAt: status === 'confirmed' ? '2026-06-12T10:00:00.000Z' : '',
    paymentDueAt: status === 'awaiting_manual_payment' ? '2026-07-01T12:00:00.000Z' : '',
    paymentReminderCount: 0,
    refundCompleted: status === 'cancelled',
    canSendPaymentLink: canAct && status !== 'confirmed',
    canMarkPaid: canAct && ['awaiting_manual_payment', 'pending_admin_review'].includes(status),
    canMarkUnpaid: canAct && status === 'confirmed',
    canCancel: canAct,
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || row.createdAt || '',
  };
}

export function mapRichEnquiry(row = {}) {
  const manualPaymentStatus = String(row.manualPaymentStatus || row.status || 'new').trim();
  const checkIn = row.checkInDate || '';
  const checkOut = row.checkOutDate || '';
  return {
    enquiryId: row.enquiryId || row._id || '',
    enquiryItemId: row._id || '',
    enquiryType: row.enquiryType || 'activity_enquiry',
    manualPaymentStatus,
    manualPaymentStatusLabel: formatEnquiryPaymentLabel(manualPaymentStatus),
    guestName: String(row.guestName || '').trim(),
    guestEmail: String(row.guestEmail || '').trim(),
    guestPhone: String(row.guestPhone || '').trim(),
    guests: Math.max(0, Number(row.guestCount || 0)),
    requestedDates: checkIn && checkOut ? `${checkIn} -> ${checkOut}` : checkIn || '',
    activityRequestKeys: [row.activityKey || 'sandboarding'].filter(Boolean),
    activityRequestsDetailed: [
      {
        activityKey: row.activityKey || 'sandboarding',
        title: row.activityKey === 'surf-lesson-beginner' ? 'Surf lesson' : 'Sandboarding',
        categoryLabel: 'Experience',
        preferredDate: checkIn || '2026-07-15',
        priceLabel: 'From €12',
      },
    ],
    guestDetails: buildDemoGuestRows(row, row.guestCount || 1),
    activityRequestNotes: String(row.notes || '').trim(),
    dietaryNotes: '',
    transferSummaryLine: 'No transfer requested',
    sharedArrivalLine: '-',
    manualPaymentLink: '',
    canSendPaymentLink: manualPaymentStatus !== 'cancelled',
    canMarkPaid: ['new', 'awaiting_payment', 'payment_link_sent'].includes(manualPaymentStatus),
    canMarkUnpaid: manualPaymentStatus === 'manually_paid' || manualPaymentStatus === 'paid',
    canCancel: manualPaymentStatus !== 'cancelled',
    demo: row.demo === true,
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || row.createdAt || '',
  };
}

export function listDemoBookingsCollection() {
  return queryCollection('bookings');
}
