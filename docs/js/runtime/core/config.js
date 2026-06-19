export const COLLECTIONS = {
  ROOMS: 'Rooms',
  PACKAGE_PRODUCTS: 'PackageProducts',
  PACKAGE_SESSIONS: 'PackageSessions',
  RETREAT_PRODUCTS: 'RetreatProducts',
  RETREAT_SESSIONS: 'RetreatSessions',
  PRICING_RULES: 'PricingRules',
  INVENTORY_BLOCKS: 'InventoryBlocks',
  INVENTORY_UNIT_CLOSURES: 'InventoryUnitClosures',
  BOOKING_OCCUPANCY_ADJUSTMENTS: 'BookingOccupancyAdjustments',
  BED_LOCKS: 'BedLocks',
  BOOKINGS: 'Bookings',
  BOOKING_LINE_ITEMS: 'BookingLineItems',
  BOOKING_ADDON_REQUESTS: 'BookingAddonRequests',
  ADMIN_NOTIFICATION_LOG: 'AdminNotificationLog',
  PAYMENTS: 'Payments',
  ENQUIRIES: 'Enquiries',
  ACTIVITY_CATALOG: 'ActivityCatalog',
  AUDIT_LOG: 'AuditLog',
  BOOKING_EVENTS: 'BookingEvents',
};

export const ROOM_KEYS = {
  DORM: 'dorm',
  SINGLE: 'single',
  DOUBLE: 'double',
};

export const INVENTORY_KIND = {
  BED: 'bed',
  ROOM_UNIT: 'room_unit',
};

export const BOOKING_FLOW = {
  BNB: 'bnb',
  SURF_STAY: 'surf_stay',
  PACKAGE_BEACH_RESET: 'package_beach_reset',
  PACKAGE_ROOTS_RITUAL: 'package_roots_ritual',
  PACKAGE_SURF_SOUL: 'package_surf_soul',
  ENQUIRY: 'enquiry',
};

export const PACKAGE_KEY_TO_FLOW = {
  BeachReset: BOOKING_FLOW.PACKAGE_BEACH_RESET,
  RootsAndRitual: BOOKING_FLOW.PACKAGE_ROOTS_RITUAL,
  SurfAndSoul: BOOKING_FLOW.PACKAGE_SURF_SOUL,
};

export const DEFAULT_PREBLOCKED_DORM = {
  BeachReset: 3,
  RootsAndRitual: 4,
  SurfAndSoul: 4,
};

export const PACKAGE_LIMITS_FALLBACK = {
  minParticipants: 4,
  maxParticipants: 8,
};

export const HOLD_MS = 12 * 60 * 60 * 1000;

export const BOOKING_STATUS = {
  PENDING_HOLD: 'pending_hold',
  PENDING_ADMIN_REVIEW: 'pending_admin_review',
  AWAITING_MANUAL_PAYMENT: 'awaiting_manual_payment',
  MANUALLY_PAID: 'manually_paid',
  PAYMENT_PENDING: 'payment_pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  RELEASED: 'released',
};

export const BOOKING_ACTIVE_INVENTORY_STATUSES = [
  BOOKING_STATUS.PENDING_HOLD,
  BOOKING_STATUS.PENDING_ADMIN_REVIEW,
  BOOKING_STATUS.AWAITING_MANUAL_PAYMENT,
  BOOKING_STATUS.MANUALLY_PAID,
  BOOKING_STATUS.CONFIRMED,
];

export const RETREAT_OCCUPIED_STATUSES = [
  BOOKING_STATUS.AWAITING_MANUAL_PAYMENT,
  BOOKING_STATUS.MANUALLY_PAID,
  BOOKING_STATUS.CONFIRMED,
];

export const LOCK_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  RELEASED: 'released',
};

export const PAYMENT_STATUS = {
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

export const PAYMENT_MODE = {
  FULL: 'full',
  DEPOSIT: 'deposit',
};

export const TRANSFER_VEHICLE_CAPACITY = 6;
export const FEATURES = {
  ONLINE_PAYMENT: false,
};

export const GUEST_RESPONSE_HOURS = 12;

export const OPERATIONAL_FLAG = {
  BELOW_PACKAGE_MIN: 'below_package_min',
  MINIMUM_EMAIL_SENT: 'minimum_email_sent',
  RESOLUTION_PENDING: 'resolution_pending',
};

export const LINE_ITEM_TYPE = {
  ROOM_BASE: 'room_base',
  PACKAGE_BASE: 'package_base',
  DORM_UPGRADE: 'dorm_upgrade',
  SINGLE_UPGRADE: 'single_upgrade',
  DOUBLE_UPGRADE: 'double_upgrade',
  ADDON_TRANSFER: 'addon_transfer',
  ADDON_DINNER: 'addon_dinner',
  OTHER: 'other',
};
