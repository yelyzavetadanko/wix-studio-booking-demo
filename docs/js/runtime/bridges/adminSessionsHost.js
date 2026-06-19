import wixLocationFrontend from '../shims/wixLocationFrontend.js';
import {
  createAdminPackageSession,
  deleteAdminPackageSession,
  listAdminPackageBookings,
  listAdminPackageSessions,
  loadAdminSessionBootstrap,
  markAdminPackageBookingPaymentLinkSent,
  previewAdminSessionOverride,
  setAdminPackageBookingStatus,
  updateAdminPackageSession,
} from '../api/adminSessions.demo.js';
import { $w } from '../shims/wixPublic.js';

const LOG_PREFIX = '[admin-sessions.page]';
const DEFAULT_PACKAGE = 'BeachReset';

function log(message, payload) {
  console.log(`${LOG_PREFIX} ${message}`, payload || '');
}

function setJsonAttr(el, attr, value) {
  el.setAttribute(attr, JSON.stringify(value || {}));
}

function packageKeysFromProducts(products = []) {
  return (Array.isArray(products) ? products : [])
    .map((row) => String(row.packageKey || '').trim())
    .filter((x) => !!x);
}

function getDefaultPackageKey(products = []) {
  const keys = packageKeysFromProducts(products);
  return keys[0] || DEFAULT_PACKAGE;
}

function getProductByPackageKey(products = [], packageKey = '') {
  return (Array.isArray(products) ? products : []).find(
    (row) => String(row.packageKey || '').trim() === String(packageKey || '').trim()
  );
}

function buildEmptyForm(packageKey = DEFAULT_PACKAGE) {
  return {
    packageKey,
    sessionStartDate: '',
    sessionEndDate: '',
    status: 'open',
    preBlockedDormBeds: '',
    nightsOverride: '',
    minParticipantsSnapshot: '',
    maxParticipantsSnapshot: '',
  };
}

function normalizeFormForSave(form = {}) {
  return {
    packageKey: String(form.packageKey || '').trim(),
    sessionStartDate: String(form.sessionStartDate || '').trim(),
    sessionEndDate: String(form.sessionEndDate || '').trim(),
    status: String(form.status || 'open').trim().toLowerCase(),
    preBlockedDormBeds: form.preBlockedDormBeds === '' ? '' : Number(form.preBlockedDormBeds || 0),
    nightsOverride: form.nightsOverride === '' ? '' : Math.max(1, Number(form.nightsOverride || 1)),
    minParticipantsSnapshot:
      form.minParticipantsSnapshot === '' ? '' : Math.max(1, Number(form.minParticipantsSnapshot || 1)),
    maxParticipantsSnapshot:
      form.maxParticipantsSnapshot === '' ? '' : Math.max(1, Number(form.maxParticipantsSnapshot || 1)),
  };
}

function mapSessionToForm(session = {}) {
  return {
    packageKey: session.packageKey || '',
    sessionStartDate: session.sessionStartDate || '',
    sessionEndDate: session.sessionEndDate || '',
    status: session.status || 'open',
    preBlockedDormBeds:
      session.preBlockedDormBeds == null || session.preBlockedDormBeds === '' ? '' : Number(session.preBlockedDormBeds),
    nightsOverride: session.nightsOverride == null || session.nightsOverride === '' ? '' : Number(session.nightsOverride),
    minParticipantsSnapshot:
      session.minParticipantsSnapshot == null || session.minParticipantsSnapshot === ''
        ? Number(session.minParticipants || 1)
        : Number(session.minParticipantsSnapshot),
    maxParticipantsSnapshot:
      session.maxParticipantsSnapshot == null || session.maxParticipantsSnapshot === ''
        ? Number(session.maxParticipants || 1)
        : Number(session.maxParticipantsSnapshot),
  };
}

function readContext() {
  const q = wixLocationFrontend.query || {};
  return {
    actorId: String(q.actorId || q.adminId || 'admin-dashboard').trim(),
  };
}

function uiError(message, fallback = 'Something went wrong. Please check the form and try again.') {
  const text = String(message || '').trim();
  return text || fallback;
}

function isHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_err) {
    return false;
  }
}

$w.onReady(() => {
  const ce = $w('#sessionManagerElement');
  if (!ce) {
    log('custom element not found', { expectedId: '#sessionManagerElement' });
    return;
  }

  const context = readContext();
  const optionsState = {
    packageProducts: [],
    sessions: [],
    bookings: [],
  };
  const state = {
    uiTab: 'sessions',
    filters: {
      packageKey: '',
      monthKey: '',
      status: '',
    },
    editorMode: 'create',
    selectedSessionId: '',
    bookingFilters: {
      packageKey: '',
      packageSessionId: '',
      status: '',
    },
    form: buildEmptyForm(DEFAULT_PACKAGE),
    overridePreview: null,
  };
  const errors = {
    global: '',
    form: '',
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
    errors.form = '';
  }

  function primeDefaultFormFromProducts() {
    if (!state.form.packageKey) {
      state.form.packageKey = getDefaultPackageKey(optionsState.packageProducts);
    }
  }

  function applyPackageDefaults(packageKey, currentForm = {}, options = {}) {
    const keepDates = options.keepDates !== false;
    const keepStatus = options.keepStatus !== false;
    const product = getProductByPackageKey(optionsState.packageProducts, packageKey);
    const nextPackageKey = String(packageKey || getDefaultPackageKey(optionsState.packageProducts)).trim();
    return {
      ...currentForm,
      packageKey: nextPackageKey,
      sessionStartDate: keepDates ? currentForm.sessionStartDate || '' : '',
      sessionEndDate: keepDates ? currentForm.sessionEndDate || '' : '',
      status: keepStatus ? currentForm.status || 'open' : 'open',
      preBlockedDormBeds:
        product && product.preBlockedDormBeds != null && product.preBlockedDormBeds !== ''
          ? Number(product.preBlockedDormBeds)
          : '',
      nightsOverride: '',
      minParticipantsSnapshot:
        product && product.minParticipants != null && product.minParticipants !== ''
          ? Number(product.minParticipants)
          : '',
      maxParticipantsSnapshot:
        product && product.maxParticipants != null && product.maxParticipants !== ''
          ? Number(product.maxParticipants)
          : '',
    };
  }

  function resetCreateForm(packageKey = '') {
    const nextPackageKey = String(packageKey || state.form.packageKey || getDefaultPackageKey(optionsState.packageProducts)).trim();
    state.editorMode = 'create';
    state.selectedSessionId = '';
    state.overridePreview = null;
    state.form = applyPackageDefaults(nextPackageKey, buildEmptyForm(nextPackageKey), {
      keepDates: true,
      keepStatus: false,
    });
  }

  function applySessionToEditor(sessionId) {
    const found = (optionsState.sessions || []).find((x) => String(x.sessionId || '') === String(sessionId || ''));
    if (!found) {
      errors.global = 'Selected session was not found in the current list.';
      return;
    }
    clearErrors();
    state.editorMode = 'edit';
    state.selectedSessionId = String(found.sessionId || '');
    state.form = mapSessionToForm(found);
    state.overridePreview = null;
    state.uiTab = 'form';
  }

  async function bootstrap() {
    log('bootstrap start');
    const res = await loadAdminSessionBootstrap();
    log('bootstrap response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load admin session data.');
      return;
    }
    optionsState.packageProducts = Array.isArray(res.packageProducts) ? res.packageProducts : [];
    optionsState.sessions = Array.isArray(res.sessions) ? res.sessions : [];
    primeDefaultFormFromProducts();
    if (state.editorMode === 'create') {
      resetCreateForm(state.form.packageKey);
    }
  }

  async function refreshSessions() {
    const payload = {
      packageKey: state.filters.packageKey || '',
      monthKey: state.filters.monthKey || '',
      status: state.filters.status || '',
      limit: 200,
    };
    log('refreshSessions payload', payload);
    const res = await listAdminPackageSessions(payload);
    log('refreshSessions response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to refresh sessions.');
      return;
    }
    optionsState.sessions = Array.isArray(res.sessions) ? res.sessions : [];
    if (state.selectedSessionId) {
      const stillThere = optionsState.sessions.some(
        (x) => String(x.sessionId || '') === String(state.selectedSessionId || '')
      );
      if (!stillThere) {
        resetCreateForm(getDefaultPackageKey(optionsState.packageProducts));
      }
    }
  }

  async function refreshBookings() {
    const payload = {
      packageKey: String(state.bookingFilters.packageKey || '').trim(),
      packageSessionId: String(state.bookingFilters.packageSessionId || '').trim(),
      status: String(state.bookingFilters.status || '').trim(),
      limit: 200,
    };
    log('refreshBookings payload', payload);
    const res = await listAdminPackageBookings(payload);
    log('refreshBookings response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load package bookings.');
      return;
    }
    optionsState.bookings = Array.isArray(res.bookings) ? res.bookings : [];
  }

  async function saveSession(detail = {}) {
    clearErrors();
    state.overridePreview = null;
    const normalizedForm = normalizeFormForSave(detail.form || state.form);
    state.form = {
      ...state.form,
      ...normalizedForm,
    };
    const mode = detail.mode === 'edit' ? 'edit' : state.editorMode;
    const actorId = context.actorId || 'admin-dashboard';
    log('saveSession requested', { mode, actorId, sessionId: state.selectedSessionId, form: normalizedForm });

    let result;
    if (mode === 'edit' && state.selectedSessionId) {
      result = await updateAdminPackageSession({
        actorId,
        sessionId: state.selectedSessionId,
        patch: normalizedForm,
      });
    } else {
      result = await createAdminPackageSession({
        actorId,
        session: normalizedForm,
      });
    }
    log('saveSession response', result);

    if (!result?.ok) {
      errors.form = uiError(result?.message, 'Failed to save session.');
      return;
    }

    await refreshSessions();
    const resolvedSessionId = String(result?.session?.sessionId || '');
    if (resolvedSessionId) applySessionToEditor(resolvedSessionId);
    state.uiTab = 'sessions';
  }

  async function previewOverride(detail = {}) {
    clearErrors();
    const form = normalizeFormForSave(detail.form || state.form);
    state.form = {
      ...state.form,
      ...form,
    };
    const payload = {
      sessionId: detail.sessionId || state.selectedSessionId || '',
      packageKey: detail.packageKey || form.packageKey || '',
      preBlockedDormBeds: detail.preBlockedDormBeds != null ? detail.preBlockedDormBeds : form.preBlockedDormBeds,
    };
    log('previewOverride payload', payload);
    const res = await previewAdminSessionOverride(payload);
    log('previewOverride response', res);
    if (!res?.ok) {
      errors.form = uiError(res?.message, 'Failed to preview override.');
      return;
    }
    state.overridePreview = res.preview || null;
  }

  async function initPage() {
    setLoading(true);
    clearErrors();
    syncAll();
    try {
      await bootstrap();
      await refreshSessions();
    } catch (error) {
      log('initPage error', error);
      errors.global = uiError(error?.message, 'Unexpected error during initialization.');
    } finally {
      primeDefaultFormFromProducts();
      syncAll();
      setLoading(false);
    }
  }

  ce.on('session-manager-init', async () => {
    log('event session-manager-init');
    await initPage();
  });

  ce.on('session-manager-refresh', async (event) => {
    const detail = event?.detail || {};
    const filters = detail.filters || {};
    state.filters = {
      packageKey: String(filters.packageKey || '').trim(),
      monthKey: String(filters.monthKey || '').trim(),
      status: String(filters.status || '').trim().toLowerCase(),
    };
    state.overridePreview = null;
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshSessions();
    } catch (error) {
      log('session-manager-refresh error', error);
      errors.global = uiError(error?.message, 'Failed to refresh sessions.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-new', () => {
    clearErrors();
    state.uiTab = 'form';
    resetCreateForm(state.form.packageKey || getDefaultPackageKey(optionsState.packageProducts));
    syncAll();
  });

  ce.on('session-manager-package-change', (event) => {
    const detail = event?.detail || {};
    const packageKey = String(detail.packageKey || '').trim();
    if (!packageKey) return;
    clearErrors();
    state.uiTab = 'form';
    state.form = applyPackageDefaults(packageKey, state.form, {
      keepDates: true,
      keepStatus: true,
    });
    syncAll();
  });

  ce.on('session-manager-edit', (event) => {
    clearErrors();
    const detail = event?.detail || {};
    const sessionId = String(detail.sessionId || '').trim();
    if (!sessionId) {
      errors.global = 'Session id is required for editing.';
      syncAll();
      return;
    }
    applySessionToEditor(sessionId);
    syncAll();
  });

  ce.on('session-manager-nav', async (event) => {
    const detail = event?.detail || {};
    const tab = String(detail.tab || '').trim().toLowerCase();
    state.uiTab = tab === 'form' || tab === 'bookings' ? tab : 'sessions';
    clearErrors();
    syncAll();
    if (state.uiTab === 'bookings' && (!Array.isArray(optionsState.bookings) || optionsState.bookings.length === 0)) {
      setLoading(true);
      try {
        await refreshBookings();
      } catch (error) {
        log('session-manager-nav bookings load error', error);
        errors.global = uiError(error?.message, 'Failed to load package bookings.');
      } finally {
        syncAll();
        setLoading(false);
      }
    }
  });

  ce.on('session-manager-open-bookings', async (event) => {
    const detail = event?.detail || {};
    state.uiTab = 'bookings';
    state.bookingFilters = {
      ...state.bookingFilters,
      packageSessionId: String(detail.sessionId || '').trim(),
      packageKey: String(detail.packageKey || '').trim(),
    };
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshBookings();
    } catch (error) {
      log('session-manager-open-bookings error', error);
      errors.global = uiError(error?.message, 'Failed to load package bookings.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-bookings-refresh', async (event) => {
    const detail = event?.detail || {};
    const filters = detail.filters || {};
    state.bookingFilters = {
      packageKey: String(filters.packageKey || '').trim(),
      packageSessionId: String(filters.packageSessionId || '').trim(),
      status: String(filters.status || '').trim(),
    };
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshBookings();
    } catch (error) {
      log('session-manager-bookings-refresh error', error);
      errors.global = uiError(error?.message, 'Failed to load package bookings.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-booking-action', async (event) => {
    const detail = event?.detail || {};
    const bookingId = String(detail.bookingId || '').trim();
    const action = String(detail.action || '').trim().toLowerCase();
    const paymentLink = String(detail.paymentLink || '').trim();
    const note = String(detail.note || '').trim();
    const refundCompleted = detail.refundCompleted === true;
    if (!bookingId || !action) return;
    if (action === 'send_payment_link') {
      if (!paymentLink) {
        errors.global = 'Please provide the payment link before sending.';
        syncAll();
        return;
      }
      if (!isHttpUrl(paymentLink)) {
        errors.global = 'Payment link must start with http:// or https://.';
        syncAll();
        return;
      }
    }

    clearErrors();
    syncAll();
    setLoading(true);
    try {
      let res = null;
      if (action === 'send_payment_link') {
        res = await markAdminPackageBookingPaymentLinkSent({
          actorId: context.actorId || 'admin-dashboard',
          bookingId,
          paymentLink,
          note,
        });
      } else if (action === 'mark_paid') {
        res = await setAdminPackageBookingStatus({
          actorId: context.actorId || 'admin-dashboard',
          bookingId,
          status: 'confirmed',
          note,
        });
      } else if (action === 'mark_unpaid') {
        res = await setAdminPackageBookingStatus({
          actorId: context.actorId || 'admin-dashboard',
          bookingId,
          status: 'awaiting_manual_payment',
          note,
        });
      } else if (action === 'cancel') {
        res = await setAdminPackageBookingStatus({
          actorId: context.actorId || 'admin-dashboard',
          bookingId,
          status: 'cancelled',
          note,
          refundCompleted,
        });
      }

      log('session-manager-booking-action response', { action, bookingId, res });
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to update booking.');
      } else {
        await refreshBookings();
      }
    } catch (error) {
      log('session-manager-booking-action error', { action, bookingId, error });
      errors.global = uiError(error?.message, 'Failed to update booking.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-delete-session', async (event) => {
    const detail = event?.detail || {};
    const sessionId = String(detail.sessionId || '').trim();
    if (!sessionId) return;
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await deleteAdminPackageSession({
        actorId: context.actorId || 'admin-dashboard',
        sessionId,
      });
      log('session-manager-delete-session response', { sessionId, res });
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to delete package session.');
      } else {
        await refreshSessions();
        await refreshBookings();
        if (String(state.selectedSessionId || '') === sessionId) {
          resetCreateForm(getDefaultPackageKey(optionsState.packageProducts));
          state.uiTab = 'sessions';
        }
      }
    } catch (error) {
      log('session-manager-delete-session error', { sessionId, error });
      errors.global = uiError(error?.message, 'Failed to delete package session.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-save', async (event) => {
    const detail = event?.detail || {};
    setLoading(true);
    try {
      await saveSession(detail);
    } catch (error) {
      log('session-manager-save error', error);
      errors.form = uiError(error?.message, 'Unexpected error during save.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-preview', async (event) => {
    const detail = event?.detail || {};
    setLoading(true);
    try {
      await previewOverride(detail);
    } catch (error) {
      log('session-manager-preview error', error);
      errors.form = uiError(error?.message, 'Unexpected error during preview.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('session-manager-status', async (event) => {
    const detail = event?.detail || {};
    const sessionId = String(detail.sessionId || '').trim();
    const status = String(detail.status || '').trim().toLowerCase();
    if (!sessionId || !status) return;
    clearErrors();
    setLoading(true);
    try {
      const res = await updateAdminPackageSession({
        actorId: context.actorId || 'admin-dashboard',
        sessionId,
        patch: { status },
      });
      log('session-manager-status response', res);
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to update session status.');
      } else {
        await refreshSessions();
        if (state.selectedSessionId && String(state.selectedSessionId) === sessionId) {
          applySessionToEditor(sessionId);
        }
      }
    } catch (error) {
      log('session-manager-status error', error);
      errors.global = uiError(error?.message, 'Unexpected error while changing status.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  initPage();
});
