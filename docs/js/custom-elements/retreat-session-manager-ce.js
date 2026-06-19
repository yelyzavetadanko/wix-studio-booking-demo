class RetreatSessionManagerElement extends HTMLElement {
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
    this.flatpickrReady = false;
    this.flatpickrLoading = false;
    this.formValidationError = '';
  }

  connectedCallback() {
    this.hydrateFromAttributes();
    this.render();
    this.initDatePicker();
    this.emit('retreat-manager-init', {});
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

  parseDateInput(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  formatDateInput(dateValue) {
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '';
    const y = dateValue.getFullYear();
    const m = String(dateValue.getMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
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

  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(value) {
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
    });
  }

  toTitleCase(raw) {
    return String(raw || '')
      .trim()
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  humanizeSurfLevel(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'beginner') return 'Beginner';
    if (key === 'intermediate') return 'Intermediate';
    if (key === 'advanced') return 'Advanced';
    return this.toTitleCase(value) || '-';
  }

  humanizeWaterConfidence(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'very_comfortable') return 'Very comfortable';
    if (key === 'somewhat_comfortable') return 'Somewhat comfortable';
    if (key === 'not_very_comfortable') return 'Not very comfortable';
    return this.toTitleCase(value) || '-';
  }

  getRetreatDurationNights() {
    const retreatKey = String(this.querySelector('[data-form-field="retreatKey"]')?.value || '').trim().toLowerCase();
    const product =
      (Array.isArray(this.options?.retreatProducts) ? this.options.retreatProducts : []).find(
        (row) => String(row?.retreatKey || '').trim().toLowerCase() === retreatKey
      ) || null;
    if (!product) return 1;
    const durationCandidates = [
      Number(product.durationNights || 0),
      Number(product.defaultNights || 0),
      Number(product.nights || 0),
      Number(product.minNights || 0),
    ].filter((n) => Number.isFinite(n) && n > 0);
    return Math.max(1, Math.round(durationCandidates[0] || 1));
  }

  updateEndDateMinConstraint() {
    const startInput = this.querySelector('[data-form-field="sessionStartDate"]');
    const endInput = this.querySelector('[data-form-field="sessionEndDate"]');
    if (!startInput || !endInput) return;
    const startDate = this.parseDateInput(startInput.value);
    const minDate = startDate || 'today';
    if (endInput._flatpickr) {
      endInput._flatpickr.set('minDate', minDate);
    }
  }

  applyAutoEndDateByRetreatDuration() {
    const startInput = this.querySelector('[data-form-field="sessionStartDate"]');
    const endInput = this.querySelector('[data-form-field="sessionEndDate"]');
    if (!startInput || !endInput) return;
    const startDate = this.parseDateInput(startInput.value);
    if (!startDate) return;
    const nights = this.getRetreatDurationNights();
    const nextEndDate = new Date(startDate);
    nextEndDate.setDate(nextEndDate.getDate() + Math.max(1, nights));
    const endDateValue = this.formatDateInput(nextEndDate);
    endInput.value = endDateValue;
    if (endInput._flatpickr) {
      endInput._flatpickr.setDate(endDateValue, true, 'Y-m-d');
    }
    this.updateEndDateMinConstraint();
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
      if (!document.getElementById('retreat-manager-flatpickr-css')) {
        const link = document.createElement('link');
        link.id = 'retreat-manager-flatpickr-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('retreat-manager-flatpickr-theme-css')) {
        const themeLink = document.createElement('link');
        themeLink.id = 'retreat-manager-flatpickr-theme-css';
        themeLink.rel = 'stylesheet';
        themeLink.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
        document.head.appendChild(themeLink);
      }
      if (!document.getElementById('retreat-manager-flatpickr-month-css')) {
        const monthCss = document.createElement('link');
        monthCss.id = 'retreat-manager-flatpickr-month-css';
        monthCss.rel = 'stylesheet';
        monthCss.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/style.css';
        document.head.appendChild(monthCss);
      }
      if (typeof window.monthSelectPlugin !== 'function') {
        try {
          await this.loadScript('https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/index.js');
        } catch (_err) {
          // Fallback: native <input type="month"> remains usable.
        }
      }
      this.flatpickrReady = typeof window.flatpickr === 'function';
      this.bindDatePickerInstances();
    } catch (_err) {
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
    const parseMinToday = (node) => String(node?.dataset?.minToday || 'false').toLowerCase() === 'true';

    const dateInputs = [...this.querySelectorAll('[data-date-picker]')];
    for (const node of dateInputs) {
      if (!node || node.dataset.fpReady === '1') continue;
      const initial = node.value || '';
      window.flatpickr(node, {
        disableMobile: true,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'F j, Y',
        minDate: parseMinToday(node) ? 'today' : null,
        allowInput: true,
        defaultDate: initial || null,
        onChange: (selectedDates) => {
          if (!selectedDates || !selectedDates[0]) return;
          const d = selectedDates[0];
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          node.value = `${y}-${m}-${day}`;
          if (String(node.getAttribute('data-form-field') || '') === 'sessionStartDate') {
            this.applyAutoEndDateByRetreatDuration();
          }
        },
      });
      node.dataset.fpReady = '1';
    }

    const monthInputs = [...this.querySelectorAll('[data-month-picker]')];
    for (const node of monthInputs) {
      if (!node || node.dataset.fpReady === '1') continue;
      if (typeof window.monthSelectPlugin !== 'function') continue;
      const initial = node.value || '';
      window.flatpickr(node, {
        disableMobile: true,
        dateFormat: 'Y-m',
        altInput: true,
        altFormat: 'F Y',
        allowInput: false,
        defaultDate: initial ? `${initial}-01` : null,
        plugins: [
          window.monthSelectPlugin({
            shorthand: false,
            dateFormat: 'Y-m',
            altFormat: 'F Y',
          }),
        ],
        onChange: (selectedDates) => {
          if (!selectedDates || !selectedDates[0]) return;
          const d = selectedDates[0];
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          node.value = `${y}-${m}`;
          node.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
      node.dataset.fpReady = '1';
    }

    const dateTimeInputs = [...this.querySelectorAll('[data-datetime-picker]')];
    for (const node of dateTimeInputs) {
      if (!node || node.dataset.fpReady === '1') continue;
      const initial = node.value || '';
      window.flatpickr(node, {
        disableMobile: true,
        enableTime: true,
        time_24hr: true,
        dateFormat: 'Y-m-d H:i',
        altInput: true,
        altFormat: 'F j, Y H:i',
        allowInput: true,
        defaultDate: initial || null,
        onChange: (selectedDates) => {
          if (!selectedDates || !selectedDates[0]) return;
          const d = selectedDates[0];
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          node.value = `${y}-${m}-${day} ${hh}:${mm}`;
        },
      });
      node.dataset.fpReady = '1';
    }
    this.updateEndDateMinConstraint();
  }

  getCurrentSessionFilters() {
    const st = this.state || {};
    const f = st.filters || {};
    return {
      retreatKey: String(f.retreatKey || '').trim(),
      monthKey: String(f.monthKey || '').trim(),
      status: String(f.status || '').trim(),
    };
  }

  getCurrentEnquiryFilters() {
    const st = this.state || {};
    const f = st.bookingFilters || {};
    return {
      retreatKey: String(f.retreatKey || '').trim(),
      retreatSessionId: String(f.retreatSessionId || '').trim(),
      manualPaymentStatus: String(f.manualPaymentStatus || '').trim(),
      guestEmail: String(f.guestEmail || '').trim(),
    };
  }

  getFormState() {
    const form = this.state?.form || {};
    return {
      retreatKey: String(form.retreatKey || '').trim(),
      sessionStartDate: String(form.sessionStartDate || '').trim(),
      sessionEndDate: String(form.sessionEndDate || '').trim(),
      status: String(form.status || 'open').trim(),
      minParticipantsSnapshot:
        form.minParticipantsSnapshot == null || form.minParticipantsSnapshot === '' ? '' : Number(form.minParticipantsSnapshot),
      maxParticipantsSnapshot:
        form.maxParticipantsSnapshot == null || form.maxParticipantsSnapshot === '' ? '' : Number(form.maxParticipantsSnapshot),
      preBlockedDormBeds:
        form.preBlockedDormBeds == null || form.preBlockedDormBeds === '' ? '' : Number(form.preBlockedDormBeds),
      blocksFullHouse: form.blocksFullHouse !== false,
    };
  }

  renderTabs() {
    const tab = String(this.state?.uiTab || 'sessions').trim();
    const isSessions = tab === 'sessions';
    const isForm = tab === 'form';
    const isEnquiries = tab === 'enquiries';
    return `
      <div class="rm-tabs">
        <button type="button" class="rm-tab ${isSessions ? 'is-active' : ''}" data-nav-tab="sessions">Sessions</button>
        <button type="button" class="rm-tab ${isForm ? 'is-active' : ''}" data-nav-tab="form">Create session</button>
        <button type="button" class="rm-tab ${isEnquiries ? 'is-active' : ''}" data-nav-tab="enquiries">Retreat enquiries</button>
      </div>
    `;
  }

  renderGlobalError() {
    const msg = String(this.errors?.global || '').trim();
    if (!msg) return '';
    return `<div class="rm-error">${this.escapeHtml(msg)}</div>`;
  }

  renderSessionsPanel() {
    const filters = this.getCurrentSessionFilters();
    const products = Array.isArray(this.options?.retreatProducts) ? this.options.retreatProducts : [];
    const sessions = Array.isArray(this.options?.sessions) ? this.options.sessions : [];
    return `
      <section class="rm-panel ${String(this.state?.uiTab || 'sessions') === 'sessions' ? '' : 'is-hidden'}">
        <div class="rm-section-head">
          <h3>Retreat sessions</h3>
          <button type="button" class="rm-btn rm-btn-primary" data-action="new-session">New session</button>
        </div>
        <div class="rm-filters">
          <label>Retreat
            <select data-filter-field="retreatKey">
              <option value="">All retreats</option>
              ${products
                .map((p) => `<option value="${this.escapeHtml(p.retreatKey)}" ${filters.retreatKey === p.retreatKey ? 'selected' : ''}>${this.escapeHtml(p.title || p.retreatKey)}</option>`)
                .join('')}
            </select>
          </label>
          <label>Filter by month
            <input type="month" data-filter-field="monthKey" data-month-picker placeholder="Filter by month" value="${this.escapeHtml(filters.monthKey)}" />
          </label>
          <label>Status
            <select data-filter-field="status">
              <option value="">All statuses</option>
              <option value="open" ${filters.status === 'open' ? 'selected' : ''}>Open</option>
              <option value="closed" ${filters.status === 'closed' ? 'selected' : ''}>Closed</option>
              <option value="cancelled" ${filters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
              <option value="sold_out" ${filters.status === 'sold_out' ? 'selected' : ''}>Sold out</option>
            </select>
          </label>
          <button type="button" class="rm-btn" data-action="reset-session-filters">Reset filters</button>
        </div>
        <div class="rm-cards">
          ${sessions.length ? sessions.map((session) => this.renderSessionCard(session)).join('') : '<p class="rm-muted">No sessions found.</p>'}
        </div>
      </section>
    `;
  }

  renderSessionCard(session = {}) {
    const s = String(session.status || 'open').toLowerCase();
    return `
      <article class="rm-card">
        <div class="rm-card-head">
          <h4>${this.escapeHtml(session.retreatTitle || session.retreatKey || 'Retreat')}</h4>
          <span class="rm-chip">${this.escapeHtml(session.statusLabel || s)}</span>
        </div>
        <div class="rm-kv-grid">
          <div><span>Dates</span><b>${this.escapeHtml(this.formatDate(session.sessionStartDate))} → ${this.escapeHtml(this.formatDate(session.sessionEndDate))}</b></div>
          <div><span>Capacity</span><b>${this.escapeHtml(`${session.participantsBooked || 0}/${session.maxParticipants || 0}`)}</b></div>
          <div><span>Participants left</span><b>${this.escapeHtml(String(session.participantsLeft ?? '-'))}</b></div>
          <div><span>Dorm reserved</span><b>${this.escapeHtml(String(session.effectivePreBlockedDormBeds ?? '-'))}</b></div>
        </div>
        <div class="rm-actions">
          <button type="button" class="rm-btn" data-session-action="edit" data-session-id="${this.escapeHtml(session.sessionId)}">Edit</button>
          <button type="button" class="rm-btn" data-session-action="open-enquiries" data-session-id="${this.escapeHtml(session.sessionId)}" data-retreat-key="${this.escapeHtml(session.retreatKey)}">Enquiries</button>
          ${s !== 'open' ? `<button type="button" class="rm-btn" data-session-action="status" data-session-id="${this.escapeHtml(session.sessionId)}" data-next-status="open">Open</button>` : ''}
          ${s !== 'closed' ? `<button type="button" class="rm-btn" data-session-action="status" data-session-id="${this.escapeHtml(session.sessionId)}" data-next-status="closed">Close</button>` : ''}
          ${s !== 'cancelled' ? `<button type="button" class="rm-btn" data-session-action="status" data-session-id="${this.escapeHtml(session.sessionId)}" data-next-status="cancelled">Cancel</button>` : ''}
          <button type="button" class="rm-btn rm-btn-danger" data-session-action="delete" data-session-id="${this.escapeHtml(session.sessionId)}">Delete session</button>
        </div>
      </article>
    `;
  }

  renderFormPanel() {
    const products = Array.isArray(this.options?.retreatProducts) ? this.options.retreatProducts : [];
    const form = this.getFormState();
    const isEdit = String(this.state?.editorMode || 'create') === 'edit';
    const formError = String(this.errors?.form || '').trim();
    const localFormError = String(this.formValidationError || '').trim();
    return `
      <section class="rm-panel ${String(this.state?.uiTab || 'sessions') === 'form' ? '' : 'is-hidden'}">
        <div class="rm-section-head">
          <h3>${isEdit ? 'Edit session' : 'Create session'}</h3>
          <button type="button" class="rm-btn" data-action="new-session">Reset form</button>
        </div>
        ${localFormError ? `<div class="rm-error">${this.escapeHtml(localFormError)}</div>` : ''}
        ${formError ? `<div class="rm-error">${this.escapeHtml(formError)}</div>` : ''}
        <div class="rm-form-grid">
          <label>Retreat
            <select data-form-field="retreatKey">
              <option value="">Select retreat</option>
              ${products
                .map((p) => `<option value="${this.escapeHtml(p.retreatKey)}" ${form.retreatKey === p.retreatKey ? 'selected' : ''}>${this.escapeHtml(p.title || p.retreatKey)}</option>`)
                .join('')}
            </select>
          </label>
          <label>Status
            <input type="text" value="${this.escapeHtml(this.toTitleCase(form.status || 'open'))} (managed from session card)" disabled />
          </label>
          <label>Session start date
            <input type="text" data-form-field="sessionStartDate" data-date-picker data-min-today="true" placeholder="YYYY-MM-DD" value="${this.escapeHtml(form.sessionStartDate)}" />
          </label>
          <label>Session end date
            <input type="text" data-form-field="sessionEndDate" data-date-picker data-min-today="true" placeholder="YYYY-MM-DD" value="${this.escapeHtml(form.sessionEndDate)}" />
          </label>
          <label>Min participants
            <input type="number" min="1" step="1" data-form-field="minParticipantsSnapshot" value="${this.escapeHtml(form.minParticipantsSnapshot)}" disabled />
          </label>
          <label>Max participants
            <input type="number" min="1" step="1" data-form-field="maxParticipantsSnapshot" value="${this.escapeHtml(form.maxParticipantsSnapshot)}" disabled />
          </label>
          <label>Dorm beds reserved (override)
            <input type="number" min="0" step="1" data-form-field="preBlockedDormBeds" value="${this.escapeHtml(form.preBlockedDormBeds)}" />
          </label>
        </div>
        <label class="rm-checkbox-label">
          <input type="checkbox" data-form-field="blocksFullHouse" ${form.blocksFullHouse !== false ? 'checked' : ''} />
          <span>Block whole house during retreat dates</span>
        </label>
        <div class="rm-info-box">
          <strong>What this does:</strong> when "Block whole house" is on, no other booking flow (BnB, Surf Stay, Beach Reset, Roots &amp; Ritual, Surf &amp; Soul) can reserve any room on these dates. Single and double upgrades inside the retreat itself remain available.
        </div>
        <div class="rm-actions">
          <button type="button" class="rm-btn rm-btn-primary" data-action="save-session">${isEdit ? 'Save changes' : 'Create session'}</button>
          <button type="button" class="rm-btn" data-nav-tab="sessions">Back to sessions</button>
        </div>
      </section>
    `;
  }

  renderEnquiriesPanel() {
    const filters = this.getCurrentEnquiryFilters();
    const products = Array.isArray(this.options?.retreatProducts) ? this.options.retreatProducts : [];
    const sessions = Array.isArray(this.options?.sessions) ? this.options.sessions : [];
    const enquiries = Array.isArray(this.options?.enquiries) ? this.options.enquiries : [];
    return `
      <section class="rm-panel ${String(this.state?.uiTab || 'sessions') === 'enquiries' ? '' : 'is-hidden'}">
        <div class="rm-section-head">
          <h3>Retreat enquiries</h3>
        </div>
        <div class="rm-filters">
          <label>Retreat
            <select data-enquiry-filter-field="retreatKey">
              <option value="">All retreats</option>
              ${products
                .map((p) => `<option value="${this.escapeHtml(p.retreatKey)}" ${filters.retreatKey === p.retreatKey ? 'selected' : ''}>${this.escapeHtml(p.title || p.retreatKey)}</option>`)
                .join('')}
            </select>
          </label>
          <label>Session
            <select data-enquiry-filter-field="retreatSessionId">
              <option value="">All sessions</option>
              ${sessions
                .map((s) => `<option value="${this.escapeHtml(s.sessionId)}" ${filters.retreatSessionId === s.sessionId ? 'selected' : ''}>${this.escapeHtml((s.retreatTitle || s.retreatKey || '') + ' • ' + (s.sessionStartDate || ''))}</option>`)
                .join('')}
            </select>
          </label>
          <label>Payment status
            <select data-enquiry-filter-field="manualPaymentStatus">
              <option value="">All statuses</option>
              <option value="awaiting_manual_payment" ${filters.manualPaymentStatus === 'awaiting_manual_payment' ? 'selected' : ''}>Awaiting manual payment</option>
              <option value="manually_paid" ${filters.manualPaymentStatus === 'manually_paid' ? 'selected' : ''}>Manually paid</option>
              <option value="cancelled" ${filters.manualPaymentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </label>
          <label>Guest email
            <input type="text" data-enquiry-filter-field="guestEmail" value="${this.escapeHtml(filters.guestEmail)}" />
          </label>
          <button type="button" class="rm-btn" data-action="reset-enquiry-filters">Reset filters</button>
        </div>
        <div class="rm-enquiry-layout">
          <div class="rm-enquiry-list">
            ${enquiries.length ? enquiries.map((row) => this.renderEnquiryCard(row)).join('') : '<p class="rm-muted">No retreat enquiries found.</p>'}
          </div>
          <div class="rm-enquiry-details">
            ${this.renderSelectedEnquiryDetails(this.state?.selectedEnquiry || null)}
          </div>
        </div>
      </section>
    `;
  }

  renderEnquiryCard(row = {}) {
    const enquiryId = String(row.enquiryId || '').trim();
    const selectedId = String(this.state?.selectedEnquiryId || '').trim();
    const isSelected = enquiryId && selectedId && enquiryId === selectedId;
    const isCustomRetreatV2 = String(row.customRetreatSchema || '') === 'v2';
    const retreatLabel = isCustomRetreatV2
      ? 'Custom Retreat'
      : (row.retreatKey || '-');
    return `
      <article class="rm-card ${isSelected ? 'is-selected' : ''}">
        <div class="rm-card-head">
          <h4>${this.escapeHtml(row.guestName || 'Guest')}</h4>
          <span class="rm-chip">${this.escapeHtml(this.toTitleCase(row.manualPaymentStatus || 'none'))}</span>
        </div>
        <div class="rm-kv-grid">
          <div><span>Enquiry ID</span><b>${this.escapeHtml(enquiryId || '-')}</b></div>
          <div><span>Retreat</span><b>${this.escapeHtml(retreatLabel)}</b></div>
          <div><span>Dates</span><b>${this.escapeHtml(row.requestedDates || '-')}</b></div>
          <div><span>Reminder sent</span><b>${this.escapeHtml(this.formatDateTime(row.paymentReminderSentAt || ''))}</b></div>
          <div><span>Refund completed</span><b>${row.refundCompleted ? 'Yes' : 'No'}</b></div>
        </div>
        <div class="rm-inline-fields">
          <label>Payment link
            <input type="text" data-enquiry-input="paymentLink" data-enquiry-id="${this.escapeHtml(enquiryId)}" value="${this.escapeHtml(row.manualPaymentLink || '')}" placeholder="https://..." />
          </label>
          <label>Admin note
            <textarea rows="2" data-enquiry-input="note" data-enquiry-id="${this.escapeHtml(enquiryId)}" placeholder="Optional note"></textarea>
          </label>
          <label class="rm-checkbox">Refund completed
            <input type="checkbox" data-enquiry-input="refundCompleted" data-enquiry-id="${this.escapeHtml(enquiryId)}" ${row.refundCompleted ? 'checked' : ''} />
          </label>
        </div>
        <div class="rm-actions">
          <button type="button" class="rm-btn" data-enquiry-action="open" data-enquiry-id="${this.escapeHtml(enquiryId)}">Details</button>
          ${row.canSendPaymentLink ? `<button type="button" class="rm-btn rm-btn-link" data-enquiry-action="send_payment_link" data-enquiry-id="${this.escapeHtml(enquiryId)}">Send payment link</button>` : ''}
          ${row.canMarkPaid ? `<button type="button" class="rm-btn rm-btn-ok" data-enquiry-action="mark_paid" data-enquiry-id="${this.escapeHtml(enquiryId)}">Mark paid</button>` : ''}
          ${row.canMarkUnpaid ? `<button type="button" class="rm-btn rm-btn-warn" data-enquiry-action="mark_unpaid" data-enquiry-id="${this.escapeHtml(enquiryId)}">Mark unpaid</button>` : ''}
          ${row.canCancel ? `<button type="button" class="rm-btn rm-btn-danger" data-enquiry-action="cancel" data-enquiry-id="${this.escapeHtml(enquiryId)}">Cancel</button>` : ''}
        </div>
      </article>
    `;
  }

  renderSelectedEnquiryDetails(row = null) {
    if (!row || typeof row !== 'object') {
      return '<div class="rm-placeholder">Select enquiry to view full details.</div>';
    }
    const roomRows = (Array.isArray(row.roomSelections) ? row.roomSelections : []).filter((x) => Number(x?.quantity ?? x?.quantityUnits ?? 0) > 0);
    const guests = Array.isArray(row.guestDetails) ? row.guestDetails : [];
    const intake = row.retreatIntake && typeof row.retreatIntake === 'object' ? row.retreatIntake : {};
    // Schema detection: 'v2' = bespoke 5-step Custom Retreat (new), '' = legacy q1-q9 application.
    const isCustomRetreatV2 =
      String(row.customRetreatSchema || '') === 'v2' ||
      String(intake.schemaVersion || '') === 'custom_retreat_v2';
    const customRetreatTypeLabels = {
      birthday: 'Birthday celebration',
      special_occasion: 'Special occasion',
      wellness: 'Wellness retreat',
      yoga: 'Yoga retreat',
      surf: 'Surf retreat',
      creative: 'Creative retreat',
      corporate: 'Corporate retreat / team offsite',
      family: 'Family gathering',
      friends: 'Friends getaway',
      cultural: 'Cultural experience',
      other: 'Other',
    };
    const formatRetreatType = (key) => {
      const k = String(key || '').trim().toLowerCase();
      if (k === 'other') {
        const txt = String(row.retreatTypeOther || intake.retreatTypeOther || '').trim();
        return txt ? `Other: ${txt}` : 'Other';
      }
      return customRetreatTypeLabels[k] || this.toTitleCase(k);
    };
    const retreatTypesLabel = (Array.isArray(row.retreatTypes) && row.retreatTypes.length
      ? row.retreatTypes
      : Array.isArray(intake.retreatTypes)
        ? intake.retreatTypes
        : []
    )
      .map((x) => formatRetreatType(x))
      .filter(Boolean)
      .join(', ');
    const wholeHouseEnquiry = row.wholeHouseEnquiry === true;
    const guestCountry = String(row.guestCountry || '').trim();
    const intakeRows = isCustomRetreatV2
      ? [
          ['Vision', intake.vision],
          ['Activities / experiences wanted', intake.activitiesWanted],
          ['Special requirements', intake.specialRequirements],
        ]
      : [
          ['Q1', intake.q1],
          ['Q2', Array.isArray(intake.q2) ? intake.q2.join(', ') : intake.q2],
          ['Q3', intake.q3],
          ['Q4', intake.q4],
          ['Q5', intake.q5],
          ['Q6', intake.q6],
          ['Q7', intake.q7],
          ['Q8', intake.q8],
          ['Q9', intake.q9],
        ];
    return `
      <div class="rm-detail-card">
        <h4>${isCustomRetreatV2 ? 'Custom retreat request' : 'Enquiry details'}</h4>
        <div class="rm-subtitle">ID: ${this.escapeHtml(row.enquiryId || '-')}</div>
        <div class="rm-detail-block">
          <div class="rm-detail-title">Core booking info</div>
          <table class="rm-table">
            ${isCustomRetreatV2
              ? `<tr><td>Retreat type(s)</td><td>${this.escapeHtml(retreatTypesLabel || '-')}</td></tr>
                 <tr><td>Accommodation</td><td>${wholeHouseEnquiry ? 'Whole house — enquiry only' : 'Per-room request (see below)'}</td></tr>`
              : `<tr><td>Retreat</td><td>${this.escapeHtml(row.retreatKey || '-')}</td></tr>`}
            <tr><td>Requested dates</td><td>${this.escapeHtml(row.requestedDates || '-')}</td></tr>
            <tr><td>Guests</td><td>${this.escapeHtml(String(row.guests || '-'))}</td></tr>
            <tr><td>Manual payment status</td><td>${this.escapeHtml(this.toTitleCase(row.manualPaymentStatus || '-'))}</td></tr>
            <tr><td>Payment due at</td><td>${this.escapeHtml(this.formatDateTime(row.paymentDueAt || ''))}</td></tr>
            <tr><td>Reminder sent at</td><td>${this.escapeHtml(this.formatDateTime(row.paymentReminderSentAt || ''))}</td></tr>
            <tr><td>Reminder count</td><td>${this.escapeHtml(String(Number(row.paymentReminderCount || 0)))}</td></tr>
          </table>
        </div>
        <div class="rm-detail-block">
          <div class="rm-detail-title">Contact person</div>
          <table class="rm-table">
            <tr><td>Name</td><td>${this.escapeHtml(row.guestName || '-')}</td></tr>
            <tr><td>Email</td><td>${this.escapeHtml(row.guestEmail || '-')}</td></tr>
            <tr><td>Phone</td><td>${this.escapeHtml(row.guestPhone || '-')}</td></tr>
            ${isCustomRetreatV2 ? `<tr><td>Country</td><td>${this.escapeHtml(guestCountry || '-')}</td></tr>` : ''}
            <tr><td>Dietary notes</td><td>${this.escapeHtml(row.dietaryNotes || '-')}</td></tr>
          </table>
        </div>
        <div class="rm-detail-block">
          <div class="rm-detail-title">Request notes</div>
          <div class="rm-note">${this.escapeHtml(row.activityRequestNotes || row.notes || '-')}</div>
        </div>
        ${
          roomRows.length
            ? `<div class="rm-detail-block">
                <div class="rm-detail-title">Room selections</div>
                <table class="rm-table">
                  <tr><th>Room type</th><th>Quantity</th></tr>
                  ${roomRows
                    .map((x) => `<tr><td>${this.escapeHtml(this.toTitleCase(x.roomTypeKey || '-'))}</td><td>${this.escapeHtml(String(Number(x.quantity ?? x.quantityUnits ?? 0)))}</td></tr>`)
                    .join('')}
                </table>
              </div>`
            : ''
        }
        ${
          guests.length
            ? `<div class="rm-detail-block">
                <div class="rm-detail-title">Guests</div>
                <div class="rm-guest-stack">
                  ${guests
                    .map(
                      (g, idx) => `<div class="rm-guest-card">
                      <div class="rm-guest-title">Guest ${idx + 1}${idx === 0 ? ' (Contact)' : ''}</div>
                      <table class="rm-table">
                        <tr><td>Name</td><td>${this.escapeHtml(g.fullName || '-')}</td></tr>
                        <tr><td>Email</td><td>${this.escapeHtml(g.email || '-')}</td></tr>
                        <tr><td>Phone</td><td>${this.escapeHtml(g.phone || '-')}</td></tr>
                        <tr><td>Dietary notes</td><td>${this.escapeHtml(g.dietaryNotes || '-')}</td></tr>
                      </table>
                    </div>`
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
        ${
          intakeRows.some((x) => String(x[1] || '').trim())
            ? `<div class="rm-detail-block">
                <div class="rm-detail-title">${isCustomRetreatV2 ? 'Retreat plans' : 'Retreat intake (Q1-Q9)'}</div>
                <div class="rm-intake-list">
                  ${intakeRows
                    .map(
                      (rowIntake) => `<div class="rm-intake-item">
                        <div class="rm-intake-q">${this.escapeHtml(rowIntake[0])}</div>
                        <div class="rm-intake-a">${this.escapeHtml(rowIntake[1] || '-')}</div>
                      </div>`
                    )
                    .join('')}
                </div>
              </div>`
            : ''
        }
        <div class="rm-subtitle">Created: ${this.escapeHtml(this.formatDateTime(row.createdAt || ''))}</div>
      </div>
    `;
  }

  readSessionFiltersFromUi() {
    return {
      retreatKey: this.querySelector('[data-filter-field="retreatKey"]')?.value || '',
      monthKey: this.querySelector('[data-filter-field="monthKey"]')?.value || '',
      status: this.querySelector('[data-filter-field="status"]')?.value || '',
    };
  }

  readEnquiryFiltersFromUi() {
    return {
      retreatKey: this.querySelector('[data-enquiry-filter-field="retreatKey"]')?.value || '',
      retreatSessionId: this.querySelector('[data-enquiry-filter-field="retreatSessionId"]')?.value || '',
      manualPaymentStatus: this.querySelector('[data-enquiry-filter-field="manualPaymentStatus"]')?.value || '',
      guestEmail: this.querySelector('[data-enquiry-filter-field="guestEmail"]')?.value || '',
    };
  }

  readFormFromUi() {
    const blocksFullHouseInput = this.querySelector('[data-form-field="blocksFullHouse"]');
    return {
      retreatKey: this.querySelector('[data-form-field="retreatKey"]')?.value || '',
      sessionStartDate: this.querySelector('[data-form-field="sessionStartDate"]')?.value || '',
      sessionEndDate: this.querySelector('[data-form-field="sessionEndDate"]')?.value || '',
      status: String(this.state?.form?.status || 'open').trim().toLowerCase(),
      minParticipantsSnapshot: this.querySelector('[data-form-field="minParticipantsSnapshot"]')?.value ?? '',
      maxParticipantsSnapshot: this.querySelector('[data-form-field="maxParticipantsSnapshot"]')?.value ?? '',
      preBlockedDormBeds: this.querySelector('[data-form-field="preBlockedDormBeds"]')?.value ?? '',
      blocksFullHouse: blocksFullHouseInput ? !!blocksFullHouseInput.checked : true,
    };
  }

  clearFormValidationError() {
    this.formValidationError = '';
  }

  validateSessionDateRange(form = {}) {
    const startDate = this.parseDateInput(form.sessionStartDate);
    const endDate = this.parseDateInput(form.sessionEndDate);
    if (!startDate || !endDate) {
      return { ok: false, message: 'Session start date and end date are required.' };
    }
    if (endDate <= startDate) {
      return { ok: false, message: 'Session end date must be later than session start date.' };
    }
    return { ok: true, message: '' };
  }

  readEnquiryActionInputs(enquiryId) {
    const target = String(enquiryId || '').trim();
    const paymentLinkInput = [...this.querySelectorAll('[data-enquiry-input="paymentLink"]')].find(
      (node) => String(node.getAttribute('data-enquiry-id') || '').trim() === target
    );
    const noteInput = [...this.querySelectorAll('[data-enquiry-input="note"]')].find(
      (node) => String(node.getAttribute('data-enquiry-id') || '').trim() === target
    );
    const refundInput = [...this.querySelectorAll('[data-enquiry-input="refundCompleted"]')].find(
      (node) => String(node.getAttribute('data-enquiry-id') || '').trim() === target
    );
    return {
      paymentLink: paymentLinkInput?.value || '',
      note: noteInput?.value || '',
      refundCompleted: refundInput instanceof HTMLInputElement ? !!refundInput.checked : false,
    };
  }

  bindEvents() {
    const emitSessionFilters = () => {
      this.emit('retreat-manager-refresh', { filters: this.readSessionFiltersFromUi() });
    };
    const emitEnquiryFilters = () => {
      this.emit('retreat-manager-enquiries-refresh', { filters: this.readEnquiryFiltersFromUi() });
    };

    this.querySelectorAll('[data-nav-tab]').forEach((node) => {
      node.addEventListener('click', () => {
        const tab = String(node.getAttribute('data-nav-tab') || '').trim();
        this.emit('retreat-manager-nav', { tab });
      });
    });

    this.querySelectorAll('[data-filter-field]').forEach((node) => {
      const tag = String(node.tagName || '').toLowerCase();
      node.addEventListener(tag === 'input' ? 'input' : 'change', emitSessionFilters);
    });
    this.querySelector('[data-action="reset-session-filters"]')?.addEventListener('click', () => {
      this.emit('retreat-manager-refresh', {
        filters: { retreatKey: '', monthKey: '', status: '' },
      });
    });

    this.querySelector('[data-action="new-session"]')?.addEventListener('click', () => {
      this.clearFormValidationError();
      this.emit('retreat-manager-new', {});
    });
    this.querySelector('[data-action="save-session"]')?.addEventListener('click', () => {
      const mode = String(this.state?.editorMode || 'create') === 'edit' ? 'edit' : 'create';
      const form = this.readFormFromUi();
      const validation = this.validateSessionDateRange(form);
      if (!validation.ok) {
        this.formValidationError = validation.message;
        this.render();
        this.initDatePicker();
        return;
      }
      this.clearFormValidationError();
      this.emit('retreat-manager-save', { mode, form });
    });
    this.querySelector('[data-form-field="retreatKey"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
      const retreatKey = this.querySelector('[data-form-field="retreatKey"]')?.value || '';
      this.applyAutoEndDateByRetreatDuration();
      this.emit('retreat-manager-retreat-change', { retreatKey });
    });
    this.querySelector('[data-form-field="sessionStartDate"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
    });
    this.querySelector('[data-form-field="sessionEndDate"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
    });

    this.querySelectorAll('[data-session-action]').forEach((node) => {
      node.addEventListener('click', () => {
        const action = String(node.getAttribute('data-session-action') || '').trim();
        const sessionId = String(node.getAttribute('data-session-id') || '').trim();
        const retreatKey = String(node.getAttribute('data-retreat-key') || '').trim();
        const nextStatus = String(node.getAttribute('data-next-status') || '').trim();
        if (!action || !sessionId) return;
        if (action === 'edit') this.emit('retreat-manager-edit', { sessionId });
        if (action === 'open-enquiries') this.emit('retreat-manager-open-enquiries', { sessionId, retreatKey });
        if (action === 'status') this.emit('retreat-manager-session-status', { sessionId, status: nextStatus });
        if (action === 'delete') this.emit('retreat-manager-delete-session', { sessionId });
      });
    });

    this.querySelectorAll('[data-enquiry-filter-field]').forEach((node) => {
      const tag = String(node.tagName || '').toLowerCase();
      node.addEventListener(tag === 'input' ? 'input' : 'change', emitEnquiryFilters);
    });
    this.querySelector('[data-action="reset-enquiry-filters"]')?.addEventListener('click', () => {
      this.emit('retreat-manager-enquiries-refresh', {
        filters: {
          retreatKey: '',
          retreatSessionId: '',
          manualPaymentStatus: '',
          guestEmail: '',
        },
      });
    });

    this.querySelectorAll('[data-enquiry-action]').forEach((node) => {
      node.addEventListener('click', () => {
        const action = String(node.getAttribute('data-enquiry-action') || '').trim();
        const enquiryId = String(node.getAttribute('data-enquiry-id') || '').trim();
        if (!action || !enquiryId) return;
        if (action === 'open') {
          this.emit('retreat-manager-enquiry-open', { enquiryId });
          return;
        }
        const inputs = this.readEnquiryActionInputs(enquiryId);
        this.emit('retreat-manager-enquiry-action', {
          enquiryId,
          action,
          paymentLink: inputs.paymentLink,
          note: inputs.note,
          refundCompleted: inputs.refundCompleted,
        });
      });
    });
  }

  render() {
    const uiTab = String(this.state?.uiTab || 'sessions').trim();
    this.innerHTML = `
      <style>
        :host { display:block; font-family: Inter, Arial, sans-serif; color:#2d2820; }
        .rm-wrap { border:1px solid #e5e3dc; border-radius:14px; background:#fffdfa; padding:14px; }
        .rm-tabs { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
        .rm-tab { border:1px solid #d4cec2; background:#fff; border-radius:10px; padding:7px 12px; font-weight:600; cursor:pointer; }
        .rm-tab.is-active { border-color:#de7a45; color:#de7a45; }
        .rm-panel.is-hidden { display:none; }
        .rm-section-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
        .rm-section-head h3 { margin:0; font-size:16px; }
        .rm-filters { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; align-items:flex-end; }
        .rm-filters > label { width:220px; min-width:180px; max-width:240px; }
        .rm-form-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; margin-bottom:12px; }
        label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:#756c61; font-weight:600; }
        input, select, textarea { border:1px solid #d7d1c6; border-radius:8px; padding:6px 9px; font-size:12px; line-height:1.25; background:#fff; color:#2d2820; }
        input, select { min-height:34px; }
        textarea { resize:vertical; }
        .rm-btn { border:1px solid #d4cec2; background:#fff; border-radius:10px; padding:8px 12px; font-size:13px; font-weight:600; cursor:pointer; }
        .rm-btn:disabled { opacity:.55; cursor:not-allowed; }
        .rm-btn-primary { border-color:#de7a45; background:#de7a45; color:#fff; }
        .rm-btn-link { border-color:#1f5fff; background:#1f5fff; color:#fff; }
        .rm-btn-link:hover:not(:disabled) { border-color:#1750e0; background:#1750e0; }
        .rm-btn-ok { border-color:#0d7c4a; background:#0d7c4a; color:#fff; }
        .rm-btn-ok:hover:not(:disabled) { border-color:#0a6b3f; background:#0a6b3f; }
        .rm-btn-warn { border-color:#c07300; background:#c07300; color:#fff; }
        .rm-btn-warn:hover:not(:disabled) { border-color:#a86500; background:#a86500; }
        .rm-btn-danger { border-color:#c93a3a; background:#c93a3a; color:#fff; }
        .rm-btn-danger:hover:not(:disabled) { border-color:#b02e2e; background:#b02e2e; }
        .rm-cards, .rm-enquiry-list { display:grid; gap:10px; }
        .rm-card, .rm-detail-card { border:1px solid #e5e3dc; border-radius:12px; background:#fff; padding:10px; }
        .rm-card.is-selected { border-color:#de7a45; }
        .rm-card-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
        .rm-card-head h4 { margin:0; font-size:14px; }
        .rm-chip { border:1px solid #d4cec2; border-radius:999px; padding:3px 8px; font-size:11px; color:#756c61; }
        .rm-kv-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; margin-bottom:8px; }
        .rm-kv-grid span { display:block; font-size:11px; color:#756c61; margin-bottom:2px; }
        .rm-kv-grid b { font-size:13px; font-weight:600; color:#2d2820; }
        .rm-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
        .rm-error { border:1px solid #f1b9b9; background:#fff1f1; color:#b42318; border-radius:10px; padding:8px 10px; margin-bottom:10px; font-size:13px; }
        .rm-muted { color:#756c61; font-size:13px; }
        .rm-inline-fields { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:8px 0; }
        .rm-checkbox { display:flex; align-items:center; gap:8px; min-height:34px; grid-column:1 / -1; justify-content:flex-start; }
        .rm-checkbox input[type="checkbox"] { width:16px; height:16px; margin:0; }
        .rm-checkbox-label {
          display:inline-flex;
          flex-direction:row;
          align-items:center;
          gap:10px;
          cursor:pointer;
          font-size:14px;
          font-weight:500;
          color:#1f1a14;
          margin:6px 0 10px;
          align-self:flex-start;
        }
        .rm-checkbox-label input[type="checkbox"] { width:16px; height:16px; margin:0; flex:0 0 auto; }
        .rm-checkbox-label span { line-height:1.3; }
        .rm-info-box {
          background:#fff7ed;
          border:1px solid #f3d4a8;
          border-left:4px solid #d97706;
          border-radius:6px;
          padding:10px 14px;
          margin:0 0 12px;
          color:#5b4636;
          font-size:13px;
          line-height:1.5;
        }
        .rm-info-box strong { color:#3a2a18; }
        .rm-enquiry-layout { display:grid; grid-template-columns:minmax(340px,1fr) minmax(340px,1fr); gap:12px; align-items:start; }
        .rm-placeholder { border:1px dashed #d7d1c6; border-radius:10px; padding:14px; color:#756c61; background:#fff; }
        .rm-detail-card h4 { margin:0 0 2px; font-size:16px; }
        .rm-subtitle { color:#756c61; font-size:12px; margin-bottom:10px; }
        .rm-detail-block { margin-bottom:10px; }
        .rm-detail-title { font-size:12px; text-transform:uppercase; letter-spacing:.4px; color:#756c61; margin-bottom:6px; font-weight:700; }
        .rm-table { width:100%; border-collapse:collapse; table-layout:fixed; border:1px solid #e5e3dc; border-radius:10px; overflow:hidden; }
        .rm-table td, .rm-table th { border-top:1px solid #efe9df; padding:7px 8px; text-align:left; font-size:13px; vertical-align:top; word-break:break-word; }
        .rm-table tr:first-child td, .rm-table tr:first-child th { border-top:0; }
        .rm-table td:first-child, .rm-table th:first-child { width:28%; color:#756c61; }
        .rm-note { border:1px solid #e5e3dc; border-radius:10px; padding:8px 10px; font-size:13px; background:#fff; white-space:pre-wrap; }
        .rm-guest-stack { display:grid; gap:8px; }
        .rm-guest-card { border:1px solid #e5e3dc; border-radius:10px; padding:8px; background:#fff; }
        .rm-guest-title { font-size:12px; color:#756c61; margin-bottom:6px; font-weight:700; text-transform:uppercase; letter-spacing:.35px; }
        .rm-intake-list { display:grid; gap:6px; }
        .rm-intake-item { border:1px solid #e5e3dc; border-radius:8px; padding:8px; background:#fff; }
        .rm-intake-q { font-size:12px; color:#756c61; margin-bottom:4px; }
        .rm-intake-a { font-size:13px; color:#2d2820; white-space:pre-wrap; }
        .rm-loading { margin-bottom:10px; color:#756c61; font-size:13px; }
        @media (max-width: 980px) {
          .rm-enquiry-layout { grid-template-columns:1fr; }
          .rm-inline-fields { grid-template-columns:1fr; }
        }
      </style>
      <div class="rm-wrap">
        ${this.loading ? '<div class="rm-loading">Loading...</div>' : ''}
        ${this.renderTabs()}
        ${this.renderGlobalError()}
        ${this.renderSessionsPanel()}
        ${this.renderFormPanel()}
        ${this.renderEnquiriesPanel()}
      </div>
    `;
    if (uiTab === 'sessions' || uiTab === 'form' || uiTab === 'enquiries') {
      this.bindEvents();
    }
    this.initDatePicker();
  }
}

if (!customElements.get('retreat-session-manager-ce')) {
  customElements.define('retreat-session-manager-ce', RetreatSessionManagerElement);
}
