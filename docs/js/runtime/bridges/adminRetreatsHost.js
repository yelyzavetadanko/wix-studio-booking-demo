import wixLocationFrontend from '../shims/wixLocationFrontend.js';
import {
  createAdminRetreatSession,
  deleteAdminRetreatSession,
  getAdminRetreatEnquiryDetails,
  listAdminRetreatEnquiries,
  listAdminRetreatSessions,
  loadAdminRetreatBootstrap,
  markAdminRetreatEnquiryPaymentLinkSent,
  setAdminRetreatEnquiryPaymentStatus,
  updateAdminRetreatSession,
} from '../api/adminRetreats.demo.js';
import { $w } from '../shims/wixPublic.js';

const LOG_PREFIX = '[admin-retreats.page]';

function log(message, payload) {
  console.log(`${LOG_PREFIX} ${message}`, payload || '');
}

function setJsonAttr(el, attr, value) {
  el.setAttribute(attr, JSON.stringify(value || {}));
}

function uiError(message, fallback = 'Something went wrong. Please try again.') {
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

function readContext() {
  const q = wixLocationFrontend.query || {};
  return {
    actorId: String(q.actorId || q.adminId || 'admin-dashboard').trim(),
  };
}

function getDefaultRetreatKey(products = []) {
  const first = (Array.isArray(products) ? products : []).find((row) => String(row.retreatKey || '').trim());
  return String(first?.retreatKey || '').trim();
}

function getRetreatProductByKey(products = [], retreatKey = '') {
  const target = String(retreatKey || '').trim().toLowerCase();
  return (Array.isArray(products) ? products : []).find(
    (row) => String(row.retreatKey || '').trim().toLowerCase() === target
  );
}

function buildEmptyForm(retreatKey = '') {
  return {
    retreatKey: String(retreatKey || '').trim(),
    sessionStartDate: '',
    sessionEndDate: '',
    status: 'open',
    minParticipantsSnapshot: '',
    maxParticipantsSnapshot: '',
    preBlockedDormBeds: '',
    blocksFullHouse: true,
  };
}

function applyRetreatDefaults(form = {}, products = []) {
  const retreatKey = String(form.retreatKey || '').trim();
  const product = getRetreatProductByKey(products, retreatKey);
  return {
    ...form,
    minParticipantsSnapshot:
      product && product.minParticipantsDefault != null ? Number(product.minParticipantsDefault) : '',
    maxParticipantsSnapshot:
      product && product.maxParticipantsDefault != null ? Number(product.maxParticipantsDefault) : '',
    preBlockedDormBeds:
      form.preBlockedDormBeds === '' || form.preBlockedDormBeds == null
        ? product && product.minParticipantsDefault != null
          ? Number(product.minParticipantsDefault)
          : ''
        : Number(form.preBlockedDormBeds),
  };
}

function normalizeFormForSave(form = {}) {
  return {
    retreatKey: String(form.retreatKey || '').trim().toLowerCase(),
    sessionStartDate: String(form.sessionStartDate || '').trim(),
    sessionEndDate: String(form.sessionEndDate || '').trim(),
    status: String(form.status || 'open').trim().toLowerCase(),
    minParticipantsSnapshot:
      form.minParticipantsSnapshot === '' ? '' : Math.max(1, Number(form.minParticipantsSnapshot || 1)),
    maxParticipantsSnapshot:
      form.maxParticipantsSnapshot === '' ? '' : Math.max(1, Number(form.maxParticipantsSnapshot || 1)),
    preBlockedDormBeds:
      form.preBlockedDormBeds === '' ? '' : Math.max(0, Number(form.preBlockedDormBeds || 0)),
    blocksFullHouse: form.blocksFullHouse !== false,
  };
}

function mapSessionToForm(session = {}) {
  const form = {
    retreatKey: String(session.retreatKey || '').trim(),
    sessionStartDate: String(session.sessionStartDate || '').trim(),
    sessionEndDate: String(session.sessionEndDate || '').trim(),
    status: String(session.status || 'open').trim(),
    minParticipantsSnapshot:
      session.minParticipants == null || session.minParticipants === '' ? '' : Number(session.minParticipants),
    maxParticipantsSnapshot:
      session.maxParticipants == null || session.maxParticipants === '' ? '' : Number(session.maxParticipants),
    preBlockedDormBeds:
      session.preBlockedDormBeds == null || session.preBlockedDormBeds === '' ? '' : Number(session.preBlockedDormBeds),
    blocksFullHouse: session.blocksFullHouse !== false,
  };
  return form;
}

function toDateKey(value = '') {
  const raw = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function todayDateKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function filterOutPastSessions(list = []) {
  const today = todayDateKey();
  return (Array.isArray(list) ? list : []).filter((row) => {
    const endDateKey = toDateKey(row?.sessionEndDate);
    if (!endDateKey) return true;
    return endDateKey >= today;
  });
}

$w.onReady(() => {
  const ce = $w('#retreatSessionManagerElement');
  if (!ce) {
    log('custom element not found', { expectedId: '#retreatSessionManagerElement' });
    return;
  }

  const context = readContext();
  const optionsState = {
    retreatProducts: [],
    sessions: [],
    enquiries: [],
  };
  const state = {
    uiTab: 'sessions',
    filters: {
      retreatKey: '',
      monthKey: '',
      status: '',
    },
    bookingFilters: {
      retreatKey: '',
      retreatSessionId: '',
      manualPaymentStatus: '',
      guestEmail: '',
    },
    editorMode: 'create',
    selectedSessionId: '',
    selectedEnquiryId: '',
    selectedEnquiry: null,
    form: buildEmptyForm(''),
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

  function resetCreateForm(retreatKey = '') {
    const nextRetreatKey = retreatKey || state.form.retreatKey || getDefaultRetreatKey(optionsState.retreatProducts);
    state.editorMode = 'create';
    state.selectedSessionId = '';
    state.form = applyRetreatDefaults(buildEmptyForm(nextRetreatKey), optionsState.retreatProducts);
  }

  function applySessionToEditor(sessionId) {
    const found = (optionsState.sessions || []).find((x) => String(x.sessionId || '') === String(sessionId || ''));
    if (!found) {
      errors.global = 'Selected session was not found in current list.';
      return;
    }
    clearErrors();
    state.editorMode = 'edit';
    state.selectedSessionId = String(found.sessionId || '');
    state.form = applyRetreatDefaults(mapSessionToForm(found), optionsState.retreatProducts);
    state.uiTab = 'form';
  }

  async function bootstrap() {
    const res = await loadAdminRetreatBootstrap();
    log('bootstrap response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load retreat admin data.');
      return;
    }
    optionsState.retreatProducts = Array.isArray(res.retreatProducts) ? res.retreatProducts : [];
    optionsState.sessions = filterOutPastSessions(res.sessions);
    optionsState.enquiries = Array.isArray(res.enquiries) ? res.enquiries : [];
    if (!state.form.retreatKey) {
      resetCreateForm(getDefaultRetreatKey(optionsState.retreatProducts));
    }
  }

  async function refreshSessions() {
    const payload = {
      retreatKey: String(state.filters.retreatKey || '').trim(),
      monthKey: String(state.filters.monthKey || '').trim(),
      status: String(state.filters.status || '').trim(),
      limit: 250,
    };
    const res = await listAdminRetreatSessions(payload);
    log('refreshSessions response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to refresh retreat sessions.');
      return;
    }
    optionsState.sessions = filterOutPastSessions(res.sessions);
    if (state.selectedSessionId) {
      const stillThere = optionsState.sessions.some((x) => String(x.sessionId || '') === String(state.selectedSessionId || ''));
      if (!stillThere) resetCreateForm(getDefaultRetreatKey(optionsState.retreatProducts));
    }
  }

  async function refreshEnquiries() {
    const payload = {
      retreatKey: String(state.bookingFilters.retreatKey || '').trim(),
      retreatSessionId: String(state.bookingFilters.retreatSessionId || '').trim(),
      manualPaymentStatus: String(state.bookingFilters.manualPaymentStatus || '').trim(),
      guestEmail: String(state.bookingFilters.guestEmail || '').trim(),
      limit: 250,
    };
    const res = await listAdminRetreatEnquiries(payload);
    log('refreshEnquiries response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load retreat enquiries.');
      return;
    }
    optionsState.enquiries = Array.isArray(res.enquiries) ? res.enquiries : [];
    if (state.selectedEnquiryId) {
      const found = optionsState.enquiries.find((x) => String(x.enquiryId || '') === String(state.selectedEnquiryId || ''));
      if (found) {
        state.selectedEnquiry = { ...(state.selectedEnquiry || {}), ...found };
      } else {
        state.selectedEnquiryId = '';
        state.selectedEnquiry = null;
      }
    }
  }

  async function loadEnquiryDetails(enquiryId) {
    const targetEnquiryId = String(enquiryId || state.selectedEnquiryId || '').trim();
    if (!targetEnquiryId) return;
    const res = await getAdminRetreatEnquiryDetails({ enquiryId: targetEnquiryId });
    log('getAdminRetreatEnquiryDetails response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to load enquiry details.');
      return;
    }
    state.selectedEnquiryId = targetEnquiryId;
    state.selectedEnquiry = res.enquiry || null;
  }

  async function saveSession(detail = {}) {
    clearErrors();
    const normalized = applyRetreatDefaults(
      normalizeFormForSave(detail.form || state.form),
      optionsState.retreatProducts
    );
    state.form = { ...state.form, ...normalized };
    const mode = detail.mode === 'edit' ? 'edit' : state.editorMode;
    let res = null;
    if (mode === 'edit' && state.selectedSessionId) {
      res = await updateAdminRetreatSession({
        actorId: context.actorId || 'admin-dashboard',
        sessionId: state.selectedSessionId,
        patch: normalized,
      });
    } else {
      res = await createAdminRetreatSession({
        actorId: context.actorId || 'admin-dashboard',
        session: normalized,
      });
    }
    log('saveSession response', res);
    if (!res?.ok) {
      errors.form = uiError(res?.message, 'Failed to save retreat session.');
      return;
    }
    await refreshSessions();
    if (res?.session?.sessionId) applySessionToEditor(res.session.sessionId);
    state.uiTab = 'sessions';
  }

  async function updateSessionStatus(detail = {}) {
    const sessionId = String(detail.sessionId || '').trim();
    const status = String(detail.status || '').trim();
    if (!sessionId || !status) return;
    clearErrors();
    const res = await updateAdminRetreatSession({
      actorId: context.actorId || 'admin-dashboard',
      sessionId,
      patch: { status },
    });
    log('updateSessionStatus response', res);
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to update retreat session status.');
      return;
    }
    await refreshSessions();
    if (String(state.selectedSessionId || '') === sessionId) applySessionToEditor(sessionId);
  }

  async function handleEnquiryAction(detail = {}) {
    const enquiryId = String(detail.enquiryId || '').trim();
    const action = String(detail.action || '').trim().toLowerCase();
    const paymentLink = String(detail.paymentLink || '').trim();
    const note = String(detail.note || '').trim();
    const refundCompleted = detail.refundCompleted === true;
    if (!enquiryId || !action) return;

    if (action === 'send_payment_link') {
      if (!paymentLink) {
        errors.global = 'Please provide payment link before sending.';
        return;
      }
      if (!isHttpUrl(paymentLink)) {
        errors.global = 'Payment link must start with http:// or https://.';
        return;
      }
    }

    let res = null;
    if (action === 'send_payment_link') {
      res = await markAdminRetreatEnquiryPaymentLinkSent({
        actorId: context.actorId || 'admin-dashboard',
        enquiryId,
        paymentLink,
        note,
      });
    } else if (action === 'mark_paid') {
      res = await setAdminRetreatEnquiryPaymentStatus({
        actorId: context.actorId || 'admin-dashboard',
        enquiryId,
        status: 'manually_paid',
        note,
      });
    } else if (action === 'mark_unpaid') {
      res = await setAdminRetreatEnquiryPaymentStatus({
        actorId: context.actorId || 'admin-dashboard',
        enquiryId,
        status: 'awaiting_manual_payment',
        note,
      });
    } else if (action === 'cancel') {
      res = await setAdminRetreatEnquiryPaymentStatus({
        actorId: context.actorId || 'admin-dashboard',
        enquiryId,
        status: 'cancelled',
        note,
        refundCompleted,
      });
    }
    log('handleEnquiryAction response', { enquiryId, action, res });
    if (!res?.ok) {
      errors.global = uiError(res?.message, 'Failed to process enquiry action.');
      return;
    }
    await refreshEnquiries();
    await loadEnquiryDetails(enquiryId);
  }

  async function initPage() {
    setLoading(true);
    clearErrors();
    syncAll();
    try {
      await bootstrap();
    } catch (error) {
      log('initPage error', error);
      errors.global = uiError(error?.message, 'Unexpected error during initialization.');
    } finally {
      syncAll();
      setLoading(false);
    }
  }

  ce.on('retreat-manager-init', async () => {
    await initPage();
  });

  ce.on('retreat-manager-nav', async (event) => {
    const tab = String(event?.detail?.tab || '').trim().toLowerCase();
    state.uiTab = tab === 'form' || tab === 'enquiries' ? tab : 'sessions';
    clearErrors();
    syncAll();
    if (state.uiTab === 'enquiries' && (!Array.isArray(optionsState.enquiries) || optionsState.enquiries.length === 0)) {
      setLoading(true);
      try {
        await refreshEnquiries();
      } catch (error) {
        errors.global = uiError(error?.message, 'Failed to load retreat enquiries.');
      } finally {
        syncAll();
        setLoading(false);
      }
    }
  });

  ce.on('retreat-manager-refresh', async (event) => {
    const filters = event?.detail?.filters || {};
    state.filters = {
      retreatKey: String(filters.retreatKey || '').trim(),
      monthKey: String(filters.monthKey || '').trim(),
      status: String(filters.status || '').trim().toLowerCase(),
    };
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshSessions();
    } catch (error) {
      errors.global = uiError(error?.message, 'Failed to refresh retreat sessions.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-new', () => {
    clearErrors();
    state.uiTab = 'form';
    resetCreateForm(state.form.retreatKey || getDefaultRetreatKey(optionsState.retreatProducts));
    syncAll();
  });

  ce.on('retreat-manager-retreat-change', (event) => {
    const retreatKey = String(event?.detail?.retreatKey || '').trim();
    state.form = applyRetreatDefaults(
      {
        ...state.form,
        retreatKey,
      },
      optionsState.retreatProducts
    );
    clearErrors();
    syncAll();
  });

  ce.on('retreat-manager-edit', (event) => {
    const sessionId = String(event?.detail?.sessionId || '').trim();
    if (!sessionId) return;
    applySessionToEditor(sessionId);
    syncAll();
  });

  ce.on('retreat-manager-save', async (event) => {
    const detail = event?.detail || {};
    setLoading(true);
    try {
      await saveSession(detail);
    } catch (error) {
      errors.form = uiError(error?.message, 'Unexpected error while saving retreat session.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-session-status', async (event) => {
    const detail = event?.detail || {};
    setLoading(true);
    clearErrors();
    try {
      await updateSessionStatus(detail);
    } catch (error) {
      errors.global = uiError(error?.message, 'Unexpected error while updating retreat session status.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-delete-session', async (event) => {
    const detail = event?.detail || {};
    const sessionId = String(detail.sessionId || '').trim();
    if (!sessionId) return;
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      const res = await deleteAdminRetreatSession({
        actorId: context.actorId || 'admin-dashboard',
        sessionId,
      });
      log('deleteAdminRetreatSession response', { sessionId, res });
      if (!res?.ok) {
        errors.global = uiError(res?.message, 'Failed to delete retreat session.');
      } else {
        await refreshSessions();
        await refreshEnquiries();
        if (String(state.selectedSessionId || '') === sessionId) {
          resetCreateForm(getDefaultRetreatKey(optionsState.retreatProducts));
          state.uiTab = 'sessions';
        }
      }
    } catch (error) {
      log('retreat-manager-delete-session error', error);
      errors.global = uiError(error?.message, 'Failed to delete retreat session.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-open-enquiries', async (event) => {
    const detail = event?.detail || {};
    state.uiTab = 'enquiries';
    state.bookingFilters = {
      ...state.bookingFilters,
      retreatKey: String(detail.retreatKey || '').trim(),
      retreatSessionId: String(detail.sessionId || '').trim(),
    };
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshEnquiries();
    } catch (error) {
      errors.global = uiError(error?.message, 'Failed to load retreat enquiries.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-enquiries-refresh', async (event) => {
    const filters = event?.detail?.filters || {};
    state.bookingFilters = {
      retreatKey: String(filters.retreatKey || '').trim(),
      retreatSessionId: String(filters.retreatSessionId || '').trim(),
      manualPaymentStatus: String(filters.manualPaymentStatus || '').trim(),
      guestEmail: String(filters.guestEmail || '').trim(),
    };
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await refreshEnquiries();
    } catch (error) {
      errors.global = uiError(error?.message, 'Failed to refresh retreat enquiries.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-enquiry-open', async (event) => {
    const enquiryId = String(event?.detail?.enquiryId || '').trim();
    if (!enquiryId) return;
    clearErrors();
    state.selectedEnquiryId = enquiryId;
    syncAll();
    setLoading(true);
    try {
      await loadEnquiryDetails(enquiryId);
    } catch (error) {
      errors.global = uiError(error?.message, 'Failed to load enquiry details.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  ce.on('retreat-manager-enquiry-action', async (event) => {
    const detail = event?.detail || {};
    clearErrors();
    syncAll();
    setLoading(true);
    try {
      await handleEnquiryAction(detail);
    } catch (error) {
      errors.global = uiError(error?.message, 'Failed to process enquiry action.');
    } finally {
      syncAll();
      setLoading(false);
    }
  });

  initPage();
});
