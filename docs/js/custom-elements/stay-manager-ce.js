class StayManagerElement extends HTMLElement {
  static get observedAttributes() {
    return ['context-json', 'state-json', 'options-json', 'errors-json', 'loading'];
  }

  constructor() {
    super();
    this.ctx = {};
    this.state = {};
    this.options = {};
    this.errors = {};
    this.loading = false;
    this.expanded = new Set();
    this.flatpickrReady = false;
    this.flatpickrLoading = false;
    this.createdRangeValidation = { fields: {}, message: '' };
  }

  connectedCallback() {
    this.hydrateFromAttributes();
    this.render();
    this.initDatePicker();
    this.emit('stay-manager-init', {});
  }

  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === 'loading') {
      const v = String(newValue || '').toLowerCase();
      this.loading = v === 'true' || v === '1';
      this.render();
      this.initDatePicker();
      return;
    }
    if (name === 'context-json') this.ctx = this.parseJson(newValue);
    if (name === 'state-json') this.state = this.parseJson(newValue);
    if (name === 'options-json') this.options = this.parseJson(newValue);
    if (name === 'errors-json') this.errors = this.parseJson(newValue);
    this.render();
    this.initDatePicker();
  }

  hydrateFromAttributes() {
    this.ctx = this.parseJson(this.getAttribute('context-json'));
    this.state = this.parseJson(this.getAttribute('state-json'));
    this.options = this.parseJson(this.getAttribute('options-json'));
    this.errors = this.parseJson(this.getAttribute('errors-json'));
    const loadingAttr = String(this.getAttribute('loading') || '').toLowerCase();
    this.loading = loadingAttr === 'true' || loadingAttr === '1';
  }

  parseJson(raw) {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return {};
    }
  }

  emit(type, payload) {
    this.dispatchEvent(
      new CustomEvent(type, {
        detail: payload || {},
        bubbles: true,
        composed: true,
      })
    );
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
      if (!document.getElementById('stay-manager-flatpickr-css')) {
        const link = document.createElement('link');
        link.id = 'stay-manager-flatpickr-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('stay-manager-flatpickr-theme-css')) {
        const themeLink = document.createElement('link');
        themeLink.id = 'stay-manager-flatpickr-theme-css';
        themeLink.rel = 'stylesheet';
        themeLink.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
        document.head.appendChild(themeLink);
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
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  bindDatePickerInstances() {
    if (!this.flatpickrReady) return;
    const dateTimeInputs = [...this.querySelectorAll('[data-datetime-picker]')];
    for (const node of dateTimeInputs) {
      if (!node || node.dataset.fpReady === '1') continue;
      const initial = node.value || '';
      window.flatpickr(node, {
        disableMobile: true,
        enableTime: true,
        time_24hr: true,
        minuteIncrement: 5,
        dateFormat: 'Y-m-d\\TH:i',
        altInput: true,
        altFormat: 'F j, Y H:i',
        allowInput: true,
        defaultDate: initial || null,
        onChange: (_selectedDates, dateStr) => {
          node.value = dateStr || '';
          this.syncCreatedRangePickerBounds();
          this.clearCreatedRangeValidation();
        },
      });
      node.dataset.fpReady = '1';
    }
    this.syncCreatedRangePickerBounds();
  }

  parseDateTimeInput(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return null;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  }

  clearCreatedRangeValidation() {
    this.createdRangeValidation = { fields: {}, message: '' };
  }

  setCreatedRangeValidation(fields = {}, message = '') {
    this.createdRangeValidation = {
      fields: fields && typeof fields === 'object' ? fields : {},
      message: String(message || '').trim(),
    };
  }

  validateCreatedRange({ strictToLater = true } = {}) {
    const createdFrom = String(this.querySelector('[data-filter="createdFrom"]')?.value || '').trim();
    const createdTo = String(this.querySelector('[data-filter="createdTo"]')?.value || '').trim();
    const fromDate = this.parseDateTimeInput(createdFrom);
    const toDate = this.parseDateTimeInput(createdTo);
    const fields = {};
    if (createdFrom && !fromDate) fields.createdFrom = true;
    if (createdTo && !toDate) fields.createdTo = true;
    if (fromDate && toDate) {
      const isInvalid = strictToLater ? toDate <= fromDate : toDate < fromDate;
      if (isInvalid) fields.createdTo = true;
    }
    const hasErrors = Object.keys(fields).length > 0;
    if (!hasErrors) {
      this.clearCreatedRangeValidation();
      return { ok: true };
    }
    this.setCreatedRangeValidation(
      fields,
      'Created to must be later than Created from. Please adjust the date range.'
    );
    return { ok: false };
  }

  syncCreatedRangePickerBounds() {
    const fromInput = this.querySelector('[data-filter="createdFrom"]');
    const toInput = this.querySelector('[data-filter="createdTo"]');
    if (!fromInput || !toInput) return;
    const fromDate = this.parseDateTimeInput(String(fromInput.value || '').trim());
    const toDate = this.parseDateTimeInput(String(toInput.value || '').trim());
    if (toInput._flatpickr) toInput._flatpickr.set('minDate', fromDate || null);
    if (fromInput._flatpickr) fromInput._flatpickr.set('maxDate', toDate || null);
  }

  currentTab() {
    const tab = String(this.state?.uiTab || 'bnb').trim();
    if (tab === 'surf_stay' || tab === 'enquiries' || tab === 'bnb') return tab;
    return 'bnb';
  }

  currentFilters() {
    const tab = this.currentTab();
    const all = this.state?.filters || {};
    const filters = all[tab] || {};
    return {
      status: String(filters.status || '').trim(),
      guestEmail: String(filters.guestEmail || '').trim(),
      manualPaymentStatus: String(filters.manualPaymentStatus || '').trim(),
      enquiryType: String(filters.enquiryType || '').trim(),
      createdFrom: String(filters.createdFrom || '').trim(),
      createdTo: String(filters.createdTo || '').trim(),
    };
  }

  statusOptions() {
    return [
      { value: '', label: 'All statuses' },
      { value: 'pending_admin_review', label: 'Pending admin review' },
      { value: 'awaiting_manual_payment', label: 'Awaiting manual payment' },
      { value: 'manually_paid', label: 'Manually paid' },
      { value: 'confirmed', label: 'Confirmed' },
      { value: 'cancelled', label: 'Cancelled' },
    ];
  }

  enquiryPaymentStatusOptions() {
    return [
      { value: '', label: 'All payment statuses' },
      { value: 'awaiting_manual_payment', label: 'Awaiting manual payment' },
      { value: 'manually_paid', label: 'Manually paid' },
      { value: 'cancelled', label: 'Cancelled' },
    ];
  }

  /** Canonical enquiryType values used in Enquiries / booking checkout (see backend/bookingCheckout.web.js). */
  enquiryTypeOptions() {
    return [
      { value: '', label: 'All enquiry types' },
      { value: 'surf_activity', label: 'Surf activity' },
      { value: 'activity_enquiry', label: 'Activity enquiry' },
      { value: 'custom_package', label: 'Custom package' },
      { value: 'custom_retreat', label: 'Custom retreat' },
    ];
  }

  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  humanDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  humanDateTime(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  transferTypeLabel(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'airport') return 'Airport';
    if (key === 'bus') return 'Bus';
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : '-';
  }

  toTitleCaseWords(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  surfLessonLabel(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'surf-lesson-beginner') return 'Surf Lesson - Beginner';
    if (key === 'surf-lesson-intermediate') return 'Surf Lesson - Intermediate';
    if (key === 'surf-guiding' || key === 'surf_guiding') return 'Surf Guiding';
    return this.toTitleCaseWords(key);
  }

  lessonFormatLabel(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'extended') return 'Extended Experience';
    if (key === 'base') return 'Base lesson';
    return this.toTitleCaseWords(key);
  }

  formatRequestedDates(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    return raw.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (match) => this.humanDate(match));
  }

  renderTransferChip(type) {
    const key = String(type || '').trim().toLowerCase();
    if (!key) return '';
    const label = this.transferTypeLabel(key);
    const cls = key === 'airport' ? 'airport' : key === 'bus' ? 'bus' : 'generic';
    return `<span class="transfer-chip ${cls}">${this.escapeHtml(label)}</span>`;
  }

  renderTransferSummary(row = {}) {
    const transportPlan = row.transportPlan && typeof row.transportPlan === 'object' ? row.transportPlan : {};
    const coreAddons = row.coreAddons && typeof row.coreAddons === 'object' ? row.coreAddons : {};
    const typesRaw = Array.isArray(coreAddons.transferTypes)
      ? coreAddons.transferTypes
      : String(coreAddons.transferType || '').trim()
        ? [coreAddons.transferType]
        : [];
    const types = [...new Set(typesRaw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
    if (!types.length) return this.escapeHtml(row.transferSummaryLine || '-');
    const chips = types.map((type) => this.renderTransferChip(type)).join(' ');
    const isSplit = types.length >= 2;
    const airportV = Math.max(0, Number(coreAddons.transferAirportVehicles || transportPlan.transferAirportVehicles || 0));
    const busV = Math.max(0, Number(coreAddons.transferBusVehicles || transportPlan.transferBusVehicles || 0));
    const vehiclesText = isSplit && (airportV > 0 || busV > 0)
      ? [airportV > 0 ? `${airportV} airport` : '', busV > 0 ? `${busV} bus` : '']
          .filter(Boolean)
          .join(' + ')
      : (() => {
          const v = Math.max(1, Number(coreAddons.transferVehicles || 1));
          return `${v} vehicle${v > 1 ? 's' : ''}`;
        })();
    const guestsTotal = Math.max(0, Number(row.guestCount ?? row.guests ?? 0));
    if (guestsTotal <= 1) {
      return `${chips} <span class="transfer-meta">${vehiclesText}</span>`;
    }
    const togetherRaw = String(coreAddons.transferTravelTogether || transportPlan.transferTravelTogether || 'yes').toLowerCase();
    const together = togetherRaw === 'no' ? 'No' : 'Yes';
    return `${chips} <span class="transfer-meta">${vehiclesText} · together: ${this.escapeHtml(together)}</span>`;
  }

  renderDetailKv(label, value, { span2 = false, rawHtml = false } = {}) {
    const cls = span2 ? 'detail-kv detail-kv--span2' : 'detail-kv';
    const display =
      rawHtml && value != null && value !== ''
        ? value
        : this.escapeHtml(value == null || value === '' ? '-' : value);
    return `<div class="${cls}"><span class="detail-kv-label">${this.escapeHtml(label)}</span><span class="detail-kv-value">${display}</span></div>`;
  }

  renderDetailKvGrid(entries = []) {
    if (!entries.length) return '';
    return `<div class="details-grid">${entries
      .map(([label, value, opts]) => this.renderDetailKv(label, value, opts || {}))
      .join('')}</div>`;
  }

  renderActivityCard(item = {}) {
    const title = this.escapeHtml(item.title || item.activityKey || '-');
    const date = this.escapeHtml(this.humanDate(item.preferredDate || ''));
    const category = this.escapeHtml(String(item.categoryLabel || '').trim());
    const price = this.escapeHtml(String(item.priceLabel || '').trim());
    const note = this.escapeHtml(String(item.notes || '').trim());
    const chips = [category, price]
      .filter(Boolean)
      .map((text) => `<span class="activity-chip">${text}</span>`)
      .join('');
    return `
      <article class="activity-item">
        <div class="activity-item-title">${title}</div>
        ${chips ? `<div class="activity-item-chips">${chips}</div>` : ''}
        <div class="activity-item-meta">Preferred date: ${date}</div>
        ${note ? `<div class="activity-item-note">${note}</div>` : ''}
      </article>`;
  }

  renderActivityStack(items = []) {
    if (!items.length) return '<p class="detail-empty">No activities recorded.</p>';
    return `<div class="activity-stack">${items.map((item) => this.renderActivityCard(item)).join('')}</div>`;
  }

  renderGuestDetailCard(g = {}, { showSurf = false, index = 1, isContact = false } = {}) {
    const idx = Number(g.index || index || 1);
    const name = this.escapeHtml(g.fullName || `Guest ${idx}`);
    const contact = isContact || idx === 1;
    const contactEntries = [];
    if (g.email) contactEntries.push(['Email', g.email]);
    if (g.phone) contactEntries.push(['Phone', g.phone]);
    const arrivalEntries = [
      ['Transfer', this.renderTransferChip(g.arrivalTransferType || '') || '-', { rawHtml: true }],
      ['Reference / flight', g.arrivalReference || '-'],
      ['Arrival time', g.arrivalTime ? this.humanDateTime(g.arrivalTime) : '-'],
    ];
    let surfSection = '';
    if (showSurf) {
      const surfEntries = [];
      const lessonRaw = String(g.surfLessonRequest || g.enquiryActivityKey || '').trim();
      if (lessonRaw) {
        surfEntries.push(['Lesson', this.surfLessonLabel(lessonRaw)]);
        if (g.lessonFormat) surfEntries.push(['Format', this.lessonFormatLabel(g.lessonFormat)]);
      }
      if (g.surfLevel) surfEntries.push(['Surf level', this.toTitleCaseWords(g.surfLevel)]);
      if (g.waterConfidence) surfEntries.push(['Ocean comfort', this.toTitleCaseWords(g.waterConfidence)]);
      if (g.preferredDate) surfEntries.push(['Preferred date', this.humanDate(g.preferredDate)]);
      if (g.surfNotes) surfEntries.push(['Notes', g.surfNotes, { span2: true }]);
      if (surfEntries.length) {
        surfSection = `
          <div class="guest-card-section">
            <div class="guest-card-section-title">Surf & activities</div>
            ${this.renderDetailKvGrid(surfEntries)}
          </div>`;
      }
    }
    return `
      <article class="guest-card${contact ? ' guest-card--contact' : ''}">
        <header class="guest-card-head">
          <span class="guest-card-name">${name}</span>
          ${contact ? '<span class="guest-card-badge">Primary contact</span>' : ''}
        </header>
        ${
          contactEntries.length
            ? `<div class="guest-card-section">
                <div class="guest-card-section-title">Contact</div>
                ${this.renderDetailKvGrid(contactEntries)}
              </div>`
            : ''
        }
        <div class="guest-card-section">
          <div class="guest-card-section-title">Arrival</div>
          ${this.renderDetailKvGrid(arrivalEntries)}
        </div>
        ${surfSection}
      </article>`;
  }

  renderGuestStack(guestRows = [], options = {}) {
    if (!guestRows.length) return '<p class="detail-empty">No guest details recorded.</p>';
    return `<div class="guest-stack">${guestRows
      .map((g, i) =>
        this.renderGuestDetailCard(g, {
          ...options,
          index: Number(g.index) || i + 1,
          isContact: i === 0,
        })
      )
      .join('')}</div>`;
  }

  renderNoteBlock(label, text, { hidden = false } = {}) {
    const value = String(text || '').trim();
    if (hidden || !value) return '';
    return `<div class="admin-note"><span class="admin-note-label">${this.escapeHtml(label)}</span><p class="admin-note-text">${this.escapeHtml(value)}</p></div>`;
  }

  renderPaymentActionsPanel(bookingId, row = {}, { isEnquiry = false } = {}) {
    const noteValue = isEnquiry ? row.notes || '' : row.adminNotes || '';
    return `
      <div class="details-actions-panel">
        <div class="detail-block-head">Admin actions</div>
        <label class="field">
          Payment link
          <input type="text" data-payment-link="${this.escapeHtml(bookingId)}" value="${this.escapeHtml(row.manualPaymentLink || '')}" placeholder="https://..." />
        </label>
        <label class="field">
          Note (optional)
          <textarea rows="2" data-note="${this.escapeHtml(bookingId)}" placeholder="Optional note for audit">${this.escapeHtml(noteValue)}</textarea>
        </label>
        <label class="field refund-field">
          <span>Refund completed (manual)</span>
          <input type="checkbox" data-refund="${this.escapeHtml(bookingId)}" ${row.refundCompleted ? 'checked' : ''} />
        </label>
        <div class="actions">
          ${
            row.canSendPaymentLink
              ? `<button class="primary" data-action="send-link" data-booking-id="${this.escapeHtml(bookingId)}">Send payment link</button>`
              : ''
          }
          ${
            row.canMarkPaid
              ? `<button class="ok" data-action="mark-paid" data-booking-id="${this.escapeHtml(bookingId)}">Mark paid</button>`
              : ''
          }
          ${
            row.canMarkUnpaid
              ? `<button class="warn" data-action="mark-unpaid" data-booking-id="${this.escapeHtml(bookingId)}">Mark unpaid</button>`
              : ''
          }
          ${
            row.canCancel
              ? `<button class="danger" data-action="cancel" data-booking-id="${this.escapeHtml(bookingId)}">Cancel</button>`
              : ''
          }
        </div>
      </div>`;
  }

  renderEnquiryDetailsPanel(row = {}, bookingId = '') {
    const guestRows = Array.isArray(row.guestDetails) ? row.guestDetails : [];
    const activityRows = Array.isArray(row.activityRequestsDetailed) ? row.activityRequestsDetailed : [];
    const sharedArrivalLabel = Number(row.guests || 0) <= 1 ? 'Arrival details' : 'Shared arrival';
    return `
      <section class="booking-details">
        <div class="details-panel">
          <div class="details-panel-meta">
            <div class="detail-block-head">Enquiry overview</div>
            ${this.renderDetailKvGrid([
              ['Enquiry ID', bookingId],
              ['Type', row.enquiryType || '-'],
              ['Phone', row.guestPhone || '-'],
              ['Guests', String(row.guests || 0)],
              ['Requested dates', this.formatRequestedDates(row.requestedDates || '')],
              ['Activities', (row.activityRequestKeys || []).join(', ') || '-', { span2: true }],
              ['Invoice sent at', this.humanDateTime(row.invoiceSentAt || '')],
              ['Payment due at', this.humanDateTime(row.paymentDueAt || '')],
              ['Reminder sent at', this.humanDateTime(row.paymentReminderSentAt || '')],
              ['Reminder count', String(Number(row.paymentReminderCount || 0))],
              ['Refund completed', row.refundCompleted ? 'Yes' : 'No'],
            ])}
          </div>
          <div class="detail-block">
            <div class="detail-title">Activity schedule</div>
            ${this.renderActivityStack(activityRows)}
          </div>
          <div class="detail-block">
            <div class="detail-title">Guests and arrivals</div>
            ${this.renderGuestStack(guestRows)}
          </div>
          <div class="details-panel-meta">
            <div class="detail-block-head">Transfer & arrival summary</div>
            ${this.renderDetailKvGrid([
              ['Transfer summary', this.renderTransferSummary(row), { rawHtml: true, span2: true }],
              [sharedArrivalLabel, row.sharedArrivalLine || '-', { span2: true }],
            ])}
          </div>
          <div class="admin-note-block">
            ${this.renderNoteBlock('Guest note', row.activityRequestNotes || row.notes || '-')}
            ${this.renderNoteBlock('Dietary notes', row.dietaryNotes || '', {
              hidden: !String(row.dietaryNotes || '').trim(),
            })}
          </div>
        </div>
        ${this.renderPaymentActionsPanel(bookingId, row, { isEnquiry: true })}
      </section>`;
  }

  renderStayBookingDetailsPanel(row = {}, bookingId = '') {
    const guestRows = Array.isArray(row.bookingGuests) ? row.bookingGuests : [];
    const activityRows = Array.isArray(row.experienceLines) ? row.experienceLines : [];
    const sharedArrivalLabel = Number(row.guestCount || 0) <= 1 ? 'Arrival details' : 'Shared arrival';
    return `
      <section class="booking-details">
        <div class="details-panel">
          <div class="details-panel-meta">
            <div class="detail-block-head">Booking overview</div>
            ${this.renderDetailKvGrid([
              ['Booking ID', bookingId],
              ['Flow', row.bookingFlowTitle || row.bookingFlow || '-'],
              ['Phone', row.guestPhone || '-'],
              ['Rooms', String(row.roomSelectionsCount || 0)],
              ['Activities', String(row.experienceRequestsCount || 0)],
              ['Invoice', row.invoiceStatus || '-'],
              ['Invoice sent at', this.humanDateTime(row.invoiceSentAt || '')],
              ['Payment due at', this.humanDateTime(row.paymentDueAt || '')],
              ['Reminder sent at', this.humanDateTime(row.paymentReminderSentAt || '')],
              ['Reminder count', String(Number(row.paymentReminderCount || 0))],
              ['Refund completed', row.refundCompleted ? 'Yes' : 'No'],
            ])}
          </div>
          <div class="detail-block">
            <div class="detail-title">Activity requests</div>
            ${this.renderActivityStack(activityRows)}
          </div>
          <div class="detail-block">
            <div class="detail-title">Guests and arrivals</div>
            ${this.renderGuestStack(guestRows, { showSurf: true })}
          </div>
          <div class="details-panel-meta">
            <div class="detail-block-head">Transfer & arrival summary</div>
            ${this.renderDetailKvGrid([
              ['Transfer summary', this.renderTransferSummary(row), { rawHtml: true, span2: true }],
              [sharedArrivalLabel, row.sharedArrivalLine || '-', { span2: true }],
            ])}
          </div>
          <div class="admin-note-block">
            ${this.renderNoteBlock('Activity request note', row.activityRequestNotes || '', {
              hidden: !String(row.activityRequestNotes || '').trim(),
            })}
            ${this.renderNoteBlock('Dietary notes', row.dietaryNotes || '', {
              hidden: !String(row.dietaryNotes || '').trim(),
            })}
            ${this.renderNoteBlock('Admin note', row.adminNotes || '-')}
          </div>
        </div>
        ${this.renderPaymentActionsPanel(bookingId, row)}
      </section>`;
  }

  renderTabButton(key, label) {
    const active = this.currentTab() === key;
    return `<button class="tab-btn ${active ? 'active' : ''}" data-tab="${key}">${label}</button>`;
  }

  renderBookings() {
    const tab = this.currentTab();
    if (tab === 'enquiries') {
      const enquiries = Array.isArray(this.options?.enquiries) ? this.options.enquiries : [];
      if (!enquiries.length) {
        return '<div class="empty-state"><p>No enquiries found for current filters.</p></div>';
      }
      return enquiries
        .map((row) => {
          const bookingId = String(row.enquiryId || row.enquiryItemId || '');
          const expanded = this.expanded.has(bookingId);
          return `
            <article class="booking-card">
              <header class="booking-head">
                <div class="booking-main">
                  <h3>${this.escapeHtml(row.guestName || 'Guest')}</h3>
                  <p>${this.escapeHtml(row.guestEmail || '-')}</p>
                </div>
                <div class="booking-meta">
                  <span class="pill">${this.escapeHtml(row.manualPaymentStatusLabel || '-')}</span>
                  <span>${this.escapeHtml(row.enquiryType || 'enquiry')}</span>
                  <span>${this.escapeHtml(this.formatRequestedDates(row.requestedDates || ''))}</span>
                </div>
                <button class="secondary" data-toggle-id="${this.escapeHtml(bookingId)}">
                  ${expanded ? 'Hide details' : 'View details'}
                </button>
              </header>
              ${expanded ? this.renderEnquiryDetailsPanel(row, bookingId) : ''}
            </article>
          `;
        })
        .join('');
    }
    const bookings = Array.isArray(this.options?.bookings) ? this.options.bookings : [];
    if (!bookings.length) {
      return '<div class="empty-state"><p>No bookings found for current filters.</p></div>';
    }
    return bookings
      .map((row) => {
        const bookingId = String(row.bookingId || '');
        const expanded = this.expanded.has(bookingId);
        return `
          <article class="booking-card">
            <header class="booking-head">
              <div class="booking-main">
                <h3>${this.escapeHtml(row.guestName || 'Guest')}</h3>
                <p>${this.escapeHtml(row.guestEmail || '-')}</p>
              </div>
              <div class="booking-meta">
                <span class="pill">${this.escapeHtml(row.statusLabel || row.status || '-')}</span>
                <span>${this.escapeHtml(this.humanDate(row.checkInDate || ''))} -> ${this.escapeHtml(this.humanDate(row.checkOutDate || ''))}</span>
                <span>${this.escapeHtml(String(row.guestCount || 0))} guests</span>
              </div>
              <button class="secondary" data-toggle-id="${this.escapeHtml(bookingId)}">
                ${expanded ? 'Hide details' : 'View details'}
              </button>
            </header>
            ${expanded ? this.renderStayBookingDetailsPanel(row, bookingId) : ''}
          </article>
        `;
      })
      .join('');
  }

  bindEvents() {
    this.querySelectorAll('[data-tab]').forEach((node) => {
      node.addEventListener('click', () => {
        const tab = node.getAttribute('data-tab') || 'bnb';
        this.emit('stay-manager-nav', { tab });
      });
    });

    this.querySelector('#btnRefresh')?.addEventListener('click', () => {
      if (!this.validateCreatedRange({ strictToLater: true }).ok) {
        this.render();
        this.initDatePicker();
        return;
      }
      this.emit('stay-manager-refresh', {
        filters: {
          status: this.querySelector('[data-filter="status"]')?.value || '',
          guestEmail: this.querySelector('[data-filter="guestEmail"]')?.value || '',
          manualPaymentStatus: this.querySelector('[data-filter="manualPaymentStatus"]')?.value || '',
          enquiryType: this.querySelector('[data-filter="enquiryType"]')?.value || '',
          createdFrom: this.querySelector('[data-filter="createdFrom"]')?.value || '',
          createdTo: this.querySelector('[data-filter="createdTo"]')?.value || '',
        },
      });
    });

    this.querySelectorAll('[data-filter="createdFrom"], [data-filter="createdTo"]').forEach((node) => {
      const clearAndSync = () => {
        this.clearCreatedRangeValidation();
        this.syncCreatedRangePickerBounds();
        this.querySelectorAll('[data-filter="createdFrom"], [data-filter="createdTo"]').forEach((inputEl) => {
          inputEl.classList.remove('invalid-input');
        });
        this.querySelectorAll('.range-error').forEach((el) => el.remove());
      };
      node.addEventListener('change', clearAndSync);
      node.addEventListener('input', clearAndSync);
    });

    this.querySelectorAll('[data-toggle-id]').forEach((node) => {
      node.addEventListener('click', () => {
        const bookingId = String(node.getAttribute('data-toggle-id') || '');
        if (!bookingId) return;
        if (this.expanded.has(bookingId)) this.expanded.delete(bookingId);
        else this.expanded.add(bookingId);
        this.render();
      });
    });

    this.querySelectorAll('[data-action]').forEach((node) => {
      node.addEventListener('click', () => {
        const action = String(node.getAttribute('data-action') || '');
        const bookingId = String(node.getAttribute('data-booking-id') || '');
        const paymentLinkNode = [...this.querySelectorAll('[data-payment-link]')].find(
          (el) => String(el.getAttribute('data-payment-link') || '') === bookingId
        );
        const noteNode = [...this.querySelectorAll('[data-note]')].find(
          (el) => String(el.getAttribute('data-note') || '') === bookingId
        );
        const refundNode = [...this.querySelectorAll('[data-refund]')].find(
          (el) => String(el.getAttribute('data-refund') || '') === bookingId
        );
        const paymentLink = paymentLinkNode?.value?.trim() || '';
        const note = noteNode?.value?.trim() || '';
        const refundCompleted = refundNode instanceof HTMLInputElement ? !!refundNode.checked : false;
        this.emit('stay-manager-booking-action', {
          action,
          bookingId,
          paymentLink,
          note,
          refundCompleted,
        });
      });
    });
  }

  render() {
    const filters = this.currentFilters();
    const statusOptions = this.statusOptions();
    const enquiryPaymentStatusOptions = this.enquiryPaymentStatusOptions();
    const enquiryTypeOptions = this.enquiryTypeOptions();
    const tab = this.currentTab();
    const createdRangeFields = this.createdRangeValidation?.fields || {};
    const createdRangeMessage = String(this.createdRangeValidation?.message || '').trim();
    this.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: "Inter", "Avenir Next", "Helvetica Neue", Arial, sans-serif;
          color: #1a2332;
          font-size: 14px;
          line-height: 1.5;
          -webkit-font-smoothing: antialiased;
        }
        * { box-sizing: border-box; }
        .shell { display: grid; gap: 20px; }
        .tabs { display: flex; gap: 6px; flex-wrap: wrap; }
        .tab-btn {
          border: 1px solid #dce1e9;
          background: #fff;
          color: #3b4a61;
          border-radius: 999px;
          padding: 9px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          letter-spacing: 0.01em;
          line-height: 1;
        }
        .tab-btn:hover { background: #f0f4fa; border-color: #c5cdd9; }
        .tab-btn.active { background: #1f5fff; border-color: #1f5fff; color: #fff; box-shadow: 0 1px 3px rgba(31,95,255,0.25); }
        .panel {
          border: 1px solid #e4e9f2;
          border-radius: 14px;
          padding: 18px 20px;
          background: #fff;
        }
        .filters { display: grid; grid-template-columns: 180px 1fr 180px 180px auto; gap: 12px; align-items: end; }
        .enquiry-filters { grid-template-columns: 190px 1fr 1fr 180px 180px auto; }
        .field { display: grid; gap: 5px; font-size: 12px; font-weight: 500; color: #5a6a82; letter-spacing: 0.01em; }
        .refund-field { display: flex; flex-direction: row; align-items: center; gap: 8px; }
        .refund-field input[type="checkbox"] { width: 16px; height: 16px; margin: 0; }
        .field-help { margin: 10px 0 0; font-size: 11px; color: #7b8799; line-height: 1.35; }
        .invalid-input {
          border-color: #c93a3a !important;
          box-shadow: 0 0 0 3px rgba(201,58,58,0.08) !important;
          background: #fff8f8 !important;
        }
        .range-error {
          margin: 10px 0 0;
          padding: 10px 12px;
          font-size: 12px;
          color: #991b1b;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 10px;
        }
        input, select, textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d4dae6;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 13px;
          color: #1a2332;
          background: #fff;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          line-height: 1.4;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #1f5fff;
          box-shadow: 0 0 0 3px rgba(31,95,255,0.1);
        }
        input::placeholder, textarea::placeholder { color: #9ba7b8; }
        button {
          border: none;
          border-radius: 10px;
          padding: 9px 16px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.15s ease;
          line-height: 1;
          white-space: nowrap;
        }
        .primary { background: #1f5fff; color: #fff; }
        .primary:hover:not(:disabled) { background: #1750e0; }
        .secondary { background: #f5f7fb; color: #3b4a61; border: 1px solid #d4dae6; }
        .secondary:hover:not(:disabled) { background: #eaeff7; border-color: #bcc5d4; }
        .ok { background: #0d7c4a; color: #fff; }
        .ok:hover:not(:disabled) { background: #0a6b3f; }
        .warn { background: #c07300; color: #fff; }
        .warn:hover:not(:disabled) { background: #a86500; }
        .danger { background: #c93a3a; color: #fff; }
        .danger:hover:not(:disabled) { background: #b02e2e; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .booking-list { display: grid; gap: 14px; margin-top: 4px; }
        .booking-card {
          border: 1px solid #e4e9f2;
          border-radius: 14px;
          padding: 16px 18px;
          background: #fff;
          display: grid;
          gap: 14px;
          transition: box-shadow 0.15s ease;
        }
        .booking-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .booking-head { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 14px; }
        .booking-main h3 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
        .booking-main p { margin: 3px 0 0; color: #6b7a90; font-size: 13px; }
        .booking-meta { display: grid; gap: 4px; font-size: 12px; color: #5a6a82; text-align: right; }
        .pill {
          display: inline-block;
          justify-self: end;
          background: #eef3ff;
          color: #294f9f;
          border-radius: 999px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .booking-details { display: grid; gap: 0; border-top: 1px solid #e8edf5; padding-top: 18px; margin-top: 4px; }
        .details-panel { display: grid; gap: 16px; }
        .details-panel-meta {
          border: 1px solid #e8edf5;
          border-radius: 12px;
          padding: 14px 16px;
          background: #fafbfd;
        }
        .detail-block-head {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #6b7a90;
          margin-bottom: 12px;
        }
        .details-grid { display: grid; grid-template-columns: repeat(2, minmax(160px, 1fr)); gap: 12px 16px; }
        .detail-kv { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .detail-kv--span2 { grid-column: 1 / -1; }
        .detail-kv-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b7a90;
        }
        .detail-kv-value {
          font-size: 13px;
          font-weight: 500;
          color: #1a2332;
          line-height: 1.45;
          word-break: break-word;
        }
        .detail-block {
          border: 1px solid #e8edf5;
          border-radius: 12px;
          padding: 14px 16px;
          background: #fff;
          display: grid;
          gap: 12px;
        }
        .detail-title { font-size: 13px; font-weight: 700; color: #1a2332; letter-spacing: 0.01em; }
        .detail-empty {
          margin: 0;
          font-size: 13px;
          color: #6b7a90;
          font-style: italic;
        }
        .activity-stack { display: grid; gap: 8px; }
        .activity-item {
          border: 1px solid #e8edf5;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fafbfd;
          display: grid;
          gap: 4px;
        }
        .activity-item-title { font-size: 13px; font-weight: 700; color: #1a2332; }
        .activity-item-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .activity-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          background: #eef3ff;
          color: #294f9f;
        }
        .activity-item-meta { font-size: 12px; color: #5a6a82; line-height: 1.45; }
        .activity-item-note { font-size: 12px; color: #6b7a90; line-height: 1.45; }
        .guest-stack { display: grid; gap: 10px; }
        .guest-card {
          border: 1px solid #e8edf5;
          border-radius: 12px;
          padding: 12px 14px;
          background: #fff;
          display: grid;
          gap: 0;
        }
        .guest-card--contact {
          border-color: #c8d8ff;
          background: linear-gradient(180deg, #f8faff 0%, #fff 100%);
        }
        .guest-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .guest-card-name { font-size: 14px; font-weight: 700; color: #1a2332; }
        .guest-card-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #294f9f;
          background: #eef3ff;
          border-radius: 999px;
          padding: 3px 8px;
        }
        .guest-card-section {
          display: grid;
          gap: 8px;
          padding-top: 12px;
          margin-top: 12px;
          border-top: 1px solid #eef1f6;
        }
        .guest-card-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #8a96a8;
        }
        .admin-note-block { display: grid; gap: 10px; }
        .admin-note {
          font-size: 13px;
          color: #3b4a61;
          line-height: 1.5;
          padding: 12px 14px;
          background: #fffbf5;
          border: 1px solid #f0e4d4;
          border-radius: 10px;
        }
        .admin-note-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #8a7a62;
          margin-bottom: 6px;
        }
        .admin-note-text { margin: 0; color: #1a2332; }
        .details-actions-panel {
          border-top: 1px solid #e8edf5;
          margin-top: 18px;
          padding-top: 18px;
          display: grid;
          gap: 12px;
        }
        .transfer-chip {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 2px 9px;
          font-size: 11px;
          font-weight: 700;
          line-height: 1.1;
          border: 1px solid transparent;
          margin-right: 4px;
          vertical-align: middle;
          white-space: nowrap;
        }
        .transfer-chip.airport { background: #e8f1ff; border-color: #b8d2ff; color: #1f4ea3; }
        .transfer-chip.bus { background: #fff1e8; border-color: #ffd0ae; color: #9c4f16; }
        .transfer-chip.generic { background: #edf1f7; border-color: #d3dce9; color: #4e5f78; }
        .transfer-meta { color: #5a6a82; font-size: 12px; font-weight: 500; }
        .muted-inline { color: #6b7a90; font-weight: 500; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; padding-top: 4px; }
        .hidden { display: none; }
        .error {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          border-radius: 10px;
          padding: 12px 16px;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
        }
        .loading { font-size: 13px; color: #6b7a90; font-weight: 500; padding: 4px 0; }
        .empty-state {
          border: 1px dashed #d4dae6;
          border-radius: 14px;
          padding: 32px 24px;
          color: #5a6a82;
          background: #fafbfd;
          text-align: center;
        }
        .empty-state h3 { margin: 0 0 8px; font-size: 17px; color: #1a2332; font-weight: 700; }
        .empty-state p { margin: 0; font-size: 14px; line-height: 1.5; }

        @media (max-width: 960px) {
          .filters { grid-template-columns: 1fr 1fr; }
          .enquiry-filters { grid-template-columns: 1fr 1fr; }
          .booking-head { grid-template-columns: 1fr; gap: 10px; }
          .booking-meta { text-align: left; }
          .details-grid { grid-template-columns: 1fr; }
          .guest-card-section .details-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 600px) {
          .panel { padding: 14px; }
          .booking-card { padding: 14px; }
          .filters { grid-template-columns: 1fr; }
          .enquiry-filters { grid-template-columns: 1fr; }
          .guest-card-section .details-grid { grid-template-columns: 1fr; }
          .actions { gap: 8px; }
          .actions button { flex: 1 1 auto; min-width: 0; }
        }
      </style>
      <div class="shell">
        <div class="tabs">
          ${this.renderTabButton('bnb', 'B&B')}
          ${this.renderTabButton('surf_stay', 'Surf & Stay')}
          ${this.renderTabButton('enquiries', 'Enquiries')}
        </div>
        ${
          this.errors?.global
            ? `<div class="error">${this.escapeHtml(this.errors.global)}</div>`
            : ''
        }
        ${
          tab === 'enquiries'
            ? `
          <section class="panel">
            <div class="filters enquiry-filters">
              <label class="field">
                Payment status
                <select data-filter="manualPaymentStatus">
                  ${enquiryPaymentStatusOptions
                    .map(
                      (opt) =>
                        `<option value="${this.escapeHtml(opt.value)}" ${
                          filters.manualPaymentStatus === opt.value ? 'selected' : ''
                        }>${this.escapeHtml(opt.label)}</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label class="field">
                Enquiry type
                <select data-filter="enquiryType">
                  ${enquiryTypeOptions
                    .map(
                      (opt) =>
                        `<option value="${this.escapeHtml(opt.value)}" ${
                          filters.enquiryType === opt.value ? 'selected' : ''
                        }>${this.escapeHtml(opt.label)}</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label class="field">
                Guest email contains
                <input type="text" data-filter="guestEmail" value="${this.escapeHtml(filters.guestEmail)}" placeholder="guest@email.com" />
              </label>
              <label class="field">
                Created from
                <input class="${createdRangeFields.createdFrom ? 'invalid-input' : ''}" type="text" data-filter="createdFrom" data-datetime-picker="true" value="${this.escapeHtml(filters.createdFrom || '')}" placeholder="Select date/time" />
              </label>
              <label class="field">
                Created to (must be later)
                <input class="${createdRangeFields.createdTo ? 'invalid-input' : ''}" type="text" data-filter="createdTo" data-datetime-picker="true" value="${this.escapeHtml(filters.createdTo || '')}" placeholder="Select date/time" />
              </label>
              <button class="secondary" id="btnRefresh">${this.loading ? 'Refreshing...' : 'Refresh'}</button>
            </div>
            <p class="field-help">Use a strict range: Created to must be later than Created from.</p>
            ${createdRangeMessage ? `<div class="range-error">${this.escapeHtml(createdRangeMessage)}</div>` : ''}
          </section>
        `
            : `
          <section class="panel">
            <div class="filters">
              <label class="field">
                Status
                <select data-filter="status">
                  ${statusOptions
                    .map(
                      (opt) =>
                        `<option value="${this.escapeHtml(opt.value)}" ${
                          filters.status === opt.value ? 'selected' : ''
                        }>${this.escapeHtml(opt.label)}</option>`
                    )
                    .join('')}
                </select>
              </label>
              <label class="field">
                Guest email contains
                <input type="text" data-filter="guestEmail" value="${this.escapeHtml(filters.guestEmail)}" placeholder="guest@email.com" />
              </label>
              <label class="field">
                Created from
                <input class="${createdRangeFields.createdFrom ? 'invalid-input' : ''}" type="text" data-filter="createdFrom" data-datetime-picker="true" value="${this.escapeHtml(filters.createdFrom || '')}" placeholder="Select date/time" />
              </label>
              <label class="field">
                Created to (must be later)
                <input class="${createdRangeFields.createdTo ? 'invalid-input' : ''}" type="text" data-filter="createdTo" data-datetime-picker="true" value="${this.escapeHtml(filters.createdTo || '')}" placeholder="Select date/time" />
              </label>
              <button class="secondary" id="btnRefresh">${this.loading ? 'Refreshing...' : 'Refresh'}</button>
            </div>
            <p class="field-help">Use a strict range: Created to must be later than Created from.</p>
            ${createdRangeMessage ? `<div class="range-error">${this.escapeHtml(createdRangeMessage)}</div>` : ''}
          </section>
        `
        }
        ${this.loading ? '<div class="loading">Loading...</div>' : ''}
        <section class="booking-list">
          ${this.renderBookings()}
        </section>
      </div>
    `;
    this.bindEvents();
  }
}

if (!customElements.get('stay-manager-ce')) {
  customElements.define('stay-manager-ce', StayManagerElement);
}
