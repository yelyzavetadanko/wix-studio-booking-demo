const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display:block; font-family: Arial, sans-serif; color:#2f2a24; }
    .am-wrap { position:relative; border:1px solid #e6dfd2; border-radius:14px; background:#fff; padding:14px; }
    .am-head {
      display:grid;
      grid-template-columns: auto minmax(130px, 160px) auto minmax(150px, 190px) minmax(170px, 210px) auto;
      gap:10px;
      align-items:end;
      margin-bottom:12px;
      background:#fcfaf6;
      border:1px solid #efe8db;
      border-radius:12px;
      padding:10px;
    }
    .am-head label, .am-bulk label {
      display:flex;
      flex-direction:column;
      gap:5px;
      font-size:12px;
      color:#6d6459;
      font-weight:600;
    }
    .am-head input, .am-head select, .am-bulk input, .am-bulk select, .am-bulk textarea {
      border:1px solid #d8d2c7;
      border-radius:8px;
      padding:8px 10px;
      min-height:38px;
      font-size:13px;
      background:#fff;
      color:#2f2a24;
      box-sizing:border-box;
    }
    .am-bulk textarea { min-height:74px; resize:vertical; padding-top:10px; }
    .am-btn {
      border:1px solid #c8bfaf;
      border-radius:8px;
      padding:8px 12px;
      min-height:38px;
      background:#f5f2eb;
      cursor:pointer;
      font-size:13px;
      font-weight:600;
    }
    .am-btn.primary { background:#2f2a24; color:#fff; border-color:#2f2a24; }
    .am-btn.warn { background:#742f2f; color:#fff; border-color:#742f2f; }
    .am-btn:disabled { opacity:.6; cursor:not-allowed; }
    .am-meta { font-size:12px; color:#7d7468; margin:0 0 10px; line-height:1.45; }
    .am-error { color:#b42318; font-size:12px; margin:0 0 8px; }
    .am-table-wrap { overflow:auto; border:1px solid #ece6da; border-radius:12px; background:#fff; }
    table { border-collapse:collapse; min-width:980px; width:100%; }
    th, td { border-bottom:1px solid #f0ece4; border-right:1px solid #f7f3ed; padding:6px; text-align:center; vertical-align:top; }
    th:first-child, td:first-child { position:sticky; left:0; z-index:2; background:#fff; min-width:170px; text-align:left; }
    th:first-child { padding-left:14px; }
    td:first-child { padding-left:14px; vertical-align:middle; }
    th { font-size:12px; color:#665d51; background:#faf8f4; position:sticky; top:0; z-index:1; }
    .am-unit-label { font-size:12px; color:#2f2a24; font-weight:600; min-height:30px; display:flex; align-items:center; }
    .am-cell-btn {
      width:100%; border:1px solid transparent; border-radius:8px; padding:6px 4px; cursor:pointer; font-size:11px; line-height:1.25;
    }
    .am-cell-open { background:#e8f7ed; border-color:#b8e7c7; color:#1f5f35; }
    .am-cell-closed { background:#efe8e8; border-color:#d4c4c4; color:#6d3d3d; }
    .am-cell-hold { background:#fff7e6; border-color:#f3d08d; color:#8a5a00; }
    .am-cell-final { background:#fdecec; border-color:#f6c9c9; color:#8f2525; }
    .am-cell-reserve-package { background:#ededed; border-color:#d6d6d6; color:#4a4a4a; }
    .am-cell-reserve-retreat { background:#e3e3e3; border-color:#cccccc; color:#3f3f3f; }
    .am-cell-tight { box-shadow: inset 0 0 0 1px #e59f00; }
    .am-cell-overbook { box-shadow: inset 0 0 0 1px #b42318; }
    .am-bulk-title { font-size:13px; font-weight:700; color:#2f2a24; margin-bottom:10px; }
    .am-btn-nav { min-width:72px; }
    .am-empty { text-align:center; font-size:13px; color:#7d7468; padding:16px 8px; }
    .am-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(33, 27, 20, 0.45);
      z-index: 9998;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      box-sizing: border-box;
    }
    .am-modal {
      width: min(560px, 100%);
      max-height: calc(100vh - 24px);
      overflow: auto;
      background: #fff;
      border: 1px solid #e6dfd2;
      border-radius: 12px;
      padding: 14px;
      box-sizing: border-box;
    }
    .am-modal-title { margin: 0; font-size: 15px; font-weight: 700; color:#2f2a24; }
    .am-modal-section { margin-top: 12px; display:flex; flex-direction:column; gap:8px; }
    .am-modal-section.tight { gap:6px; }
    .am-modal-sub { margin: 0; font-size: 12px; color:#7d7468; }
    .am-modal-kv { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin: 0; }
    .am-modal-unit { font-size:14px; font-weight:700; color:#2f2a24; }
    .am-status-chip {
      display:inline-flex;
      align-items:center;
      border-radius:999px;
      padding:4px 10px;
      font-size:11px;
      font-weight:700;
      border:1px solid transparent;
    }
    .am-status-chip.open { background:#e8f7ed; border-color:#b8e7c7; color:#1f5f35; }
    .am-status-chip.closed { background:#fdecec; border-color:#f6c9c9; color:#8f2525; }
    .am-modal-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .am-modal-grid label { display:flex; flex-direction:column; gap:5px; font-size:12px; color:#6d6459; font-weight:600; }
    .am-modal-grid input, .am-modal-grid select, .am-modal-grid textarea {
      border:1px solid #d8d2c7;
      border-radius:8px;
      padding:8px 10px;
      min-height:38px;
      font-size:13px;
      background:#fff;
      color:#2f2a24;
      box-sizing:border-box;
    }
    .am-modal-grid textarea { min-height:72px; resize:vertical; }
    .am-modal-grid .am-invalid {
      border-color:#b42318 !important;
      box-shadow:0 0 0 2px rgba(180,35,24,.12);
      background:#fff8f7;
    }
    .am-validation-error {
      margin: 0 0 10px;
      font-size: 12px;
      color: #b42318;
      background: #fff2f0;
      border: 1px solid #f3c9c5;
      border-radius: 8px;
      padding: 8px 10px;
      line-height: 1.4;
    }
    .am-modal-grid .span-2 { grid-column: span 2; }
    .am-modal-actions { margin-top: 0; display:flex; flex-wrap: wrap; gap:8px; }
    .am-modal-actions .am-btn { min-width: 120px; }
    .am-helper {
      margin: 0 0 8px;
      font-size: 12px;
      color: #7a7165;
      line-height: 1.45;
      background: #faf7f1;
      border: 1px solid #efe8db;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .am-divider { border:0; border-top:1px solid #efe8db; margin:0; }
    .am-mini-title { margin:0; font-size:12px; color:#6d6459; font-weight:700; text-transform:uppercase; letter-spacing:.02em; }
    .am-booking-list { display:flex; flex-direction:column; gap:8px; margin-top:0; }
    .am-booking-item { border:1px solid #efe8db; border-radius:10px; padding:10px; background:#fcfaf6; }
    .am-booking-top { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:8px; }
    .am-flow-chip {
      display:inline-flex; align-items:center; border-radius:999px; padding:3px 9px; font-size:11px; font-weight:700;
      color:#4a3f32; background:#f4ebdb; border:1px solid #e6d5b4;
    }
    .am-status-chip.hold { background:#fff7e6; border-color:#f3d08d; color:#8a5a00; }
    .am-status-chip.final { background:#fdecec; border-color:#f6c9c9; color:#8f2525; }
    .am-status-chip.reserve { background:#ededed; border-color:#d6d6d6; color:#4a4a4a; }
    .am-booking-lines { font-size:12px; color:#5f564b; line-height:1.4; margin:0; }
    .am-check-line {
      display:flex;
      align-items:center;
      gap:8px;
      min-height:38px;
      font-size:12px;
      color:#5f564b;
      font-weight:600;
    }
    .am-check-line input { width:16px; height:16px; margin:0; }
    .loading-overlay {
      position:absolute;
      inset:0;
      z-index:20;
      display:flex;
      align-items:center;
      justify-content:center;
      background:rgba(255,255,255,.72);
      border-radius:14px;
      transition:opacity .16s ease;
    }
    .loading-overlay.hidden {
      opacity:0;
      pointer-events:none;
    }
    .loading-spinner {
      width:40px;
      height:40px;
      border-radius:50%;
      border:4px solid rgba(47,42,36,.18);
      border-top-color:#2f2a24;
      animation:am-spin .8s linear infinite;
    }
    @keyframes am-spin {
      to { transform: rotate(360deg); }
    }
    @media (max-width:1140px) {
      .am-head {
        grid-template-columns: auto minmax(120px, 1fr) auto minmax(130px, 1fr) minmax(140px, 1fr) auto;
      }
    }
    @media (max-width:900px) {
      .am-wrap { padding:10px; border-radius:12px; }
      .am-head {
        grid-template-columns: 1fr 1fr;
        gap:8px;
      }
      .am-head .am-head-span-2 { grid-column: span 2; }
      .am-meta { margin-top:2px; }
    }
    @media (max-width:620px) {
      .am-head { grid-template-columns: 1fr; }
      .am-head .am-head-span-2 { grid-column: span 1; }
      .am-head .am-head-nav { display:flex; gap:8px; }
      .am-modal-grid { grid-template-columns: 1fr; }
      .am-modal-grid .span-2 { grid-column: span 1; }
    }
  </style>
  <div class="am-wrap">
    <div id="root"></div>
  </div>
`;

function parseJsonAttr(el, attr, fallback = {}) {
  try {
    const raw = el.getAttribute(attr);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function toMonthKey(value = '') {
  const raw = String(value || '').trim();
  const m = /^(\d{4})-(\d{2})$/.exec(raw);
  if (m) return `${m[1]}-${m[2]}`;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(monthKey = '', delta = 0) {
  const [y, m] = toMonthKey(monthKey).split('-').map((x) => Number(x));
  const d = new Date(Date.UTC(y, (m || 1) - 1 + Number(delta || 0), 1, 12, 0, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatDayShort(dateKey = '') {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || '').trim());
  if (!m) return dateKey || '-';
  return `${m[3]}.${m[2]}`;
}

function isDateKey(value = '') {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function isDateKeyBefore(left = '', right = '') {
  const a = String(left || '').trim();
  const b = String(right || '').trim();
  if (!isDateKey(a) || !isDateKey(b)) return false;
  return a < b;
}

function beautifyUnitLabel(unitId = '', fallback = '') {
  const raw = String(unitId || '').trim().toLowerCase();
  const mDorm = /^dorm_bed_(\d+)$/.exec(raw);
  if (mDorm) return `Dorm №${mDorm[1]}`;
  const mSingle = /^single_room_(\d+)$/.exec(raw);
  if (mSingle) return `Single Room №${mSingle[1]}`;
  const mDouble = /^double_room_(\d+)$/.exec(raw);
  if (mDouble) return `Double Room №${mDouble[1]}`;
  const f = String(fallback || unitId || '').trim();
  return f.replace(/\b\w/g, (s) => s.toUpperCase());
}

class AvailabilityManagerElement extends HTMLElement {
  static get observedAttributes() {
    return ['state-json', 'options-json', 'errors-json', 'loading', 'context-json'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(TEMPLATE.content.cloneNode(true));
    this.state = {};
    this.options = {};
    this.errors = {};
    this.context = {};
    this.loading = false;
    this.flatpickrReady = false;
    this.flatpickrLoading = false;
    this.activeCell = null;
    this.onClick = this.onClick.bind(this);
    this.onChange = this.onChange.bind(this);
  }

  connectedCallback() {
    this.state = parseJsonAttr(this, 'state-json', {});
    this.options = parseJsonAttr(this, 'options-json', {});
    this.errors = parseJsonAttr(this, 'errors-json', {});
    this.context = parseJsonAttr(this, 'context-json', {});
    this.loading = this.getAttribute('loading') === 'true';
    this.render();
    this.initDatePicker();
    this.bindEvents();
    this.emit('availability-init', {});
  }

  attributeChangedCallback() {
    this.state = parseJsonAttr(this, 'state-json', {});
    this.options = parseJsonAttr(this, 'options-json', {});
    this.errors = parseJsonAttr(this, 'errors-json', {});
    this.context = parseJsonAttr(this, 'context-json', {});
    this.loading = this.getAttribute('loading') === 'true';
    this.render();
    this.initDatePicker();
    this.bindEvents();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail: detail || {}, bubbles: true, composed: true }));
  }

  bindEvents() {
    this.shadowRoot.removeEventListener('click', this.onClick);
    this.shadowRoot.removeEventListener('change', this.onChange);
    this.shadowRoot.addEventListener('click', this.onClick);
    this.shadowRoot.addEventListener('change', this.onChange);
  }

  async initDatePicker() {
    if (this.flatpickrReady || this.flatpickrLoading) {
      this.bindDatePickerInstances();
      return;
    }
    this.flatpickrLoading = true;
    try {
      if (!window.flatpickr) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/flatpickr');
      }
      if (!document.getElementById('availability-flatpickr-css')) {
        const link = document.createElement('link');
        link.id = 'availability-flatpickr-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('availability-flatpickr-theme-css')) {
        const themeLink = document.createElement('link');
        themeLink.id = 'availability-flatpickr-theme-css';
        themeLink.rel = 'stylesheet';
        themeLink.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
        document.head.appendChild(themeLink);
      }
      if (!document.getElementById('availability-flatpickr-month-css')) {
        const monthCss = document.createElement('link');
        monthCss.id = 'availability-flatpickr-month-css';
        monthCss.rel = 'stylesheet';
        monthCss.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/style.css';
        document.head.appendChild(monthCss);
      }
      if (window.flatpickr && !window.flatpickr?.l10ns?.default?.months && !window.monthSelectPlugin) {
        try {
          await this.loadScript('https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/index.js');
        } catch (_err) {
          // month plugin is optional fallback
        }
      } else if (!window.monthSelectPlugin) {
        try {
          await this.loadScript('https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/index.js');
        } catch (_err) {
          // optional
        }
      }
      this.flatpickrReady = typeof window.flatpickr === 'function';
      this.bindDatePickerInstances();
    } catch (_e) {
      this.flatpickrReady = false;
    } finally {
      this.flatpickrLoading = false;
    }
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  }

  bindDatePickerInstances() {
    if (!this.flatpickrReady) return;
    const dateInputs = [...this.shadowRoot.querySelectorAll('[data-date-picker]')];
    for (const node of dateInputs) {
      if (node._flatpickr) node._flatpickr.destroy();
      const minToday = String(node.getAttribute('data-min-today') || '').trim().toLowerCase() === 'true';
      window.flatpickr(node, {
        dateFormat: 'Y-m-d',
        allowInput: true,
        minDate: minToday ? 'today' : null,
      });
    }
    const startInput = this.shadowRoot.getElementById('cellStartDate');
    const endInput = this.shadowRoot.getElementById('cellEndDate');
    if (startInput && endInput) {
      const startValue = String(startInput.value || '').trim();
      if (isDateKey(startValue)) {
        if (endInput._flatpickr) endInput._flatpickr.set('minDate', startValue);
        endInput.setAttribute('min', startValue);
        if (isDateKeyBefore(String(endInput.value || '').trim(), startValue)) {
          endInput.value = startValue;
          if (endInput._flatpickr) endInput._flatpickr.setDate(startValue, true, 'Y-m-d');
        }
      }
    }
    const reserveStartInput = this.shadowRoot.getElementById('reserveReleaseStartDate');
    const reserveEndInput = this.shadowRoot.getElementById('reserveReleaseEndDate');
    if (reserveStartInput && reserveEndInput) {
      const startValue = String(reserveStartInput.value || '').trim();
      if (isDateKey(startValue)) {
        if (reserveEndInput._flatpickr) reserveEndInput._flatpickr.set('minDate', startValue);
        reserveEndInput.setAttribute('min', startValue);
        if (isDateKeyBefore(String(reserveEndInput.value || '').trim(), startValue)) {
          reserveEndInput.value = startValue;
          if (reserveEndInput._flatpickr) reserveEndInput._flatpickr.setDate(startValue, true, 'Y-m-d');
        }
      }
    }
    const monthInputs = [...this.shadowRoot.querySelectorAll('[data-month-picker]')];
    for (const node of monthInputs) {
      if (node._flatpickr) node._flatpickr.destroy();
      if (window.monthSelectPlugin) {
        window.flatpickr(node, {
          dateFormat: 'Y-m',
          altInput: true,
          altFormat: 'F Y',
          allowInput: true,
          plugins: [new window.monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m', altFormat: 'F Y' })],
        });
      } else {
        window.flatpickr(node, {
          dateFormat: 'Y-m',
          altInput: true,
          altFormat: 'F Y',
          allowInput: true,
        });
      }
    }
  }

  clearModalValidation() {
    if (!this.activeCell) return;
    this.activeCell.validation = { fields: {}, message: '' };
  }

  setModalValidation(fields = {}, message = 'Please fill all required fields.') {
    if (!this.activeCell) return;
    this.activeCell.validation = {
      fields: fields && typeof fields === 'object' ? fields : {},
      message: String(message || 'Please fill all required fields.').trim(),
    };
  }

  syncActiveCellDraftFromDom() {
    if (!this.activeCell) return;
    const startInput = this.shadowRoot.getElementById('cellStartDate');
    const endInput = this.shadowRoot.getElementById('cellEndDate');
    const sourceInput = this.shadowRoot.getElementById('cellSource');
    const noteInput = this.shadowRoot.getElementById('cellNote');
    const includeGuestDetailsInput = this.shadowRoot.getElementById('cellIncludeGuestDetails');
    const guestNameInput = this.shadowRoot.getElementById('cellGuestName');
    const guestPhoneInput = this.shadowRoot.getElementById('cellGuestPhone');
    const guestEmailInput = this.shadowRoot.getElementById('cellGuestEmail');
    const earlyBookingInput = this.shadowRoot.getElementById('earlyCheckoutBookingId');
    const earlyDateInput = this.shadowRoot.getElementById('earlyCheckoutDate');
    const earlyQtyInput = this.shadowRoot.getElementById('earlyCheckoutQuantity');
    const earlyNoteInput = this.shadowRoot.getElementById('earlyCheckoutNote');
    const reserveReleaseStartInput = this.shadowRoot.getElementById('reserveReleaseStartDate');
    const reserveReleaseEndInput = this.shadowRoot.getElementById('reserveReleaseEndDate');

    if (startInput) this.activeCell.startDateKey = String(startInput.value || '').trim();
    if (endInput) this.activeCell.endDateKey = String(endInput.value || '').trim();
    if (sourceInput) this.activeCell.source = String(sourceInput.value || '').trim().toLowerCase();
    if (noteInput) this.activeCell.note = String(noteInput.value || '').trim();
    if (includeGuestDetailsInput) this.activeCell.includeGuestDetails = includeGuestDetailsInput.checked === true;
    if (guestNameInput) this.activeCell.guestName = String(guestNameInput.value || '').trim();
    if (guestPhoneInput) this.activeCell.guestPhone = String(guestPhoneInput.value || '').trim();
    if (guestEmailInput) this.activeCell.guestEmail = String(guestEmailInput.value || '').trim();
    if (earlyBookingInput) this.activeCell.earlyCheckoutBookingId = String(earlyBookingInput.value || '').trim();
    if (earlyDateInput) this.activeCell.earlyCheckoutDateKey = String(earlyDateInput.value || '').trim();
    if (earlyQtyInput) this.activeCell.earlyCheckoutQuantity = Number(earlyQtyInput.value || 0);
    if (earlyNoteInput) this.activeCell.earlyCheckoutNote = String(earlyNoteInput.value || '').trim();
    if (reserveReleaseStartInput) this.activeCell.reserveReleaseStartDateKey = String(reserveReleaseStartInput.value || '').trim();
    if (reserveReleaseEndInput) this.activeCell.reserveReleaseEndDateKey = String(reserveReleaseEndInput.value || '').trim();
  }

  validateOpenCloseAction() {
    const fields = {};
    const cell = this.activeCell || {};
    const startDateKey = String(this.shadowRoot.getElementById('cellStartDate')?.value || cell.startDateKey || '').trim();
    const endDateKey = String(this.shadowRoot.getElementById('cellEndDate')?.value || cell.endDateKey || '').trim();
    const source = String(this.shadowRoot.getElementById('cellSource')?.value || cell.source || this.state.source || '')
      .trim()
      .toLowerCase();

    if (!startDateKey) fields.cellStartDate = true;
    if (!endDateKey) fields.cellEndDate = true;
    if (!source) fields.cellSource = true;
    if (startDateKey && !isDateKey(startDateKey)) fields.cellStartDate = true;
    if (endDateKey && !isDateKey(endDateKey)) fields.cellEndDate = true;
    if (isDateKey(startDateKey) && isDateKey(endDateKey) && isDateKeyBefore(endDateKey, startDateKey)) {
      fields.cellEndDate = true;
    }
    const hasErrors = Object.keys(fields).length > 0;
    if (!hasErrors) return { ok: true, fields };
    return {
      ok: false,
      fields,
      message: 'Required fields: Start date, End date and Source. End date cannot be earlier than Start date.',
    };
  }

  validateEarlyCheckoutAction() {
    const fields = {};
    const bookingId = String(this.shadowRoot.getElementById('earlyCheckoutBookingId')?.value || '').trim();
    const fromDateKey = String(this.shadowRoot.getElementById('earlyCheckoutDate')?.value || '').trim();
    const quantity = Number(this.shadowRoot.getElementById('earlyCheckoutQuantity')?.value || 0);
    if (!bookingId) fields.earlyCheckoutBookingId = true;
    if (!fromDateKey || !isDateKey(fromDateKey)) fields.earlyCheckoutDate = true;
    if (!(quantity > 0)) fields.earlyCheckoutQuantity = true;
    const hasErrors = Object.keys(fields).length > 0;
    if (!hasErrors) return { ok: true, fields };
    return {
      ok: false,
      fields,
      message: 'Required fields for early checkout: Booking, Release from date and Quantity.',
    };
  }

  validateReserveReleaseAction() {
    const fields = {};
    const cell = this.activeCell || {};
    const startDateKey = String(
      this.shadowRoot.getElementById('reserveReleaseStartDate')?.value || cell.reserveReleaseStartDateKey || cell.dateKey || ''
    ).trim();
    const endDateKey = String(
      this.shadowRoot.getElementById('reserveReleaseEndDate')?.value || cell.reserveReleaseEndDateKey || startDateKey
    ).trim();
    if (!startDateKey || !isDateKey(startDateKey)) fields.reserveReleaseStartDate = true;
    if (!endDateKey || !isDateKey(endDateKey)) fields.reserveReleaseEndDate = true;
    if (isDateKey(startDateKey) && isDateKey(endDateKey) && isDateKeyBefore(endDateKey, startDateKey)) {
      fields.reserveReleaseEndDate = true;
    }
    const hasErrors = Object.keys(fields).length > 0;
    if (!hasErrors) return { ok: true, fields, startDateKey, endDateKey };
    return {
      ok: false,
      fields,
      message: 'Choose valid reserve release dates. End date cannot be earlier than Start date.',
    };
  }

  getClosuresMap() {
    const list = Array.isArray(this.options.closures) ? this.options.closures : [];
    const map = {};
    for (const row of list) {
      const unitId = String(row?.unitId || '').trim();
      const dateKey = String(row?.dateKey || '').trim();
      if (!unitId || !dateKey) continue;
      map[`${unitId}__${dateKey}`] = row;
    }
    return map;
  }

  getUnitsFiltered() {
    const units = Array.isArray(this.options.units) ? this.options.units : [];
    const filter = String(this.state.roomTypeFilter || '').trim().toLowerCase();
    if (!filter) return units;
    return units.filter((row) => String(row.roomTypeKey || '').trim().toLowerCase() === filter);
  }

  getBookingContextsByTypeDate() {
    return this.options.bookingContextsByTypeDate && typeof this.options.bookingContextsByTypeDate === 'object'
      ? this.options.bookingContextsByTypeDate
      : {};
  }

  getCellBookingContexts(roomTypeKey = '', dateKey = '') {
    const map = this.getBookingContextsByTypeDate();
    const key = `${String(roomTypeKey || '').trim().toLowerCase()}__${String(dateKey || '').trim()}`;
    const list = Array.isArray(map[key]) ? map[key] : [];
    return list.map((row) => ({
      ...row,
      bookingId: String(row?.bookingId || '').trim(),
      bookingFlow: String(row?.bookingFlow || '').trim().toLowerCase(),
      bookingFlowLabel: String(row?.bookingFlowLabel || '').trim() || 'Booking',
      statusLabel: String(row?.statusLabel || '').trim() || 'Unknown',
      guestName: String(row?.guestName || '').trim(),
      guestPhone: String(row?.guestPhone || '').trim(),
      guestEmail: String(row?.guestEmail || '').trim(),
      effectiveQuantity: Math.max(0, Number(row?.effectiveQuantity || 0)),
      endDateKey: String(row?.endDateKey || '').trim(),
      isFinal: row?.isFinal === true,
      isSystemReserve: row?.isSystemReserve === true,
      reserveType: String(row?.reserveType || '').trim().toLowerCase(),
      reserveSessionId: String(row?.reserveSessionId || '').trim(),
      reserveSessionBusinessId: String(row?.reserveSessionBusinessId || '').trim(),
    }));
  }

  buildVisualOccupancyMap(days = [], units = [], closuresMap = {}, occupancy = {}, bookingContextsByTypeDate = {}) {
    const out = {};
    const unitsByType = {};
    for (const unit of units) {
      const roomTypeKey = String(unit.roomTypeKey || '').trim().toLowerCase();
      if (!roomTypeKey) continue;
      if (!Array.isArray(unitsByType[roomTypeKey])) unitsByType[roomTypeKey] = [];
      unitsByType[roomTypeKey].push(unit);
    }
    for (const roomTypeKey of Object.keys(unitsByType)) {
      for (const day of days) {
        const openUnits = unitsByType[roomTypeKey].filter((unit) => {
          const closure = closuresMap[`${unit.unitId}__${day}`];
          return !closure || closure.isOpen !== false;
        });
        const contexts = Array.isArray(bookingContextsByTypeDate[`${roomTypeKey}__${day}`])
          ? bookingContextsByTypeDate[`${roomTypeKey}__${day}`]
          : [];
        const finalQty = contexts.reduce(
          (acc, row) => acc + (row?.isFinal ? Math.max(0, Number(row?.effectiveQuantity || 0)) : 0),
          0
        );
        const bookedUsedRaw = Number(occupancy?.[roomTypeKey]?.[day]?.bookedUsedRaw || 0);
        const lockUsed = Number(occupancy?.[roomTypeKey]?.[day]?.lockUsed || 0);
        const packagePreblock = Number(occupancy?.[roomTypeKey]?.[day]?.packagePreblock || 0);
        const retreatPreblock = Number(occupancy?.[roomTypeKey]?.[day]?.retreatPreblock || 0);
        const packageBooked = Number(occupancy?.[roomTypeKey]?.[day]?.packageBooked || 0);
        const retreatBooked = Number(occupancy?.[roomTypeKey]?.[day]?.retreatBooked || 0);
        let reservePackageQty = roomTypeKey === 'dorm' ? Math.max(0, packagePreblock - packageBooked) : 0;
        let reserveRetreatQty = roomTypeKey === 'dorm' ? Math.max(0, retreatPreblock - retreatBooked) : 0;
        const holdFromBookings = Math.max(0, bookedUsedRaw - finalQty);
        let holdQty = Math.max(0, holdFromBookings + lockUsed);
        let finalLeft = Math.max(0, finalQty);
        for (const unit of openUnits) {
          const key = `${unit.unitId}__${day}`;
          const closure = closuresMap[key];
          const reserveReleased = closure?.reserveReleaseActive === true;
          if (finalLeft > 0) {
            out[key] = 'final';
            finalLeft -= 1;
          } else if (!reserveReleased && reservePackageQty > 0) {
            out[key] = 'reservePackage';
            reservePackageQty -= 1;
          } else if (!reserveReleased && reserveRetreatQty > 0) {
            out[key] = 'reserveRetreat';
            reserveRetreatQty -= 1;
          } else if (holdQty > 0) {
            out[key] = 'hold';
            holdQty -= 1;
          }
        }
      }
    }
    return out;
  }

  buildRefreshPayload(next = {}) {
    return {
      monthKey: toMonthKey(next.monthKey || this.state.monthKey || ''),
      roomTypeFilter: String(next.roomTypeFilter != null ? next.roomTypeFilter : this.state.roomTypeFilter || '')
        .trim()
        .toLowerCase(),
      source: String(next.source != null ? next.source : this.state.source || '').trim().toLowerCase(),
      note: String(next.note != null ? next.note : this.state.note || '').trim(),
    };
  }

  onChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.id === 'monthKey') {
      this.emit('availability-refresh', this.buildRefreshPayload({ monthKey: target.value || '' }));
      return;
    }
    if (target.id === 'roomTypeFilter') {
      this.emit('availability-refresh', this.buildRefreshPayload({ roomTypeFilter: target.value || '' }));
      return;
    }
    if (target.id === 'sourceKey') {
      this.state.source = String(target.value || '').trim().toLowerCase();
      return;
    }
    if (this.activeCell && target.id === 'cellSource') {
      this.clearModalValidation();
      this.activeCell.source = String(target.value || '').trim().toLowerCase();
      return;
    }
    if (this.activeCell && target.id === 'cellStartDate') {
      this.clearModalValidation();
      const nextStart = String(target.value || '').trim();
      const endInput = this.shadowRoot.getElementById('cellEndDate');
      if (endInput && isDateKey(nextStart)) {
        endInput.setAttribute('min', nextStart);
        if (endInput._flatpickr) endInput._flatpickr.set('minDate', nextStart);
        const currentEnd = String(endInput.value || '').trim();
        if (isDateKeyBefore(currentEnd, nextStart)) {
          endInput.value = nextStart;
          if (endInput._flatpickr) endInput._flatpickr.setDate(nextStart, true, 'Y-m-d');
        }
      }
      this.activeCell.startDateKey = nextStart;
      this.activeCell.endDateKey = String(endInput?.value || this.activeCell.endDateKey || nextStart).trim();
      return;
    }
    if (this.activeCell && target.id === 'cellEndDate') {
      this.clearModalValidation();
      const startInput = this.shadowRoot.getElementById('cellStartDate');
      const currentStart = String(startInput?.value || this.activeCell.startDateKey || '').trim();
      let nextEnd = String(target.value || '').trim();
      if (isDateKeyBefore(nextEnd, currentStart)) {
        nextEnd = currentStart;
        target.value = currentStart;
        if (target._flatpickr) target._flatpickr.setDate(currentStart, true, 'Y-m-d');
      }
      this.activeCell.endDateKey = nextEnd;
      return;
    }
    if (target.id === 'cellIncludeGuestDetails') {
      if (this.activeCell) {
        this.clearModalValidation();
        this.activeCell.includeGuestDetails = target.checked === true;
        if (!this.activeCell.includeGuestDetails) {
          this.activeCell.guestName = '';
          this.activeCell.guestPhone = '';
          this.activeCell.guestEmail = '';
        }
        this.render();
        this.bindEvents();
        this.bindDatePickerInstances();
      }
      return;
    }
    if (this.activeCell && target.id === 'earlyCheckoutBookingId') {
      this.clearModalValidation();
      this.activeCell.earlyCheckoutBookingId = String(target.value || '').trim();
      this.activeCell.earlyCheckoutQuantity = 1;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (this.activeCell && target.id === 'earlyCheckoutDate') {
      this.clearModalValidation();
      this.activeCell.earlyCheckoutDateKey = String(target.value || '').trim();
      return;
    }
    if (this.activeCell && target.id === 'earlyCheckoutQuantity') {
      this.clearModalValidation();
      this.activeCell.earlyCheckoutQuantity = Number(target.value || 0);
      return;
    }
  }

  onClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const clickEl = target.closest('button, [data-action]');
    if (!(clickEl instanceof HTMLElement)) return;

    if (clickEl.id === 'btnPrevMonth') {
      this.emit('availability-refresh', this.buildRefreshPayload({ monthKey: shiftMonth(this.state.monthKey, -1) }));
      return;
    }
    if (clickEl.id === 'btnNextMonth') {
      this.emit('availability-refresh', this.buildRefreshPayload({ monthKey: shiftMonth(this.state.monthKey, 1) }));
      return;
    }
    if (clickEl.id === 'btnRefresh') {
      this.emit('availability-refresh', this.buildRefreshPayload({}));
      return;
    }
    if (clickEl.classList.contains('am-cell-btn')) {
      const closuresMap = this.getClosuresMap();
      const unitId = String(clickEl.getAttribute('data-unit-id') || '').trim();
      const dateKey = String(clickEl.getAttribute('data-date-key') || '').trim();
      const roomTypeKey = String(clickEl.getAttribute('data-room-type') || '').trim().toLowerCase();
      const currentOpen = String(clickEl.getAttribute('data-is-open') || 'true') === 'true';
      const visualState = String(clickEl.getAttribute('data-visual-state') || '').trim();
      const existing = closuresMap[`${unitId}__${dateKey}`] || {};
      const bookingContexts = this.getCellBookingContexts(roomTypeKey, dateKey);
      const fallbackContact = bookingContexts.find(
        (row) => String(row.guestName || '').trim() || String(row.guestPhone || '').trim() || String(row.guestEmail || '').trim()
      ) || {};
      const guestName = String(existing.guestName || fallbackContact.guestName || '').trim();
      const guestPhone = String(existing.guestPhone || fallbackContact.guestPhone || '').trim();
      const guestEmail = String(existing.guestEmail || fallbackContact.guestEmail || '').trim();
      const includeGuestDetails = !!(guestName || guestPhone || guestEmail);
      if (!unitId || !dateKey) return;
      this.activeCell = {
        unitId,
        roomTypeKey,
        dateKey,
        startDateKey: dateKey,
        endDateKey: dateKey,
        currentOpen,
        source: String(existing.source || this.shadowRoot.getElementById('sourceKey')?.value || this.state.source || '')
          .trim()
          .toLowerCase(),
        note: String(existing.note || '').trim(),
        includeGuestDetails,
        guestName,
        guestPhone,
        guestEmail,
        bookingContexts,
        visualState,
        earlyCheckoutBookingId: String(bookingContexts[0]?.bookingId || '').trim(),
        earlyCheckoutQuantity: 1,
        earlyCheckoutDateKey: dateKey,
        earlyCheckoutNote: '',
        reserveReleaseStartDateKey: dateKey,
        reserveReleaseEndDateKey: dateKey,
      };
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (clickEl.id === 'btnModalCancel') {
      this.activeCell = null;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (String(clickEl.getAttribute('data-action') || '').trim().toLowerCase() === 'release-reserve-bed') {
      this.syncActiveCellDraftFromDom();
      const validation = this.validateReserveReleaseAction();
      if (!validation.ok) {
        this.setModalValidation(validation.fields, validation.message);
        this.render();
        this.bindEvents();
        this.bindDatePickerInstances();
        return;
      }
      const reserveType = String(clickEl.getAttribute('data-reserve-type') || '').trim().toLowerCase();
      const sessionId = String(clickEl.getAttribute('data-session-id') || '').trim();
      const unitId = String(this.activeCell?.unitId || '').trim();
      if (!reserveType || !sessionId || !unitId) return;
      this.clearModalValidation();
      this.emit('availability-release-reserve-bed', {
        reserveType,
        sessionId,
        unitId,
        startDateKey: validation.startDateKey,
        endDateKey: validation.endDateKey,
      });
      this.activeCell = null;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (String(clickEl.getAttribute('data-action') || '').trim().toLowerCase() === 'release-reserve-session') {
      const reserveType = String(clickEl.getAttribute('data-reserve-type') || '').trim().toLowerCase();
      const sessionId = String(clickEl.getAttribute('data-session-id') || '').trim();
      if (!reserveType || !sessionId) return;
      this.emit('availability-release-reserve', { reserveType, sessionId, quantity: 1 });
      this.activeCell = null;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (clickEl.id === 'btnModalOpen' || clickEl.id === 'btnModalClose') {
      this.syncActiveCellDraftFromDom();
      const validation = this.validateOpenCloseAction();
      if (!validation.ok) {
        this.setModalValidation(validation.fields, validation.message);
        this.render();
        this.bindEvents();
        this.bindDatePickerInstances();
        return;
      }
      const cell = this.activeCell || {};
      const unitId = String(cell.unitId || '').trim();
      const roomTypeKey = String(cell.roomTypeKey || '').trim().toLowerCase();
      const startDateKey = String(this.shadowRoot.getElementById('cellStartDate')?.value || cell.startDateKey || '').trim();
      let endDateKey = String(this.shadowRoot.getElementById('cellEndDate')?.value || cell.endDateKey || '').trim();
      const source = String(this.shadowRoot.getElementById('cellSource')?.value || cell.source || this.state.source || '')
        .trim()
        .toLowerCase();
      const includeGuestDetails = this.shadowRoot.getElementById('cellIncludeGuestDetails')?.checked === true;
      const note = String(this.shadowRoot.getElementById('cellNote')?.value || '').trim();
      const guestName = String(this.shadowRoot.getElementById('cellGuestName')?.value || '').trim();
      const guestPhone = String(this.shadowRoot.getElementById('cellGuestPhone')?.value || '').trim();
      const guestEmail = String(this.shadowRoot.getElementById('cellGuestEmail')?.value || '').trim();
      if (!unitId || !roomTypeKey || !startDateKey || !endDateKey) return;
      if (isDateKeyBefore(endDateKey, startDateKey)) {
        endDateKey = startDateKey;
      }
      if (!source) return;
      this.clearModalValidation();
      this.emit('availability-bulk-set', {
        roomTypeKey,
        startDateKey,
        endDateKey,
        isOpen: clickEl.id === 'btnModalOpen',
        source,
        note,
        includeGuestDetails,
        guestName,
        guestPhone,
        guestEmail,
        unitIds: [unitId],
      });
      this.activeCell = null;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
    if (clickEl.id === 'btnApplyEarlyCheckout') {
      this.syncActiveCellDraftFromDom();
      const validation = this.validateEarlyCheckoutAction();
      if (!validation.ok) {
        this.setModalValidation(validation.fields, validation.message);
        this.render();
        this.bindEvents();
        this.bindDatePickerInstances();
        return;
      }
      const cell = this.activeCell || {};
      const bookingId = String(this.shadowRoot.getElementById('earlyCheckoutBookingId')?.value || '').trim();
      const roomTypeKey = String(cell.roomTypeKey || '').trim().toLowerCase();
      const fromDateKey = String(
        this.shadowRoot.getElementById('earlyCheckoutDate')?.value || cell.earlyCheckoutDateKey || cell.dateKey || ''
      ).trim();
      const quantity = Number(this.shadowRoot.getElementById('earlyCheckoutQuantity')?.value || 0);
      const note = String(this.shadowRoot.getElementById('earlyCheckoutNote')?.value || '').trim();
      if (!bookingId || !roomTypeKey || !fromDateKey || quantity <= 0) return;
      this.clearModalValidation();
      this.emit('availability-early-checkout', {
        bookingId,
        roomTypeKey,
        fromDateKey,
        quantity,
        note,
      });
      this.activeCell = null;
      this.render();
      this.bindEvents();
      this.bindDatePickerInstances();
      return;
    }
  }

  render() {
    const root = this.shadowRoot.getElementById('root');
    if (!root) return;
    const days = Array.isArray(this.options.days) ? this.options.days : [];
    const units = this.getUnitsFiltered();
    const closuresMap = this.getClosuresMap();
    const occupancy = this.options.occupancyByTypeDate && typeof this.options.occupancyByTypeDate === 'object'
      ? this.options.occupancyByTypeDate
      : {};
    const bookingContextsByTypeDate = this.getBookingContextsByTypeDate();
    const globalError = String(this.errors.global || '').trim();
    const roomTypeFilter = String(this.state.roomTypeFilter || '').trim().toLowerCase();
    const source = String(this.state.source || '').trim().toLowerCase();
    const monthKey = toMonthKey(this.state.monthKey || '');
    const modal = this.activeCell || null;
    const visualOccupancyMap = this.buildVisualOccupancyMap(
      days,
      Array.isArray(this.options.units) ? this.options.units : [],
      closuresMap,
      occupancy,
      bookingContextsByTypeDate
    );

    const rowsHtml = units.map((unit) => {
      const unitId = String(unit.unitId || '').trim();
      const roomTypeKey = String(unit.roomTypeKey || '').trim().toLowerCase();
      const label = beautifyUnitLabel(unitId, unit.label || unitId);
      const cells = days.map((day) => {
        const closure = closuresMap[`${unitId}__${day}`];
        const isOpen = !closure || closure.isOpen !== false;
        const metrics = occupancy?.[roomTypeKey]?.[day] || {};
        const openUnits = Number(metrics.openUnits || 0);
        const bookedUsed = Number(metrics.bookedUsed || 0);
        const lockUsed = Number(metrics.lockUsed || 0);
        const available = Number(metrics.availableUnits || 0);
        const visualState = visualOccupancyMap[`${unitId}__${day}`] || '';
        const isTight = available <= 1 && isOpen;
        const isOverbook = available < 0 || openUnits < bookedUsed + lockUsed;
        const isHold = isOpen && visualState === 'hold';
        const isFinal = isOpen && visualState === 'final';
        const isReservePackage = isOpen && visualState === 'reservePackage';
        const isReserveRetreat = isOpen && visualState === 'reserveRetreat';
        const cls = [
          'am-cell-btn',
          isOpen
            ? isFinal
              ? 'am-cell-final'
              : isReservePackage
              ? 'am-cell-reserve-package'
              : isReserveRetreat
              ? 'am-cell-reserve-retreat'
              : isHold
              ? 'am-cell-hold'
              : 'am-cell-open'
            : 'am-cell-closed',
          isTight ? 'am-cell-tight' : '',
          isOverbook ? 'am-cell-overbook' : '',
        ].filter(Boolean).join(' ');
        const title = !isOpen
          ? 'Manual closed'
          : isFinal
            ? 'Paid / Confirmed booking'
            : isReservePackage
              ? 'Package reserve'
              : isReserveRetreat
                ? 'Retreat reserve'
            : isHold
              ? 'Hold / Awaiting payment'
              : 'Open';
        const labelText = !isOpen
          ? 'Closed'
          : isFinal
            ? 'Booked'
            : isReservePackage
              ? 'Package'
              : isReserveRetreat
                ? 'Retreat'
                : isHold
                  ? 'Hold'
                  : 'Open';
        return `<td>
          <button
            class="${cls}"
            data-unit-id="${unitId}"
            data-date-key="${day}"
            data-room-type="${roomTypeKey}"
            data-is-open="${isOpen ? 'true' : 'false'}"
            data-visual-state="${visualState}"
            ${this.loading ? 'disabled' : ''}
            title="${title}"
          >
            <span>${labelText}</span>
          </button>
        </td>`;
      }).join('');
      return `<tr>
        <td>
          <div class="am-unit-label">${label}</div>
        </td>
        ${cells}
      </tr>`;
    }).join('');

    const modalContexts = Array.isArray(modal?.bookingContexts) ? modal.bookingContexts : [];
    const modalValidationFields = modal?.validation?.fields && typeof modal.validation.fields === 'object'
      ? modal.validation.fields
      : {};
    const modalValidationMessage = String(modal?.validation?.message || '').trim();
    const selectedEarlyBookingId = String(modal?.earlyCheckoutBookingId || '').trim();
    const reserveContexts = modalContexts.filter((row) => row.isSystemReserve === true);
    const websiteBookingContexts = modalContexts.filter((row) => row.isSystemReserve !== true);
    const modalVisualState = String(modal?.visualState || '').trim();
    const isReserveFocusedModal = modalVisualState === 'reservePackage' || modalVisualState === 'reserveRetreat';
    const isHoldFocusedModal = modalVisualState === 'hold';
    const isBookedFocusedModal = modalVisualState === 'final';
    const isClosedFocusedModal = modal?.currentOpen === false;
    // Keep reserve-only view strictly tied to clicked reserve cells.
    // Open cells in the same date range must remain editable for manual operations.
    const isReserveOnlyModal = isReserveFocusedModal;
    const modalStatusClass = isClosedFocusedModal
      ? 'closed'
      : isBookedFocusedModal
      ? 'final'
      : isHoldFocusedModal
      ? 'hold'
      : isReserveFocusedModal
      ? 'reserve'
      : 'open';
    const modalStatusLabel = isClosedFocusedModal
      ? 'Closed'
      : isBookedFocusedModal
      ? 'Booked'
      : isHoldFocusedModal
      ? 'Hold'
      : isReserveFocusedModal
      ? 'Reserved'
      : 'Open';
    const hasRetreatReserve = reserveContexts.some((row) => row.reserveType === 'retreat');
    const hasPackageReserve = reserveContexts.some((row) => row.reserveType === 'package');
    const reserveScopeLabel =
      hasRetreatReserve && hasPackageReserve
        ? 'retreat/package session allocation'
        : hasRetreatReserve
        ? 'retreat session allocation'
        : hasPackageReserve
        ? 'package session allocation'
        : 'session allocation';
    const actionableBookingContexts = modalContexts.filter((row) => row.isSystemReserve !== true);
    const selectedEarlyBooking =
      actionableBookingContexts.find((row) => String(row.bookingId || '').trim() === selectedEarlyBookingId) || null;
    const maxEarlyQty = Math.max(0, Number(selectedEarlyBooking?.effectiveQuantity || 0));
    const primaryReserveContext = reserveContexts[0] || null;
    const reserveReleaseMinDate = String(primaryReserveContext?.startDateKey || modal?.dateKey || '').trim();
    const reserveReleaseMaxDate = String(primaryReserveContext?.endDateKey || reserveReleaseMinDate || '').trim();
    const reserveReleaseStartDate = String(
      modal?.reserveReleaseStartDateKey || reserveReleaseMinDate || modal?.dateKey || ''
    ).trim();
    const reserveReleaseEndDate = String(
      modal?.reserveReleaseEndDateKey || reserveReleaseStartDate || reserveReleaseMinDate || ''
    ).trim();
    const showReserveSection = reserveContexts.length > 0 && isReserveFocusedModal;
    const showBookingSection = websiteBookingContexts.length > 0 && (isHoldFocusedModal || isBookedFocusedModal);
    const showManualOpenClose = !isReserveOnlyModal && !isHoldFocusedModal && !isBookedFocusedModal;
    const showEarlyCheckout = actionableBookingContexts.length > 0 && (isHoldFocusedModal || isBookedFocusedModal);
    const reserveRowsHtml = reserveContexts
      .map((row) => {
        const reserveKindLabel = row.reserveType === 'retreat' ? 'Retreat session' : row.reserveType === 'package' ? 'Package session' : 'Session';
        return `<div class="am-booking-item">
          <div class="am-booking-top">
            <span class="am-flow-chip">${row.bookingFlowLabel}</span>
            <span class="am-status-chip reserve">Reserved</span>
          </div>
          <p class="am-booking-lines"><strong>${reserveKindLabel}</strong> · Reserved beds: ${row.effectiveQuantity}</p>
          <div class="am-modal-actions">
            <button
              class="am-btn primary"
              data-action="release-reserve-bed"
              data-reserve-type="${row.reserveType || ''}"
              data-session-id="${row.reserveSessionId || ''}"
              ${this.loading || !row.reserveType || !row.reserveSessionId ? 'disabled' : ''}
            >Release this bed (selected dates)</button>
            <button
              class="am-btn"
              data-action="release-reserve-session"
              data-reserve-type="${row.reserveType || ''}"
              data-session-id="${row.reserveSessionId || ''}"
              ${this.loading || !row.reserveType || !row.reserveSessionId ? 'disabled' : ''}
            >Release session reserve (-1)</button>
          </div>
        </div>`;
      })
      .join('');
    const websiteBookingRowsHtml = websiteBookingContexts
      .map((row) => {
        const guestLabel =
          String(row.guestName || '').trim() ||
          String(row.guestEmail || '').trim() ||
          String(row.guestPhone || '').trim() ||
          'Guest not specified';
        const contactLine = [row.guestPhone, row.guestEmail].filter(Boolean).join(' · ');
        const dateRange =
          row.startDateKey && row.endDateKey
            ? row.startDateKey === row.endDateKey
              ? row.startDateKey
              : `${row.startDateKey} -> ${row.endDateKey}`
            : '';
        const occupancyLine = `${row.isFinal ? 'Confirmed booking' : 'Temporary hold'} · Beds: ${row.effectiveQuantity}`;
        return `<div class="am-booking-item">
          <div class="am-booking-top">
            <span class="am-flow-chip">${row.bookingFlowLabel}</span>
            <span class="am-status-chip ${row.isFinal ? 'final' : 'hold'}">${row.statusLabel}</span>
          </div>
          <p class="am-booking-lines"><strong>${guestLabel}</strong></p>
          <p class="am-booking-lines">${occupancyLine}</p>
          ${dateRange ? `<p class="am-booking-lines">Dates: ${dateRange}</p>` : ''}
          ${contactLine ? `<p class="am-booking-lines">${contactLine}</p>` : ''}
        </div>`;
      })
      .join('');

    root.innerHTML = `
      <div class="am-head">
        <button id="btnPrevMonth" class="am-btn am-btn-nav" ${this.loading ? 'disabled' : ''}>Prev</button>
        <label>Month
          <input id="monthKey" data-month-picker type="text" placeholder="Select month" value="${monthKey}" ${this.loading ? 'disabled' : ''} />
        </label>
        <button id="btnNextMonth" class="am-btn am-btn-nav" ${this.loading ? 'disabled' : ''}>Next</button>
        <label>Room type filter
          <select id="roomTypeFilter" ${this.loading ? 'disabled' : ''}>
            <option value="" ${roomTypeFilter ? '' : 'selected'}>All</option>
            <option value="dorm" ${roomTypeFilter === 'dorm' ? 'selected' : ''}>Dorm beds</option>
            <option value="single" ${roomTypeFilter === 'single' ? 'selected' : ''}>Single rooms</option>
            <option value="double" ${roomTypeFilter === 'double' ? 'selected' : ''}>Double rooms</option>
          </select>
        </label>
        <label>Default source
          <select id="sourceKey" ${this.loading ? 'disabled' : ''}>
            <option value="" ${source ? '' : 'selected'} disabled hidden>Select source</option>
            <option value="booking_com" ${source === 'booking_com' ? 'selected' : ''}>Booking.com</option>
            <option value="expedia" ${source === 'expedia' ? 'selected' : ''}>Expedia</option>
            <option value="airbnb" ${source === 'airbnb' ? 'selected' : ''}>Airbnb</option>
            <option value="hostelworld" ${source === 'hostelworld' ? 'selected' : ''}>Hostelworld</option>
            <option value="instagram" ${source === 'instagram' ? 'selected' : ''}>Instagram</option>
            <option value="other" ${source === 'other' ? 'selected' : ''}>Other</option>
          </select>
        </label>
        <button id="btnRefresh" class="am-btn primary" ${this.loading ? 'disabled' : ''}>Refresh</button>
      </div>
      <p class="am-meta">Click a cell to open unit controls for that bed/room and chosen date or date range.</p>
      ${globalError ? `<p class="am-error">${globalError}</p>` : ''}
      <div class="am-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              ${days.map((day) => `<th>${formatDayShort(day)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="${Math.max(2, days.length + 1)}">No units available for current filter.</td></tr>`}
          </tbody>
        </table>
      </div>
      ${
        modal
          ? `<div class="am-modal-backdrop">
              <div class="am-modal">
                <h4 class="am-modal-title">${isReserveOnlyModal ? 'Manage reserve allocation' : 'Manage unit availability'}</h4>
                ${modalValidationMessage ? `<p class="am-validation-error">${modalValidationMessage}</p>` : ''}
                <div class="am-modal-section tight">
                  <div class="am-modal-kv">
                    <span class="am-modal-unit">${beautifyUnitLabel(modal.unitId, modal.unitId)}</span>
                    <span class="am-status-chip ${modalStatusClass}">${modalStatusLabel}</span>
                  </div>
                  <p class="am-modal-sub">Room type: <strong>${modal.roomTypeKey}</strong></p>
                </div>
                ${
                  showReserveSection
                    ? `<div class="am-modal-section">
                       <h5 class="am-mini-title">System reserve context</h5>
                       <p class="am-helper">${
                         isReserveOnlyModal
                          ? `This bed is reserved by ${reserveScopeLabel}. Default action releases only the selected date range for this specific bed. Session release is optional and decreases the whole session reserve by 1 bed.`
                           : 'These reserves are session-level allocation (Package/Retreat). Status is shown as Reserved.'
                       }</p>
                       ${
                         isReserveOnlyModal
                           ? `<div class="am-modal-grid">
                                <label>Release from date (required)
                                  <input
                                    id="reserveReleaseStartDate"
                                    class="${modalValidationFields.reserveReleaseStartDate ? 'am-invalid' : ''}"
                                    data-date-picker
                                    type="text"
                                    placeholder="YYYY-MM-DD"
                                    min="${reserveReleaseMinDate || ''}"
                                    max="${reserveReleaseMaxDate || ''}"
                                    value="${reserveReleaseStartDate}"
                                  />
                                </label>
                                <label>Release to date (required)
                                  <input
                                    id="reserveReleaseEndDate"
                                    class="${modalValidationFields.reserveReleaseEndDate ? 'am-invalid' : ''}"
                                    data-date-picker
                                    type="text"
                                    placeholder="YYYY-MM-DD"
                                    min="${reserveReleaseStartDate || reserveReleaseMinDate || ''}"
                                    max="${reserveReleaseMaxDate || ''}"
                                    value="${reserveReleaseEndDate}"
                                  />
                                </label>
                              </div>
                              <p class="am-helper">Select one day or a range. Allowed range is limited to session dates (${reserveReleaseMinDate || '-'} to ${reserveReleaseMaxDate || '-'}).</p>`
                           : ''
                       }
                       <div class="am-booking-list">${reserveRowsHtml}</div>
                       ${isReserveOnlyModal ? '' : '<hr class="am-divider" />'}
                      </div>`
                    : ''
                }
                ${
                  showBookingSection
                    ? `<div class="am-modal-section">
                       <h5 class="am-mini-title">Booking occupancy context</h5>
                       <p class="am-helper">Current occupancy details for this selected status (temporary hold or confirmed booking).</p>
                       <div class="am-booking-list">${websiteBookingRowsHtml}</div>
                       <hr class="am-divider" />
                      </div>`
                    : ''
                }
                ${
                  !showManualOpenClose
                    ? ''
                    : `<div class="am-modal-section">
                       <div class="am-modal-grid">
                  <label>Start date (required)
                    <input id="cellStartDate" class="${modalValidationFields.cellStartDate ? 'am-invalid' : ''}" data-date-picker data-min-today="true" type="text" placeholder="YYYY-MM-DD" value="${modal.startDateKey || modal.dateKey || ''}" />
                  </label>
                  <label>End date (required)
                    <input id="cellEndDate" class="${modalValidationFields.cellEndDate ? 'am-invalid' : ''}" data-date-picker data-min-today="true" min="${modal.startDateKey || modal.dateKey || ''}" type="text" placeholder="YYYY-MM-DD" value="${modal.endDateKey || modal.dateKey || ''}" />
                  </label>
                  <label>Source (required)
                    <select id="cellSource" class="${modalValidationFields.cellSource ? 'am-invalid' : ''}">
                      <option value="" ${modal.source ? '' : 'selected'} disabled hidden>Select source</option>
                      <option value="booking_com" ${modal.source === 'booking_com' ? 'selected' : ''}>Booking.com</option>
                      <option value="expedia" ${modal.source === 'expedia' ? 'selected' : ''}>Expedia</option>
                      <option value="airbnb" ${modal.source === 'airbnb' ? 'selected' : ''}>Airbnb</option>
                      <option value="hostelworld" ${modal.source === 'hostelworld' ? 'selected' : ''}>Hostelworld</option>
                      <option value="instagram" ${modal.source === 'instagram' ? 'selected' : ''}>Instagram</option>
                      <option value="other" ${modal.source === 'other' ? 'selected' : ''}>Other</option>
                    </select>
                  </label>
                  <label class="span-2">
                    <span class="am-check-line">
                      <input id="cellIncludeGuestDetails" type="checkbox" ${modal.includeGuestDetails ? 'checked' : ''} />
                      Include guest details
                    </span>
                  </label>
                  ${
                    modal.includeGuestDetails
                      ? `<label>Guest name
                          <input id="cellGuestName" type="text" placeholder="Full name" value="${modal.guestName || ''}" />
                        </label>
                        <label>Guest phone
                          <input id="cellGuestPhone" type="text" placeholder="+212..." value="${modal.guestPhone || ''}" />
                        </label>
                        <label class="span-2">Guest email
                          <input id="cellGuestEmail" type="email" placeholder="guest@email.com" value="${modal.guestEmail || ''}" />
                        </label>`
                      : ''
                  }
                  <label class="span-2">Note
                    <textarea id="cellNote" placeholder="Optional note for this unit/date range...">${modal.note || ''}</textarea>
                  </label>
                </div>
                <p class="am-helper">To apply Open/Close, fill all required fields above: Start date, End date, and Source.</p>
                      </div>`
                }
                ${
                  showEarlyCheckout
                    ? `<div class="am-modal-section">
                       <hr class="am-divider" />
                       <h5 class="am-mini-title">Early checkout / release occupancy</h5>
                       <p class="am-helper">Select booking, release date and quantity. The system will free occupancy from that date until booking end date.</p>
                       <div class="am-modal-grid">
                         <label class="span-2">Booking (required)
                           <select id="earlyCheckoutBookingId" class="${modalValidationFields.earlyCheckoutBookingId ? 'am-invalid' : ''}">
                             <option value="" disabled hidden ${selectedEarlyBookingId ? '' : 'selected'}>Select booking</option>
                             ${actionableBookingContexts
                               .map((row, idx) => {
                                 const guestLabel =
                                   String(row.guestName || '').trim() ||
                                   String(row.guestEmail || '').trim() ||
                                   String(row.guestPhone || '').trim() ||
                                   `Booking ${idx + 1}`;
                                 return (
                                   `<option value="${row.bookingId}" ${
                                     selectedEarlyBookingId === row.bookingId ? 'selected' : ''
                                   }>${row.bookingFlowLabel} · ${guestLabel} · Beds ${row.effectiveQuantity}</option>`
                                 );
                               })
                               .join('')}
                           </select>
                         </label>
                         <label>Release from date (required)
                           <input id="earlyCheckoutDate" class="${modalValidationFields.earlyCheckoutDate ? 'am-invalid' : ''}" data-date-picker type="text" placeholder="YYYY-MM-DD" value="${
                             modal.earlyCheckoutDateKey || modal.dateKey || ''
                           }" />
                         </label>
                         <label>Quantity to release (required)
                           <input id="earlyCheckoutQuantity" class="${modalValidationFields.earlyCheckoutQuantity ? 'am-invalid' : ''}" type="number" min="1" max="${maxEarlyQty || 1}" value="${
                             modal.earlyCheckoutQuantity || 1
                           }" />
                         </label>
                         <label class="span-2">Admin note
                           <textarea id="earlyCheckoutNote" placeholder="Reason for early checkout / release...">${
                             modal.earlyCheckoutNote || ''
                           }</textarea>
                         </label>
                       </div>
                       <div class="am-modal-actions">
                         <button id="btnApplyEarlyCheckout" class="am-btn" ${
                           this.loading || !selectedEarlyBookingId ? 'disabled' : ''
                         }>Apply early checkout</button>
                       </div>
                      </div>`
                    : ''
                }
                <div class="am-modal-section">
                <div class="am-modal-actions">
                  ${
                    !showManualOpenClose
                      ? ''
                      : `<p class="am-helper">Manual Open/Close below is for external channel management and operational overrides, not for editing booking records.</p>
                         <button id="btnModalOpen" class="am-btn primary" ${this.loading ? 'disabled' : ''}>Set Open</button>
                         <button id="btnModalClose" class="am-btn warn" ${this.loading ? 'disabled' : ''}>Set Closed</button>`
                  }
                  <button id="btnModalCancel" class="am-btn" ${this.loading ? 'disabled' : ''}>Cancel</button>
                </div>
                </div>
              </div>
            </div>`
          : ''
      }
      <div class="loading-overlay ${this.loading ? '' : 'hidden'}">
        <div class="loading-spinner" aria-label="Loading"></div>
      </div>
    `;
  }
}

customElements.define('availability-manager-element', AvailabilityManagerElement);

