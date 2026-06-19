import { queryCollection, insertCollectionRow, getStore, nextDemoId, persistDemoStore } from '../store/demoStore.js';

const COLLECTION_MAP = {
  Rooms: 'rooms',
  PackageProducts: 'package-products',
  PackageSessions: 'package-sessions',
  RetreatProducts: 'retreat-products',
  RetreatSessions: 'retreat-sessions',
  PricingRules: 'pricing-rules',
  InventoryBlocks: 'inventory-blocks',
  InventoryUnitClosures: 'inventory-unit-closures',
  BedLocks: 'bed-locks',
  Bookings: 'bookings',
  BookingLineItems: 'booking-line-items',
  BookingAddonRequests: 'booking-addon-requests',
  Enquiries: 'enquiries',
  ActivityCatalog: 'activity-catalog',
  AdminNotificationLog: 'admin-notification-log',
  AuditLog: 'audit-log',
  BookingEvents: 'booking-events',
  Payments: 'payments',
  BookingOccupancyAdjustments: 'booking-occupancy-adjustments',
};

function storeKey(collection) {
  return COLLECTION_MAP[collection] || String(collection || '').toLowerCase();
}

function matchFilter(row, filter) {
  const val = row[filter.field];
  switch (filter.op) {
    case 'eq':
      return String(val ?? '') === String(filter.value ?? '');
    case 'hasSome': {
      const arr = Array.isArray(filter.values) ? filter.values : [];
      if (Array.isArray(val)) return val.some((x) => arr.includes(x));
      return arr.includes(val);
    }
    case 'ge':
      return String(val ?? '') >= String(filter.value ?? '');
    case 'le':
      return String(val ?? '') <= String(filter.value ?? '');
    case 'gt':
      return String(val ?? '') > String(filter.value ?? '');
    case 'lt':
      return String(val ?? '') < String(filter.value ?? '');
    default:
      return true;
  }
}

class DemoQuery {
  constructor(collection) {
    this.collection = collection;
    this.filters = [];
    this.sortField = '';
    this.sortAsc = true;
    this.max = Infinity;
  }

  eq(field, value) {
    this.filters.push({ op: 'eq', field, value });
    return this;
  }

  hasSome(field, values) {
    this.filters.push({ op: 'hasSome', field, values });
    return this;
  }

  ge(field, value) {
    this.filters.push({ op: 'ge', field, value });
    return this;
  }

  le(field, value) {
    this.filters.push({ op: 'le', field, value });
    return this;
  }

  gt(field, value) {
    this.filters.push({ op: 'gt', field, value });
    return this;
  }

  lt(field, value) {
    this.filters.push({ op: 'lt', field, value });
    return this;
  }

  ascending(field) {
    this.sortField = field;
    this.sortAsc = true;
    return this;
  }

  descending(field) {
    this.sortField = field;
    this.sortAsc = false;
    return this;
  }

  limit(n) {
    this.max = Number(n) || Infinity;
    return this;
  }

  async find() {
    getStore();
    let items = queryCollection(storeKey(this.collection));
    for (const f of this.filters) {
      items = items.filter((row) => matchFilter(row, f));
    }
    if (this.sortField) {
      items.sort((a, b) => {
        const av = a[this.sortField];
        const bv = b[this.sortField];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (this.sortAsc ? 1 : -1);
      });
    }
    const page = items.slice(0, this.max);
    return {
      items: page,
      hasNext: () => false,
      next: async () => ({ items: [], hasNext: () => false, next: async () => ({ items: [] }) }),
    };
  }

  async count() {
    const res = await this.find();
    return res.items.length;
  }
}

export async function getById(collection, id) {
  const items = queryCollection(storeKey(collection));
  return items.find((r) => String(r._id || '') === String(id || '')) || null;
}

export async function insert(collection, row) {
  return insertCollectionRow(storeKey(collection), row);
}

export async function update(collection, row) {
  insertCollectionRow(storeKey(collection), row);
  return row;
}

export async function fetchAll(query) {
  const res = await query.find();
  return res.items || [];
}

const wixData = {
  query(collection) {
    return new DemoQuery(collection);
  },
  get: getById,
  insert,
  update,
};

export default wixData;
