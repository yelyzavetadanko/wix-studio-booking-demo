import wixLocationFrontend from '../shims/wixLocationFrontend.js';
import {
  listAdminEnquiries,
  listAdminStayBookings,
  loadAdminStayBootstrap,
  markAdminEnquiryPaymentLinkSent,
  markAdminStayBookingPaymentLinkSent,
  setAdminEnquiryPaymentStatus,
  setAdminStayBookingStatus,
} from '../api/adminStay.demo.js';
import { $w } from '../shims/wixPublic.js';

const LOG_PREFIX = '[admin-stays.page]';
const DEFAULT_TAB = 'bnb';

function log(message, payload) {
  console.log(`${LOG_PREFIX} ${message}`, payload || '');
}

function setJsonAttr(el, attr, value) {
  el.setAttribute(attr, JSON.stringify(value || {}));
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

function normalizeTab(value = '') {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'bnb' || key === 'surf_stay' || key === 'enquiries') return key;
  return DEFAULT_TAB;
}

$w.onReady(() => {
  const ce = $w('#stayManagerElement');
  if (!ce) {
    log('custom element not found', { expectedId: '#stayManagerElement' });
    return;
  }

  const context = readContext();
  const optionsState = {
    flows: [],
    bookings: [],
    enquiries: [],
  };
  const state = {
    uiTab: DEFAULT_TAB,
    filters: {
      bnb: { status: '', guestEmail: '', createdFrom: '', createdTo: '' },
      surf_stay: { status: '', guestEmail: '', createdFrom: '', createdTo: '' },
      enquiries: {
        status: '',
        manualPaymentStatus: '',
        guestEmail: '',
        enquiryType: '',
        createdFrom: '',
        createdTo: '',
      },
    },
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

  function currentFilters() {
    return state.filters[state.uiTab] || { status: '', guestEmail: '' };
  }

  async function bootstrap() {
    const res = await loadAdminStayBootstrap();
    log('bootstrap response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load stay admin data.');
      return;
    }
    optionsState.flows = Array.isArray(res.flows) ? res.flows : [];
    optionsState.bookings = Array.isArray(res.bookings) ? res.bookings : [];
  }

  async function refreshBookings() {
    if (state.uiTab === 'enquiries') {
      const filters = currentFilters();
      const res = await listAdminEnquiries({
        status: filters.status || '',
        manualPaymentStatus: filters.manualPaymentStatus || '',
        guestEmail: filters.guestEmail || '',
        enquiryType: filters.enquiryType || '',
        createdFrom: filters.createdFrom || '',
        createdTo: filters.createdTo || '',
      });
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to refresh enquiries.');
        return;
      }
      optionsState.bookings = [];
      optionsState.enquiries = Array.isArray(res.enquiries) ? res.enquiries : [];
      return;
    }
    const filters = currentFilters();
    const payload = {
      bookingFlow: state.uiTab,
      status: filters.status || '',
      guestEmail: filters.guestEmail || '',
      createdFrom: filters.createdFrom || '',
      createdTo: filters.createdTo || '',
    };
    log('refreshBookings payload', payload);
    const res = await listAdminStayBookings(payload);
    log('refreshBookings response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to refresh bookings.');
      return;
    }
    optionsState.bookings = Array.isArray(res.bookings) ? res.bookings : [];
    optionsState.enquiries = [];
  }

  async function runAction(handler) {
    try {
      setLoading(true);
      clearErrors();
      const res = await handler();
      if (!res?.ok) {
        errors.global = uiError(res?.message);
      } else {
        await refreshBookings();
      }
    } catch (e) {
      errors.global = uiError(e?.message);
    } finally {
      setLoading(false);
      syncAll();
    }
  }

  ce.on('stay-manager-init', async () => {
    await runAction(async () => {
      await bootstrap();
      await refreshBookings();
      return { ok: true };
    });
  });

  ce.on('stay-manager-nav', async (event) => {
    const tab = normalizeTab(event?.detail?.tab || DEFAULT_TAB);
    state.uiTab = tab;
    await runAction(async () => {
      await refreshBookings();
      return { ok: true };
    });
  });

  ce.on('stay-manager-refresh', async (event) => {
    const incoming = event?.detail?.filters || {};
    state.filters[state.uiTab] = {
      status: String(incoming.status || '').trim(),
      guestEmail: String(incoming.guestEmail || '').trim(),
      manualPaymentStatus: String(incoming.manualPaymentStatus || '').trim(),
      enquiryType: String(incoming.enquiryType || '').trim(),
      createdFrom: String(incoming.createdFrom || '').trim(),
      createdTo: String(incoming.createdTo || '').trim(),
    };
    await runAction(async () => {
      await refreshBookings();
      return { ok: true };
    });
  });

  ce.on('stay-manager-booking-action', async (event) => {
    const detail = event?.detail || {};
    const action = String(detail.action || '').trim();
    const bookingId = String(detail.bookingId || '').trim();
    const note = String(detail.note || '').trim();
    const refundCompleted = detail.refundCompleted === true;
    if (!bookingId) return;
    if (action === 'send-link') {
      const paymentLink = String(detail.paymentLink || '').trim();
      const paymentDueNote = String(detail.paymentDueNote || '').trim();
      if (state.uiTab === 'enquiries') {
        await runAction(() =>
          markAdminEnquiryPaymentLinkSent({
            enquiryId: bookingId,
            paymentLink,
            paymentDueNote,
            note,
            actorId: context.actorId,
          })
        );
        return;
      }
      await runAction(() =>
        markAdminStayBookingPaymentLinkSent({
          bookingId,
          paymentLink,
          paymentDueNote,
          note,
          actorId: context.actorId,
        })
      );
      return;
    }
    if (action === 'mark-paid') {
      if (state.uiTab === 'enquiries') {
        await runAction(() =>
          setAdminEnquiryPaymentStatus({
            enquiryId: bookingId,
            status: 'manually_paid',
            note,
            actorId: context.actorId,
          })
        );
        return;
      }
      await runAction(() =>
        setAdminStayBookingStatus({
          bookingId,
          status: 'confirmed',
          note,
          actorId: context.actorId,
        })
      );
      return;
    }
    if (action === 'mark-unpaid') {
      if (state.uiTab === 'enquiries') {
        await runAction(() =>
          setAdminEnquiryPaymentStatus({
            enquiryId: bookingId,
            status: 'awaiting_manual_payment',
            note,
            actorId: context.actorId,
          })
        );
        return;
      }
      await runAction(() =>
        setAdminStayBookingStatus({
          bookingId,
          status: 'awaiting_manual_payment',
          note,
          actorId: context.actorId,
        })
      );
      return;
    }
    if (action === 'cancel') {
      if (state.uiTab === 'enquiries') {
        await runAction(() =>
          setAdminEnquiryPaymentStatus({
            enquiryId: bookingId,
            status: 'cancelled',
            note,
            cancelReason: note,
            refundCompleted,
            actorId: context.actorId,
          })
        );
        return;
      }
      await runAction(() =>
        setAdminStayBookingStatus({
          bookingId,
          status: 'cancelled',
          note,
          refundCompleted,
          actorId: context.actorId,
        })
      );
      return;
    }
  });

  syncAll();
});
