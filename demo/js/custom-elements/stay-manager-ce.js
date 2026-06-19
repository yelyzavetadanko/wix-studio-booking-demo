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
          const activityRows = Array.isArray(row.activityRequestsDetailed) ? row.activityRequestsDetailed : [];
          const guestRows = Array.isArray(row.guestDetails) ? row.guestDetails : [];
          const sharedArrivalLabel = Number(row.guests || 0) <= 1 ? 'Arrival details' : 'Shared arrival';
          const activityLines = activityRows.length
            ? activityRows
                .map((item) => {
                  const title = this.escapeHtml(item.title || item.activityKey || '-');
                  const date = this.escapeHtml(this.humanDate(item.preferredDate || ''));
                  const category = this.escapeHtml(String(item.categoryLabel || '').trim());
                  const price = this.escapeHtml(String(item.priceLabel || '').trim());
                  const meta = [category ? `[${category}]` : '', price ? `(${price})` : ''].filter(Boolean).join(' ');
                  return `<li><strong>${title}</strong>${meta ? ` ${meta}` : ''} · Preferred date: ${date}</li>`;
                })
                .join('')
            : '<li>-</li>';
          const guestLines = guestRows.length
            ? guestRows
                .map((g) => {
                  const name = this.escapeHtml(g.fullName || `Guest ${Number(g.index || 0) || 1}`);
                  const contact = [g.email || '', g.phone || ''].filter(Boolean).map((v) => this.escapeHtml(v)).join(' | ');
                  const transfer = this.renderTransferChip(g.arrivalTransferType || '') || this.escapeHtml('-');
                  const ref = this.escapeHtml(g.arrivalReference || '-');
                  const time = this.escapeHtml(this.humanDateTime(g.arrivalTime || ''));
                  return `<li><strong>${name}</strong>${contact ? ` <span class="muted-inline">(${contact})</span>` : ''}<br/>Transfer: ${transfer} · Ref: ${ref} · Arrival: ${time}</li>`;
                })
                .join('')
            : '<li>-</li>';
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
              ${
                expanded
                  ? `
                <section class="booking-details">
                  <div class="details-grid">
                    <div><strong>Enquiry ID:</strong> ${this.escapeHtml(bookingId)}</div>
                    <div><strong>Type:</strong> ${this.escapeHtml(row.enquiryType || '-')}</div>
                    <div><strong>Phone:</strong> ${this.escapeHtml(row.guestPhone || '-')}</div>
                    <div><strong>Guests:</strong> ${this.escapeHtml(String(row.guests || 0))}</div>
                    <div><strong>Requested dates:</strong> ${this.escapeHtml(this.formatRequestedDates(row.requestedDates || ''))}</div>
                    <div><strong>Activities:</strong> ${this.escapeHtml((row.activityRequestKeys || []).join(', ') || '-')}</div>
                    <div><strong>Invoice sent at:</strong> ${this.escapeHtml(this.humanDateTime(row.invoiceSentAt || ''))}</div>
                    <div><strong>Payment due at:</strong> ${this.escapeHtml(this.humanDateTime(row.paymentDueAt || ''))}</div>
                    <div><strong>Reminder sent at:</strong> ${this.escapeHtml(this.humanDateTime(row.paymentReminderSentAt || ''))}</div>
                    <div><strong>Reminder count:</strong> ${this.escapeHtml(String(Number(row.paymentReminderCount || 0)))}</div>
                    <div><strong>Refund completed:</strong> ${row.refundCompleted ? 'Yes' : 'No'}</div>
                  </div>
                  <div class="detail-block">
                    <div class="detail-title">Activity schedule</div>
                    <ul class="detail-list">${activityLines}</ul>
                  </div>
                  <div class="detail-block">
                    <div class="detail-title">Guests and arrivals</div>
                    <ul class="detail-list">${guestLines}</ul>
                  </div>
                  <div class="details-grid">
                    <div><strong>Transfer summary:</strong> ${this.renderTransferSummary(row)}</div>
                    <div><strong>${this.escapeHtml(sharedArrivalLabel)}:</strong> ${this.escapeHtml(row.sharedArrivalLine || '-')}</div>
                  </div>
                  <div class="admin-note"><strong>Guest note:</strong> ${this.escapeHtml(row.activityRequestNotes || row.notes || '-')}</div>
                  <div class="admin-note ${String(row.dietaryNotes || '').trim() ? '' : 'hidden'}"><strong>Dietary notes:</strong> ${this.escapeHtml(row.dietaryNotes || '')}</div>
                  <label class="field">
                    Payment link
                    <input type="text" data-payment-link="${this.escapeHtml(bookingId)}" value="${this.escapeHtml(row.manualPaymentLink || '')}" placeholder="https://..." />
                  </label>
                  <label class="field">
                    Note (optional)
                    <textarea rows="2" data-note="${this.escapeHtml(bookingId)}" placeholder="Optional note for audit">${this.escapeHtml(row.notes || '')}</textarea>
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
                </section>
              `
                  : ''
              }
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
        const activityRows = Array.isArray(row.experienceLines) ? row.experienceLines : [];
        const guestRows = Array.isArray(row.bookingGuests) ? row.bookingGuests : [];
        const sharedArrivalLabel = Number(row.guestCount || 0) <= 1 ? 'Arrival details' : 'Shared arrival';
        const activityLines = activityRows.length
          ? activityRows
              .map((item) => {
                const date = this.escapeHtml(this.humanDate(item.preferredDate || ''));
                const title = this.escapeHtml(item.title || item.activityKey || '-');
                const category = this.escapeHtml(String(item.categoryLabel || '').trim());
                const price = this.escapeHtml(String(item.priceLabel || '').trim());
                const note = this.escapeHtml(String(item.notes || '').trim());
                const meta = [category ? `[${category}]` : '', price ? `(${price})` : ''].filter(Boolean).join(' ');
                return `<li><strong>${title}</strong>${meta ? ` ${meta}` : ''} · Preferred date: ${date}${note ? `<br/><span class="muted-inline">${note}</span>` : ''}</li>`;
              })
              .join('')
          : '<li>-</li>';
        const guestLines = guestRows.length
          ? guestRows
              .map((g) => {
                const name = this.escapeHtml(g.fullName || `Guest ${Number(g.index || 0) || 1}`);
                const contact = [g.email || '', g.phone || ''].filter(Boolean).map((v) => this.escapeHtml(v)).join(' | ');
                const transfer = this.renderTransferChip(g.arrivalTransferType || '') || this.escapeHtml('-');
                const ref = this.escapeHtml(g.arrivalReference || '-');
                const time = this.escapeHtml(this.humanDateTime(g.arrivalTime || ''));
                const lessonRaw = String(g.surfLessonRequest || g.enquiryActivityKey || '').trim();
                const lesson = this.escapeHtml(this.surfLessonLabel(lessonRaw));
                const lessonFormat = this.escapeHtml(this.lessonFormatLabel(g.lessonFormat || ''));
                const surfLevel = this.escapeHtml(this.toTitleCaseWords(g.surfLevel || ''));
                const oceanComfort = this.escapeHtml(this.toTitleCaseWords(g.waterConfidence || ''));
                const preferredDate = this.escapeHtml(this.humanDate(g.preferredDate || ''));
                const surfNotes = this.escapeHtml(String(g.surfNotes || '').trim());
                const surfParts = [];
                if (lessonRaw) {
                  surfParts.push(`Lesson: ${lesson}`);
                  if (lessonFormat) surfParts.push(`Format: ${lessonFormat}`);
                }
                if (g.surfLevel) surfParts.push(`Level: ${surfLevel}`);
                if (g.waterConfidence) surfParts.push(`Ocean comfort: ${oceanComfort}`);
                if (g.preferredDate) surfParts.push(`Preferred date: ${preferredDate}`);
                const surfLine = surfParts.length
                  ? `<br/><span class="muted-inline">${this.escapeHtml('Surf')}: ${surfParts.join(' · ')}</span>`
                  : '';
                const notesLine = surfNotes ? `<br/><span class="muted-inline">Notes: ${surfNotes}</span>` : '';
                return `<li><strong>${name}</strong>${contact ? ` <span class="muted-inline">(${contact})</span>` : ''}<br/>Transfer: ${transfer} · Ref: ${ref} · Arrival: ${time}${surfLine}${notesLine}</li>`;
              })
              .join('')
          : '<li>-</li>';
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
            ${
              expanded
                ? `
              <section class="booking-details">
                <div class="details-grid">
                  <div><strong>Booking ID:</strong> ${this.escapeHtml(bookingId)}</div>
                  <div><strong>Flow:</strong> ${this.escapeHtml(row.bookingFlowTitle || row.bookingFlow || '')}</div>
                  <div><strong>Phone:</strong> ${this.escapeHtml(row.guestPhone || '-')}</div>
                  <div><strong>Rooms:</strong> ${this.escapeHtml(String(row.roomSelectionsCount || 0))}</div>
                  <div><strong>Activities:</strong> ${this.escapeHtml(String(row.experienceRequestsCount || 0))}</div>
                  <div><strong>Invoice:</strong> ${this.escapeHtml(row.invoiceStatus || '-')}</div>
                  <div><strong>Invoice sent at:</strong> ${this.escapeHtml(this.humanDateTime(row.invoiceSentAt || ''))}</div>
                  <div><strong>Payment due at:</strong> ${this.escapeHtml(this.humanDateTime(row.paymentDueAt || ''))}</div>
                  <div><strong>Reminder sent at:</strong> ${this.escapeHtml(this.humanDateTime(row.paymentReminderSentAt || ''))}</div>
                  <div><strong>Reminder count:</strong> ${this.escapeHtml(String(Number(row.paymentReminderCount || 0)))}</div>
                  <div><strong>Refund completed:</strong> ${row.refundCompleted ? 'Yes' : 'No'}</div>
                </div>
                <div class="detail-block">
                  <div class="detail-title">Activity requests</div>
                  <ul class="detail-list">${activityLines}</ul>
                </div>
                <div class="detail-block">
                  <div class="detail-title">Guests and arrivals</div>
                  <ul class="detail-list">${guestLines}</ul>
                </div>
                <div class="details-grid">
                  <div><strong>Transfer summary:</strong> ${this.renderTransferSummary(row)}</div>
                  <div><strong>${this.escapeHtml(sharedArrivalLabel)}:</strong> ${this.escapeHtml(row.sharedArrivalLine || '-')}</div>
                </div>
                <div class="admin-note ${String(row.activityRequestNotes || '').trim() ? '' : 'hidden'}"><strong>Activity request note:</strong> ${this.escapeHtml(row.activityRequestNotes || '')}</div>
                <div class="admin-note ${String(row.dietaryNotes || '').trim() ? '' : 'hidden'}"><strong>Dietary notes:</strong> ${this.escapeHtml(row.dietaryNotes || '')}</div>
                <div class="admin-note"><strong>Admin note:</strong> ${this.escapeHtml(row.adminNotes || '-')}</div>
                <label class="field">
                  Payment link
                  <input type="text" data-payment-link="${this.escapeHtml(bookingId)}" value="${this.escapeHtml(row.manualPaymentLink || '')}" placeholder="https://..." />
                </label>
                <label class="field">
                  Note (optional)
                  <textarea rows="2" data-note="${this.escapeHtml(bookingId)}" placeholder="Optional note for audit">${this.escapeHtml(row.adminNotes || '')}</textarea>
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
              </section>
            `
                : ''
            }
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
        .booking-details { display: grid; gap: 14px; border-top: 1px solid #e8edf5; padding-top: 16px; margin-top: 2px; }
        .details-grid { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 10px; font-size: 13px; color: #3b4a61; }
        .details-grid strong { color: #1a2332; font-weight: 600; }
        .detail-block { border: 1px solid #e8edf5; border-radius: 10px; padding: 10px 12px; background: #fafbfd; }
        .detail-title { font-size: 12px; font-weight: 700; color: #1a2332; margin-bottom: 6px; letter-spacing: 0.01em; }
        .detail-list { margin: 0; padding-left: 18px; color: #3b4a61; font-size: 13px; line-height: 1.45; display: grid; gap: 6px; }
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
        .admin-note { font-size: 13px; color: #3b4a61; line-height: 1.5; }
        .admin-note strong { color: #1a2332; }
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
        }
        @media (max-width: 600px) {
          .panel { padding: 14px; }
          .booking-card { padding: 14px; }
          .filters { grid-template-columns: 1fr; }
          .enquiry-filters { grid-template-columns: 1fr; }
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
