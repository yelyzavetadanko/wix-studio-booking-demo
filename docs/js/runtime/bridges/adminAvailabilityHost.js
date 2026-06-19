import wixLocationFrontend from '../shims/wixLocationFrontend.js';
import {
  bulkSetAdminInventoryUnitClosures,
  clearAdminInventoryUnitClosures,
  loadAdminAvailabilityBootstrap,
  releaseAdminReserveForUnit,
  releaseAdminSessionReserve,
  setAdminBookingEarlyCheckout,
  setAdminInventoryUnitClosure,
} from '../api/adminAvailability.demo.js';
import { $w } from '../shims/wixPublic.js';

const LOG_PREFIX = '[admin-availability.page]';
const DEMO_MONTH = '2026-07';

function log(message, payload) {
  console.log(`${LOG_PREFIX} ${message}`, payload || '');
}

function setJsonAttr(el, attr, value) {
  el.setAttribute(attr, JSON.stringify(value || {}));
}

function toMonthKey(value = '') {
  const raw = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  return DEMO_MONTH;
}

function readContext() {
  const q = wixLocationFrontend.query || {};
  return {
    actorId: String(q.actorId || q.adminId || 'admin-dashboard').trim(),
  };
}

function uiError(message, fallback = 'Something went wrong. Please try again.') {
  const text = String(message || '').trim();
  return text || fallback;
}

$w.onReady(() => {
  const ce = $w('#availabilityManagerElement');
  if (!ce) {
    log('custom element not found', { expectedId: '#availabilityManagerElement' });
    return;
  }

  const context = readContext();
  const state = {
    monthKey: toMonthKey(wixLocationFrontend.query?.month || ''),
    roomTypeFilter: '',
    source: '',
    note: '',
  };
  const optionsState = {
    units: [],
    days: [],
    closures: [],
    occupancyByTypeDate: {},
    bookingContextsByTypeDate: {},
  };
  const errors = {
    global: '',
  };
  let loadingWatchdog = null;

  function setLoading(value) {
    ce.setAttribute('loading', value ? 'true' : 'false');
    if (loadingWatchdog) {
      clearTimeout(loadingWatchdog);
      loadingWatchdog = null;
    }
    if (value) {
      loadingWatchdog = setTimeout(() => {
        ce.setAttribute('loading', 'false');
        log('loading watchdog released');
      }, 20000);
    }
  }

  function syncAll() {
    setJsonAttr(ce, 'context-json', context);
    setJsonAttr(ce, 'state-json', state);
    setJsonAttr(ce, 'options-json', optionsState);
    setJsonAttr(ce, 'errors-json', errors);
  }

  function clearErrors() {
    errors.global = '';
  }

  async function refreshMonth(monthKey = state.monthKey) {
    const safeMonth = toMonthKey(monthKey);
    state.monthKey = safeMonth;
    const res = await loadAdminAvailabilityBootstrap({ monthKey: safeMonth });
    log('loadAdminAvailabilityBootstrap response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load availability data.');
      return false;
    }
    optionsState.units = Array.isArray(res.units) ? res.units : [];
    optionsState.days = Array.isArray(res.range?.days) ? res.range.days : [];
    optionsState.closures = Array.isArray(res.closures) ? res.closures : [];
    optionsState.occupancyByTypeDate =
      res.occupancyByTypeDate && typeof res.occupancyByTypeDate === 'object' ? res.occupancyByTypeDate : {};
    optionsState.bookingContextsByTypeDate =
      res.bookingContextsByTypeDate && typeof res.bookingContextsByTypeDate === 'object' ? res.bookingContextsByTypeDate : {};
    return true;
  }

  async function initPage() {
    setLoading(true);
    clearErrors();
    syncAll();
    try {
      await refreshMonth(state.monthKey);
    } catch (error) {
      log('initPage error', error);
      errors.global = uiError(error?.message, 'Failed to initialize availability page.');
    } finally {
      syncAll();
      setLoading(false);
    }
  }

  ce.on('availability-init', async () => {
    await initPage();
  });

  ce.on('availability-refresh', async (event) => {
    const detail = event?.detail || {};
    state.monthKey = toMonthKey(detail.monthKey || state.monthKey);
    state.roomTypeFilter = String(detail.roomTypeFilter || '').trim().toLowerCase();
    if (detail.source != null) state.source = String(detail.source || '').trim().toLowerCase();
    if (detail.note != null) state.note = String(detail.note || '').trim();
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshMonth(state.monthKey);
    } catch (error) {
      log('availability-refresh error', error);
      errors.global = uiError(error?.message, 'Failed to refresh availability month.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-toggle-cell', async (event) => {
    const detail = event?.detail || {};
    const unitId = String(detail.unitId || '').trim();
    const dateKey = String(detail.dateKey || '').trim();
    const isOpen = detail.isOpen !== false;
    const source = String(detail.source || state.source || '').trim();
    const note = String(detail.note || state.note || '').trim();
    if (!unitId || !dateKey) return;
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await setAdminInventoryUnitClosure({
        actorId: context.actorId,
        unitId,
        dateKey,
        isOpen,
        source,
        note,
      });
      log('setAdminInventoryUnitClosure response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to update unit state.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-toggle-cell error', error);
      errors.global = uiError(error?.message, 'Failed to update unit state.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-bulk-set', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await bulkSetAdminInventoryUnitClosures({
        actorId: context.actorId,
        roomTypeKey: String(detail.roomTypeKey || '').trim(),
        startDateKey: String(detail.startDateKey || '').trim(),
        endDateKey: String(detail.endDateKey || '').trim(),
        isOpen: detail.isOpen !== false,
        source: String(detail.source || state.source || '').trim(),
        note: String(detail.note || state.note || '').trim(),
        includeGuestDetails: detail.includeGuestDetails === true,
        guestName: String(detail.guestName || '').trim(),
        guestPhone: String(detail.guestPhone || '').trim(),
        guestEmail: String(detail.guestEmail || '').trim(),
        unitIds: Array.isArray(detail.unitIds) ? detail.unitIds : [],
      });
      log('bulkSetAdminInventoryUnitClosures response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to apply range update.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-bulk-set error', error);
      errors.global = uiError(error?.message, 'Failed to apply range update.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-clear-range', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await clearAdminInventoryUnitClosures({
        actorId: context.actorId,
        roomTypeKey: String(detail.roomTypeKey || '').trim(),
        startDateKey: String(detail.startDateKey || '').trim(),
        endDateKey: String(detail.endDateKey || '').trim(),
        unitIds: Array.isArray(detail.unitIds) ? detail.unitIds : [],
      });
      log('clearAdminInventoryUnitClosures response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to clear range.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-clear-range error', error);
      errors.global = uiError(error?.message, 'Failed to clear range.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-early-checkout', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await setAdminBookingEarlyCheckout({
        actorId: context.actorId,
        bookingId: String(detail.bookingId || '').trim(),
        roomTypeKey: String(detail.roomTypeKey || '').trim(),
        fromDateKey: String(detail.fromDateKey || '').trim(),
        quantity: Number(detail.quantity || 0),
        note: String(detail.note || '').trim(),
      });
      log('setAdminBookingEarlyCheckout response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to apply early checkout.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-early-checkout error', error);
      errors.global = uiError(error?.message, 'Failed to apply early checkout.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-release-reserve', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await releaseAdminSessionReserve({
        actorId: context.actorId,
        reserveType: String(detail.reserveType || '').trim().toLowerCase(),
        sessionId: String(detail.sessionId || '').trim(),
        quantity: Number(detail.quantity || 1),
      });
      log('releaseAdminSessionReserve response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to release reserve.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-release-reserve error', error);
      errors.global = uiError(error?.message, 'Failed to release reserve.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('availability-release-reserve-bed', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await releaseAdminReserveForUnit({
        actorId: context.actorId,
        reserveType: String(detail.reserveType || '').trim().toLowerCase(),
        sessionId: String(detail.sessionId || '').trim(),
        unitId: String(detail.unitId || '').trim(),
        startDateKey: String(detail.startDateKey || '').trim(),
        endDateKey: String(detail.endDateKey || '').trim(),
      });
      log('releaseAdminReserveForUnit response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to release reserve for selected bed.');
      } else {
        await refreshMonth(state.monthKey);
      }
    } catch (error) {
      log('availability-release-reserve-bed error', error);
      errors.global = uiError(error?.message, 'Failed to release reserve for selected bed.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  initPage();
});

