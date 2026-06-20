class SessionManagerElement extends HTMLElement {
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
    this.emit('session-manager-init', {});
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

  /**
   * Admin-facing date/time (no raw ISO). Used for: Invoice sent at, Last update (booking details).
   */
  formatDisplayDateTime(value) {
    if (value == null || value === '') return '-';
    const raw = String(value).trim();
    if (!raw || raw === '-') return '-';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    try {
      return d.toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_e) {
      return raw;
    }
  }

  /**
   * Calendar date only (YYYY-MM-DD as local day; ISO datetimes use the instant’s local calendar date).
   * Used for: session ranges on cards, booking Session / Stay dates, “Filter by session” options.
   */
  formatDisplayDate(value) {
    if (value == null || value === '') return '-';
    const raw = String(value).trim();
    if (!raw || raw === '-') return '-';
    const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    let d;
    if (ymd) {
      const y = Number(ymd[1]);
      const m = Number(ymd[2]);
      const day = Number(ymd[3]);
      d = new Date(y, m - 1, day);
      if (d.getFullYear() !== y || d.getMonth() !== m - 1 || d.getDate() !== day) return raw;
    } else {
      d = new Date(raw);
      if (Number.isNaN(d.getTime())) return raw;
    }
    try {
      return d.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (_e) {
      return raw;
    }
  }

  /** Two calendar dates for ranges (subtitle lines, grids, selects). */
  formatDateRangeLabel(start, end) {
    const s = this.formatDisplayDate(start);
    const e = this.formatDisplayDate(end);
    if (s === '-' && e === '-') return '-';
    return `${s} → ${e}`;
  }

  formatMonthLabel(monthKey) {
    const raw = String(monthKey || '').trim();
    const match = /^(\d{4})-(\d{2})$/.exec(raw);
    if (!match) return raw || 'All months';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const d = new Date(year, month - 1, 1);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  formatTransferTypeLabel(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return '';
    if (s === 'airport') return 'Airport';
    if (s === 'bus') return 'Bus';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  buildBookingAddonsSummaryHtml(row = {}) {
    const parts = [];
    const participantsCount = Math.max(0, Number(row.participantsCount || 0));
    if (row.hasDinnerAddon) parts.push('Dinner');
    if (row.hasTransferAddon) {
      const rawSummary = String(row.transferSummaryLine || '').trim();
      const summaryForUi =
        participantsCount <= 1
          ? rawSummary.replace(/\s*(\||·)\s*together:\s*(yes|no)\s*$/i, '').trim()
          : rawSummary;
      const t = summaryForUi ? this.escapeHtml(summaryForUi) : '';
      parts.push(t ? `Transfer (${t})` : 'Transfer');
    }
    const hasExp =
      (Array.isArray(row.experienceLines) && row.experienceLines.length > 0) ||
      Number(row.experienceRequestsCount || 0) > 0;
    if (!parts.length) {
      if (hasExp) return '—';
      return 'None';
    }
    return parts.join(' · ');
  }

  renderBookingActivitiesSection(row = {}) {
    const lines = Array.isArray(row.experienceLines) ? row.experienceLines : [];
    const notes = String(row.activityRequestNotes || '').trim();
    if (!lines.length && !notes) return '';
    const items = lines
      .map((ex) => {
        const dateText = String(ex.preferredDate || '').trim();
        const title = this.escapeHtml(ex.title || ex.activityKey || 'Activity');
        const metaBits = [ex.categoryLabel, ex.priceLabel].map((x) => String(x || '').trim()).filter(Boolean);
        const chips = metaBits
          .map((text) => `<span class="sm-activity-chip">${this.escapeHtml(text)}</span>`)
          .join('');
        const note = String(ex.notes || '').trim()
          ? `<div class="sm-booking-subline">${this.escapeHtml(ex.notes)}</div>`
          : '';
        return `<article class="sm-activity-card">
          <div class="sm-activity-card-title">${title}</div>
          ${chips ? `<div class="sm-activity-card-chips">${chips}</div>` : ''}
          ${dateText ? `<div class="sm-booking-subline">Preferred date: ${this.escapeHtml(this.formatDisplayDate(dateText) || dateText)}</div>` : ''}
          ${note}
        </article>`;
      })
      .join('');
    return `
          <div class="sm-booking-block">
            <div class="sm-booking-block-title">Activities</div>
            ${notes ? `<div class="sm-booking-notes">${this.escapeHtml(notes)}</div>` : ''}
            ${lines.length ? `<div class="sm-activity-stack">${items}</div>` : ''}
          </div>`;
  }

  renderGuestDetailCard(g = {}) {
    const esc = (v) => this.escapeHtml(v);
    const kv = (label, val) => {
      const t = String(val || '').trim();
      if (!t) return '';
      return `<div class="sm-guest-kv"><span>${esc(label)}</span><b>${esc(t)}</b></div>`;
    };
    const kvGrid = (rows) => {
      const html = rows.filter(Boolean).join('');
      return html ? `<div class="sm-guest-kv-grid">${html}</div>` : '';
    };
    const idx = Number(g.index) || 1;
    const isContact = idx === 1;
    const contactSection = kvGrid([
      kv('Name', g.fullName),
      kv('Email', g.email),
      kv('Phone', g.phone),
    ]);
    const surfSection = kvGrid([
      kv('Requested activity', g.enquiryActivityKey),
      kv('Lesson format', g.lessonFormat),
      String(g.preferredDate || '').trim() ? kv('Preferred date', this.formatDisplayDate(g.preferredDate)) : '',
      kv('Surf level', g.surfLevel),
      kv('Surfed before', g.surfedBefore),
      kv('Water confidence', g.waterConfidence),
      kv('Surf goals', g.surfGoals),
      kv('Surf lesson request', g.surfLessonRequest),
      kv('Surf notes', g.surfNotes),
    ]);
    const arrivalSection = kvGrid([
      String(g.arrivalTransferType || '').trim()
        ? kv('Transfer type', this.formatTransferTypeLabel(g.arrivalTransferType))
        : '',
      kv('Arrival ref / flight', g.arrivalReference),
      String(g.arrivalTime || '').trim() ? kv('Arrival time', this.formatDisplayDateTime(g.arrivalTime)) : '',
    ]);
    const hasContent = contactSection || surfSection || arrivalSection;
    return `
            <article class="sm-guest-card${isContact ? ' sm-guest-card--contact' : ''}">
              <header class="sm-guest-card-head">
                <div class="sm-guest-card-title">Guest ${idx}</div>
                ${isContact ? '<span class="sm-guest-badge">Primary contact</span>' : ''}
              </header>
              ${
                hasContent
                  ? `${contactSection ? `<div class="sm-guest-section"><div class="sm-guest-section-title">Contact</div>${contactSection}</div>` : ''}
                     ${surfSection ? `<div class="sm-guest-section"><div class="sm-guest-section-title">Surf & activities</div>${surfSection}</div>` : ''}
                     ${arrivalSection ? `<div class="sm-guest-section"><div class="sm-guest-section-title">Arrival</div>${arrivalSection}</div>` : ''}`
                  : `<p class="sm-muted sm-booking-subline">No extra fields stored for this guest.</p>`
              }
            </article>`;
  }

  renderBookingGuestsSection(row = {}) {
    const guests = Array.isArray(row.bookingGuests) ? row.bookingGuests : [];
    if (!guests.length) return '';
    const title = guests.length <= 1 ? 'Guest / participant' : 'Guests / participants';
    const cards = guests.map((g) => this.renderGuestDetailCard(g)).join('');
    return `
          <div class="sm-booking-block">
            <div class="sm-booking-block-title">${this.escapeHtml(title)}</div>
            <div class="sm-booking-guest-stack">${cards}</div>
          </div>`;
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
      if (!document.getElementById('session-manager-flatpickr-css')) {
        const link = document.createElement('link');
        link.id = 'session-manager-flatpickr-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('session-manager-flatpickr-theme-css')) {
        const themeLink = document.createElement('link');
        themeLink.id = 'session-manager-flatpickr-theme-css';
        themeLink.rel = 'stylesheet';
        themeLink.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/airbnb.css';
        document.head.appendChild(themeLink);
      }
      if (!document.getElementById('session-manager-flatpickr-month-css')) {
        const monthCss = document.createElement('link');
        monthCss.id = 'session-manager-flatpickr-month-css';
        monthCss.rel = 'stylesheet';
        monthCss.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/style.css';
        document.head.appendChild(monthCss);
      }
      if (typeof window.monthSelectPlugin !== 'function') {
        try {
          await this.loadScript('https://cdn.jsdelivr.net/npm/flatpickr/dist/plugins/monthSelect/index.js');
        } catch (_err) {
          // Fallback to native <input type="month"> when month plugin is unavailable.
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
          if (node.getAttribute('data-field') === 'sessionStartDate') {
            this.applyAutoEndDateByMinimumDuration();
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
    this.updateSessionEndMinConstraint();
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

  getEffectiveMinimumNights() {
    const packageKey = this.querySelector('[data-field="packageKey"]')?.value || '';
    const selectedProduct =
      (Array.isArray(this.options.packageProducts) ? this.options.packageProducts : []).find(
        (row) => String(row.packageKey || '') === String(packageKey || '')
      ) || null;
    const durationMode = String(selectedProduct?.durationMode || 'fixed').toLowerCase();
    const defaultNights = Math.max(0, Number(selectedProduct?.defaultNights || 0));
    const minNights = Math.max(0, Number(selectedProduct?.minNights || 0));
    const nightsOverrideRaw = this.querySelector('[data-field="nightsOverride"]')?.value ?? '';
    const nightsOverride = Math.max(0, Number(nightsOverrideRaw || 0));

    if (nightsOverride > 0) return Math.round(nightsOverride);
    if (durationMode === 'fixed') return Math.max(1, Math.round(defaultNights || minNights || 1));
    return Math.max(1, Math.round(minNights || defaultNights || 1));
  }

  applyAutoEndDateByMinimumDuration() {
    const startInput = this.querySelector('[data-field="sessionStartDate"]');
    const endInput = this.querySelector('[data-field="sessionEndDate"]');
    if (!startInput || !endInput) return;
    const startDate = this.parseDateInput(startInput.value);
    if (!startDate) return;
    const minNights = this.getEffectiveMinimumNights();
    const nextEndDate = new Date(startDate);
    nextEndDate.setDate(nextEndDate.getDate() + Math.max(1, minNights));
    const endValue = this.formatDateInput(nextEndDate);
    endInput.value = endValue;
    if (endInput._flatpickr) endInput._flatpickr.setDate(endValue, true, 'Y-m-d');
    this.updateSessionEndMinConstraint();
  }

  updateSessionEndMinConstraint() {
    const startInput = this.querySelector('[data-field="sessionStartDate"]');
    const endInput = this.querySelector('[data-field="sessionEndDate"]');
    if (!startInput || !endInput) return;
    const startDate = this.parseDateInput(startInput.value);
    const minDate = startDate || null;
    endInput.setAttribute('min', minDate ? this.formatDateInput(minDate) : '');
    if (endInput._flatpickr) endInput._flatpickr.set('minDate', minDate);
  }

  clearFormValidationError() {
    this.formValidationError = '';
  }

  validateSessionDateRange(form = {}) {
    const startDate = this.parseDateInput(form.sessionStartDate);
    const endDate = this.parseDateInput(form.sessionEndDate);
    if (!startDate || !endDate) {
      return { ok: false, message: 'Start date and End date are required.' };
    }
    if (endDate <= startDate) {
      return { ok: false, message: 'End date must be later than Start date.' };
    }
    return { ok: true, message: '' };
  }

  readForm() {
    return {
      packageKey: this.querySelector('[data-field="packageKey"]')?.value || '',
      sessionStartDate: this.querySelector('[data-field="sessionStartDate"]')?.value || '',
      sessionEndDate: this.querySelector('[data-field="sessionEndDate"]')?.value || '',
      status: this.querySelector('[data-field="status"]')?.value || 'open',
      preBlockedDormBeds: this.querySelector('[data-field="preBlockedDormBeds"]')?.value ?? '',
      nightsOverride: this.querySelector('[data-field="nightsOverride"]')?.value ?? '',
      minParticipantsSnapshot: this.querySelector('[data-field="minParticipantsSnapshot"]')?.value || '',
      maxParticipantsSnapshot: this.querySelector('[data-field="maxParticipantsSnapshot"]')?.value || '',
    };
  }

  bindEvents() {
    this.querySelector('#btnNavSessions')?.addEventListener('click', () => {
      this.emit('session-manager-nav', { tab: 'sessions' });
    });
    this.querySelector('#btnNavForm')?.addEventListener('click', () => {
      this.emit('session-manager-nav', { tab: 'form' });
    });
    this.querySelector('#btnNavBookings')?.addEventListener('click', () => {
      this.emit('session-manager-nav', { tab: 'bookings' });
    });

    const emitSessionListRefresh = () => {
      this.emit('session-manager-refresh', {
        filters: {
          packageKey: this.querySelector('[data-filter="packageKey"]')?.value || '',
          monthKey: this.querySelector('[data-filter="monthKey"]')?.value || '',
          status: this.querySelector('[data-filter="status"]')?.value || '',
        },
      });
    };

    this.querySelector('#btnRefresh')?.addEventListener('click', emitSessionListRefresh);

    this.querySelectorAll('[data-filter-package-tag]').forEach((node) => {
      node.addEventListener('click', () => {
        const nextPackageKey = String(node.getAttribute('data-filter-package-tag') || '');
        const packageInput = this.querySelector('[data-filter="packageKey"]');
        if (packageInput) packageInput.value = nextPackageKey;
        emitSessionListRefresh();
      });
    });
    this.querySelector('[data-filter="monthKey"]')?.addEventListener('change', emitSessionListRefresh);
    this.querySelector('[data-action="clear-month-filter"]')?.addEventListener('click', () => {
      const monthInput = this.querySelector('[data-filter="monthKey"]');
      if (monthInput) monthInput.value = '';
      emitSessionListRefresh();
    });
    this.querySelector('[data-filter="status"]')?.addEventListener('change', emitSessionListRefresh);

    this.querySelector('#btnCreateNew')?.addEventListener('click', () => {
      this.clearFormValidationError();
      this.emit('session-manager-new', {});
    });

    const emitBookingsListRefresh = () => {
      this.emit('session-manager-bookings-refresh', {
        filters: {
          packageKey: this.querySelector('[data-booking-filter="packageKey"]')?.value || '',
          packageSessionId: this.querySelector('[data-booking-filter="packageSessionId"]')?.value || '',
          status: this.querySelector('[data-booking-filter="status"]')?.value || '',
        },
      });
    };

    this.querySelector('#btnRefreshBookings')?.addEventListener('click', emitBookingsListRefresh);

    this.querySelector('[data-booking-filter="packageKey"]')?.addEventListener('change', emitBookingsListRefresh);
    this.querySelector('[data-booking-filter="packageSessionId"]')?.addEventListener('change', emitBookingsListRefresh);
    this.querySelector('[data-booking-filter="status"]')?.addEventListener('change', emitBookingsListRefresh);

    this.querySelector('[data-field="sessionStartDate"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
      this.applyAutoEndDateByMinimumDuration();
    });
    this.querySelector('[data-field="sessionEndDate"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
      this.updateSessionEndMinConstraint();
    });
    this.querySelector('[data-field="packageKey"]')?.addEventListener('change', () => {
      this.clearFormValidationError();
      this.applyAutoEndDateByMinimumDuration();
      const packageKey = this.querySelector('[data-field="packageKey"]')?.value || '';
      this.emit('session-manager-package-change', { packageKey });
    });
    this.querySelector('[data-field="nightsOverride"]')?.addEventListener('input', () => {
      this.clearFormValidationError();
      this.applyAutoEndDateByMinimumDuration();
    });

    this.querySelector('#btnSaveSession')?.addEventListener('click', () => {
      const form = this.readForm();
      const validation = this.validateSessionDateRange(form);
      if (!validation.ok) {
        this.formValidationError = validation.message;
        this.render();
        this.initDatePicker();
        return;
      }
      this.clearFormValidationError();
      this.emit('session-manager-save', {
        mode: this.state.editorMode || 'create',
        sessionId: this.state.selectedSessionId || '',
        form,
      });
    });

    this.querySelector('#btnPreviewOverride')?.addEventListener('click', () => {
      this.clearFormValidationError();
      const form = this.readForm();
      this.emit('session-manager-preview', {
        sessionId: this.state.selectedSessionId || '',
        packageKey: form.packageKey,
        preBlockedDormBeds: form.preBlockedDormBeds,
      });
    });

    const editButtons = this.querySelectorAll('[data-action="edit-session"]');
    for (const btn of editButtons) {
      btn.addEventListener('click', () => {
        this.emit('session-manager-edit', { sessionId: btn.getAttribute('data-session-id') || '' });
      });
    }

    const statusButtons = this.querySelectorAll('[data-action="toggle-status"]');
    for (const btn of statusButtons) {
      btn.addEventListener('click', () => {
        this.emit('session-manager-status', {
          sessionId: btn.getAttribute('data-session-id') || '',
          status: btn.getAttribute('data-next-status') || 'open',
        });
      });
    }

    const openBookingsButtons = this.querySelectorAll('[data-action="open-bookings"]');
    for (const btn of openBookingsButtons) {
      btn.addEventListener('click', () => {
        this.emit('session-manager-open-bookings', {
          sessionId: btn.getAttribute('data-session-id') || '',
          packageKey: btn.getAttribute('data-package-key') || '',
        });
      });
    }

    const deleteSessionButtons = this.querySelectorAll('[data-action="delete-session"]');
    for (const btn of deleteSessionButtons) {
      btn.addEventListener('click', () => {
        this.emit('session-manager-delete-session', {
          sessionId: btn.getAttribute('data-session-id') || '',
        });
      });
    }

    const bookingActionButtons = this.querySelectorAll('[data-action="booking-action"]');
    for (const btn of bookingActionButtons) {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-booking-action') || '';
        const bookingId = btn.getAttribute('data-booking-id') || '';
        const card = btn.closest('[data-booking-card]');
        const paymentLink =
          card?.querySelector('[data-booking-payment-link]') instanceof HTMLInputElement
            ? card.querySelector('[data-booking-payment-link]').value || ''
            : '';
        const note =
          card?.querySelector('[data-booking-note]') instanceof HTMLTextAreaElement
            ? card.querySelector('[data-booking-note]').value || ''
            : '';
        const refundCompleted =
          card?.querySelector('[data-booking-refund]') instanceof HTMLInputElement
            ? !!card.querySelector('[data-booking-refund]').checked
            : false;
        this.emit('session-manager-booking-action', {
          action,
          bookingId,
          paymentLink,
          note,
          refundCompleted,
        });
      });
    }
  }

  renderSessionCard(row = {}) {
    const packageTitle = row.packageTitle || row.packageKey || '-';
    const dateRange = this.formatDateRangeLabel(row.sessionStartDate, row.sessionEndDate);
    const durationText = `${row.nights || 0} nights (${row.durationLabel || 'no duration rule'})`;
    const overrideText = row.nightsOverride != null ? String(row.nightsOverride) : '-';
    const minMax = row.participantsSummary || `${row.minParticipants || '-'}-${row.maxParticipants || '-'}`;
    const statusText = row.statusLabel || (row.status === 'closed' ? 'Closed' : 'Open for bookings');
    return `
      <article class="sm-session-card">
        <div class="sm-session-head">
          <div>
            <p class="sm-session-title">${packageTitle}</p>
            <p class="sm-session-subtitle">${dateRange}</p>
          </div>
          <span class="sm-badge ${row.status || ''}">${statusText}</span>
        </div>
        <div class="sm-kv-grid">
          <div class="sm-kv"><span>Duration</span><b>${durationText}</b></div>
          <div class="sm-kv"><span>Duration override</span><b>${overrideText}</b></div>
          <div class="sm-kv"><span>Participants</span><b>${minMax}</b></div>
          <div class="sm-kv"><span>Dorm beds reserved</span><b>${row.effectivePreBlockedDormBeds ?? '-'}</b></div>
        </div>
        ${
          row.hasDurationMismatch
            ? `<div class="sm-error sm-inline-error">${row.durationMismatchMessage || 'Duration does not match package settings.'}</div>`
            : ''
        }
        <div class="sm-actions">
          <button data-action="edit-session" data-session-id="${row.sessionId || ''}" class="secondary">Edit session</button>
          <button
            data-action="open-bookings"
            data-session-id="${row.sessionId || ''}"
            data-package-key="${row.packageKey || ''}"
            class="secondary"
          >
            View bookings
          </button>
          <button
            data-action="toggle-status"
            data-session-id="${row.sessionId || ''}"
            data-next-status="${row.status === 'open' ? 'closed' : 'open'}"
            class="secondary"
          >
            ${row.status === 'open' ? 'Close bookings' : 'Re-open bookings'}
          </button>
          <button data-action="delete-session" data-session-id="${row.sessionId || ''}" class="danger">Delete session</button>
        </div>
      </article>
    `;
  }

  renderBookingCard(row = {}) {
    const dateRange =
      row.checkInDate && row.checkOutDate ? this.formatDateRangeLabel(row.checkInDate, row.checkOutDate) : '-';
    const canSendPaymentLink = row.canSendPaymentLink !== false;
    const canMarkPaid = row.canMarkPaid === true;
    const canMarkUnpaid = row.canMarkUnpaid === true;
    const canCancel = row.canCancel !== false;
    const invoiceStatusText = row.invoiceStatus || 'not sent';
    const lifecycleHint = !row.manualPaymentLink
      ? 'Send payment link first. Then use Mark as paid / Mark as unpaid / Cancel booking.'
      : 'Payment link exists. Use Mark as paid / Mark as unpaid / Cancel booking as needed.';
    const addonsSummary = this.buildBookingAddonsSummaryHtml(row);
    const activitiesSection = this.renderBookingActivitiesSection(row);
    const guestsSection = this.renderBookingGuestsSection(row);
    const participantsCount = Math.max(0, Number(row.participantsCount || 0));
    const sharedArrivalTitle = participantsCount <= 1 ? 'Arrival details' : 'Group transfer (shared)';
    const sharedArrival =
      row.hasTransferAddon && String(row.sharedArrivalLine || '').trim()
        ? `<div class="sm-booking-shared-arrival"><strong>${this.escapeHtml(sharedArrivalTitle)}</strong> ${this.escapeHtml(
            row.sharedArrivalLine
          )}</div>`
        : '';
    return `
      <article class="sm-session-card" data-booking-card data-booking-id="${row.bookingId || ''}">
        <div class="sm-session-head">
          <div>
            <p class="sm-session-title">${this.escapeHtml(row.guestName || 'Guest name not provided')}</p>
            <p class="sm-session-subtitle">${this.escapeHtml(row.guestEmail || '-')}${
      row.guestPhone ? ` · ${this.escapeHtml(row.guestPhone)}` : ''
    }</p>
          </div>
          <span class="sm-badge ${row.status || ''}">${this.escapeHtml(row.statusLabel || row.status || '-')}</span>
        </div>
        <div class="sm-kv-grid">
          <div class="sm-kv"><span>Booking ID</span><b>${this.escapeHtml(row.bookingId || '-')}</b></div>
          <div class="sm-kv"><span>Package</span><b>${this.escapeHtml(row.packageTitle || row.packageKey || '-')}</b></div>
          <div class="sm-kv"><span>Session</span><b>${this.formatDateRangeLabel(row.sessionStartDate, row.sessionEndDate)}</b></div>
          <div class="sm-kv"><span>Participants</span><b>${row.participantsCount ?? 0}</b></div>
          <div class="sm-kv"><span>Stay dates</span><b>${dateRange}</b></div>
          <div class="sm-kv">
            <span>Add-ons (core)</span>
            <b>${addonsSummary}</b>
          </div>
        </div>
        <details class="sm-booking-details">
          <summary>
            <span class="sm-booking-details-label-closed">View booking details</span>
            <span class="sm-booking-details-label-open">Hide details</span>
          </summary>
          <div class="sm-booking-details-grid">
            <div class="sm-kv"><span>Room lines in booking</span><b>${row.roomSelectionsCount || 0}</b></div>
            <div class="sm-kv"><span>Invoice status</span><b>${this.escapeHtml(invoiceStatusText)}</b></div>
            <div class="sm-kv"><span>Invoice sent at</span><b>${this.formatDisplayDateTime(row.invoiceSentAt)}</b></div>
            <div class="sm-kv"><span>Invoice sent by</span><b>${this.escapeHtml(row.invoiceSentBy || '-')}</b></div>
            <div class="sm-kv"><span>Payment due at</span><b>${this.formatDisplayDateTime(row.paymentDueAt)}</b></div>
            <div class="sm-kv"><span>Reminder sent at</span><b>${this.formatDisplayDateTime(row.paymentReminderSentAt)}</b></div>
            <div class="sm-kv"><span>Reminder count</span><b>${Math.max(0, Number(row.paymentReminderCount || 0))}</b></div>
            <div class="sm-kv"><span>Refund completed</span><b>${row.refundCompleted ? 'Yes' : 'No'}</b></div>
            <div class="sm-kv"><span>Last update</span><b>${this.formatDisplayDateTime(row.updatedAt)}</b></div>
            ${
              String(row.dietaryNotes || '').trim()
                ? `<div class="sm-kv sm-kv-span-2"><span>Dietary / allergy notes</span><b>${this.escapeHtml(
                    row.dietaryNotes
                  )}</b></div>`
                : ''
            }
          </div>
          ${sharedArrival}
          ${activitiesSection}
          ${guestsSection}
          <div class="sm-info">${this.escapeHtml(lifecycleHint)}</div>
          <div class="sm-row sm-booking-input-row">
            <label>Payment link for guest
              <input data-booking-payment-link type="text" placeholder="https://your-provider.com/pay/..." value="${this.escapeHtml(
                row.manualPaymentLink || ''
              )}" />
            </label>
            <label>Admin note
              <textarea data-booking-note rows="2" placeholder="Optional note for this booking.">${this.escapeHtml(
                row.adminNotes || ''
              )}</textarea>
            </label>
            <label class="sm-checkbox">
              <input data-booking-refund type="checkbox" ${row.refundCompleted ? 'checked' : ''} />
              Refund completed (manual)
            </label>
          </div>
          <div class="sm-actions">
            ${
              canSendPaymentLink
                ? `<button data-action="booking-action" data-booking-action="send_payment_link" data-booking-id="${row.bookingId || ''}" class="primary">Send payment link</button>`
                : ''
            }
            ${
              canMarkPaid
                ? `<button data-action="booking-action" data-booking-action="mark_paid" data-booking-id="${row.bookingId || ''}" class="ok">Mark as paid</button>`
                : ''
            }
            ${
              canMarkUnpaid
                ? `<button data-action="booking-action" data-booking-action="mark_unpaid" data-booking-id="${row.bookingId || ''}" class="warn">Mark as unpaid</button>`
                : ''
            }
            ${
              canCancel
                ? `<button data-action="booking-action" data-booking-action="cancel" data-booking-id="${row.bookingId || ''}" class="danger">Cancel booking</button>`
                : ''
            }
          </div>
        </details>
      </article>
    `;
  }

  render() {
    const products = Array.isArray(this.options.packageProducts) ? this.options.packageProducts : [];
    const sessions = Array.isArray(this.options.sessions) ? this.options.sessions : [];
    const filters = this.state.filters || {};
    const form = this.state.form || {};
    const editorMode = this.state.editorMode || 'create';
    const uiTab = this.state.uiTab === 'form' || this.state.uiTab === 'bookings' ? this.state.uiTab : 'sessions';
    const preview = this.state.overridePreview || null;
    const bookings = Array.isArray(this.options.bookings) ? this.options.bookings : [];
    const bookingFilters = this.state.bookingFilters || {};
    const selectedProduct =
      products.find((row) => String(row.packageKey || '') === String(form.packageKey || '')) || products[0] || null;
    const durationMode = String(selectedProduct?.durationMode || 'fixed');
    const defaultNights = Number(selectedProduct?.defaultNights || 0);
    const minNights = Number(selectedProduct?.minNights || defaultNights || 0);
    const maxNights = Number(selectedProduct?.maxNights || defaultNights || minNights || 0);
    const durationHint =
      durationMode === 'fixed'
        ? `Package duration: fixed at ${defaultNights || '-'} nights.`
        : `Package duration: flexible ${minNights || '-'}-${maxNights || '-'} nights.`;

    this.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .sm-wrap {
          font-family: Inter, "Avenir Next", Arial, sans-serif;
          color: #1a2332;
          background: #fff;
          border: 1px solid #e4e9f2;
          border-radius: 16px;
          padding: 24px;
          position: relative;
          -webkit-font-smoothing: antialiased;
          line-height: 1.5;
        }
        .sm-nav { display: flex; gap: 6px; margin-bottom: 20px; flex-wrap: wrap; }
        .sm-nav-btn {
          border: 1px solid #d4dae6;
          border-radius: 10px;
          padding: 9px 16px;
          background: #f8fafc;
          color: #3b4a61;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          line-height: 1;
        }
        .sm-nav-btn:hover { background: #eef1f7; border-color: #bcc5d4; }
        .sm-nav-btn.active { background: #de7a45; color: #fff; border-color: #de7a45; box-shadow: 0 1px 3px rgba(222,122,69,0.25); }
        .sm-grid { display: grid; grid-template-columns: 1fr; gap: 20px; }
        .sm-card { border: 1px solid #e4e9f2; border-radius: 14px; padding: 20px; background: #fff; }
        .sm-title { font-size: 18px; font-weight: 700; margin: 0; line-height: 1.3; color: #1a2332; }
        .sm-subtitle { margin: 4px 0 16px; color: #5a6a82; font-size: 13px; line-height: 1.4; }
        .sm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .sm-filter-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .sm-filter-tag {
          border: 1px solid #d4dae6;
          border-radius: 999px;
          padding: 7px 12px;
          background: #f8fafc;
          color: #3b4a61;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          line-height: 1;
        }
        .sm-filter-tag.active {
          background: #de7a45;
          border-color: #de7a45;
          color: #fff;
        }
        .sm-filter-tag:hover { background: #eef1f7; border-color: #bcc5d4; }
        .sm-filter-tag.active:hover { background: #c96a38; border-color: #c96a38; }
        label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 500; color: #5a6a82; letter-spacing: 0.01em; }
        input, select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d4dae6;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 14px;
          background: #fff;
          color: #1a2332;
          font-family: inherit;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          line-height: 1.4;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #de7a45;
          box-shadow: 0 0 0 3px rgba(222,122,69,0.1);
        }
        select.sm-status-readonly:disabled {
          cursor: not-allowed;
          background: #f5f7fb;
          color: #3b4a61;
          opacity: 1;
        }
        input::placeholder, textarea::placeholder { color: #9ba7b8; }
        button {
          border: 0;
          border-radius: 10px;
          padding: 9px 16px;
          background: #de7a45;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          line-height: 1;
          white-space: nowrap;
        }
        button:hover:not(:disabled) { background: #c96a38; }
        button.secondary { background: #f5f7fb; color: #3b4a61; border: 1px solid #d4dae6; }
        button.secondary:hover:not(:disabled) { background: #eaeff7; border-color: #bcc5d4; }
        button.primary { background: #1f5fff; color: #fff; }
        button.primary:hover:not(:disabled) { background: #1750e0; }
        button.ok { background: #0d7c4a; color: #fff; }
        button.ok:hover:not(:disabled) { background: #0a6b3f; }
        button.warn { background: #c07300; color: #fff; }
        button.warn:hover:not(:disabled) { background: #a86500; }
        button.danger { background: #c93a3a; color: #fff; }
        button.danger:hover:not(:disabled) { background: #b02e2e; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        .sm-actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
        .sm-form-actions { margin-bottom: 14px; }
        .sm-list-actions { margin-top: 6px; margin-bottom: 18px; }
        .sm-error { margin-top: 10px; color: #b42318; font-size: 13px; font-weight: 500; line-height: 1.4; }
        .sm-inline-error { margin-top: 12px; }
        .sm-info {
          margin-top: 12px;
          color: #1e4fad;
          font-size: 13px;
          background: #eef4ff;
          border: 1px solid #d1e0ff;
          border-radius: 10px;
          padding: 10px 14px;
          line-height: 1.4;
        }
        .sm-section-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 14px; }
        .sm-badge {
          display: inline-block;
          padding: 3px 12px;
          border-radius: 100px;
          font-size: 11px;
          font-weight: 600;
          background: #eef2f6;
          color: #344054;
          letter-spacing: 0.01em;
        }
        .sm-badge.open { background: #ecfdf3; color: #067647; }
        .sm-badge.closed { background: #fef3f2; color: #b42318; }
        .sm-session-list { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 4px; }
        .sm-session-card {
          border: 1px solid #e4e9f2;
          border-radius: 14px;
          padding: 16px 18px;
          background: #fafbfd;
          transition: box-shadow 0.15s ease;
        }
        .sm-session-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .sm-session-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .sm-session-title { margin: 0; font-weight: 700; font-size: 15px; line-height: 1.3; color: #1a2332; }
        .sm-session-subtitle { margin: 3px 0 0; color: #5a6a82; font-size: 13px; }
        .sm-kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
        .sm-kv {
          border: 1px solid #e8edf5;
          border-radius: 10px;
          padding: 9px 12px;
          background: #fff;
        }
        .sm-kv span { display: block; color: #6b7a90; font-size: 11px; font-weight: 500; margin-bottom: 3px; letter-spacing: 0.02em; text-transform: uppercase; }
        .sm-kv b { font-size: 13px; color: #1a2332; font-weight: 600; }
        .sm-empty {
          color: #5a6a82;
          border: 1px dashed #d4dae6;
          border-radius: 14px;
          padding: 28px 20px;
          text-align: center;
          background: #fafbfd;
          font-size: 14px;
        }
        .sm-booking-details { margin-top: 14px; border-top: 1px solid #e8edf5; padding-top: 14px; }
        .sm-booking-details summary {
          cursor: pointer;
          color: #1e4fad;
          font-size: 13px;
          font-weight: 600;
          list-style: none;
          padding: 4px 0;
        }
        .sm-booking-details summary:hover { color: #de7a45; }
        .sm-booking-details summary::-webkit-details-marker { display: none; }
        .sm-booking-details:not([open]) .sm-booking-details-label-open { display: none; }
        .sm-booking-details[open] .sm-booking-details-label-closed { display: none; }
        .sm-booking-details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
        .sm-booking-details-grid .sm-kv-span-2 { grid-column: 1 / -1; }
        .sm-muted { color: #6b7a90; font-size: 12px; font-weight: 500; }
        .sm-booking-shared-arrival {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #f4f7fc;
          border: 1px solid #e8edf5;
          font-size: 13px;
          color: #1a2332;
        }
        .sm-booking-block { margin-top: 16px; }
        .sm-booking-block-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #5a6a82;
          margin-bottom: 8px;
        }
        .sm-booking-notes {
          font-size: 13px;
          color: #1a2332;
          margin-bottom: 8px;
          line-height: 1.45;
        }
        .sm-booking-list {
          margin: 0;
          padding-left: 18px;
          color: #1a2332;
          font-size: 13px;
          line-height: 1.45;
        }
        .sm-booking-list li { margin-bottom: 6px; }
        .sm-booking-subline {
          margin-top: 4px;
          font-size: 12px;
          color: #5a6a82;
        }
        .sm-booking-guest-stack { display: flex; flex-direction: column; gap: 12px; }
        .sm-guest-card {
          border: 1px solid #e8edf5;
          border-radius: 12px;
          padding: 12px 14px;
          background: #fff;
        }
        .sm-guest-card--contact {
          border-color: #c8d8ff;
          background: linear-gradient(180deg, #f8faff 0%, #fff 100%);
        }
        .sm-guest-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .sm-guest-card-title {
          font-weight: 700;
          font-size: 14px;
          color: #1a2332;
        }
        .sm-guest-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #294f9f;
          background: #eef3ff;
          border-radius: 999px;
          padding: 3px 8px;
        }
        .sm-guest-section {
          padding-top: 12px;
          margin-top: 12px;
          border-top: 1px solid #eef1f6;
        }
        .sm-guest-section-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #8a96a8;
          margin-bottom: 8px;
        }
        .sm-guest-kv-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px 14px;
        }
        .sm-guest-kv span {
          display: block;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #6b7a90;
          margin-bottom: 2px;
        }
        .sm-guest-kv b { font-size: 13px; font-weight: 600; color: #1a2332; word-break: break-word; }
        .sm-activity-stack { display: grid; gap: 8px; }
        .sm-activity-card {
          border: 1px solid #e8edf5;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fafbfd;
        }
        .sm-activity-card-title { font-size: 13px; font-weight: 700; color: #1a2332; margin-bottom: 4px; }
        .sm-activity-card-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
        .sm-activity-chip {
          display: inline-flex;
          border-radius: 999px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          background: #eef3ff;
          color: #294f9f;
        }
        .sm-booking-input-row { margin-top: 14px; }
        .sm-booking-input-row .sm-checkbox {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          margin-top: 0;
          font-size: 13px;
          color: #3b4a61;
        }
        .sm-booking-input-row .sm-checkbox input[type="checkbox"] {
          width: 16px;
          height: 16px;
          margin: 0;
        }
        textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d4dae6;
          border-radius: 10px;
          padding: 9px 12px;
          font-size: 14px;
          background: #fff;
          color: #1a2332;
          resize: vertical;
          min-height: 64px;
          font-family: inherit;
          line-height: 1.4;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sm-loading {
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.7);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
          color: #5a6a82;
          border-radius: 16px;
          z-index: 10;
        }

        @media (max-width: 768px) {
          .sm-wrap { padding: 16px; }
          .sm-card { padding: 16px; }
          .sm-row { grid-template-columns: 1fr; gap: 10px; }
          .sm-kv-grid { grid-template-columns: 1fr; }
          .sm-booking-details-grid { grid-template-columns: 1fr; }
          .sm-guest-kv-grid { grid-template-columns: 1fr; }
          .sm-session-head { flex-direction: column; gap: 8px; }
          .sm-actions { gap: 8px; }
          .sm-actions button { flex: 1 1 auto; min-width: 0; }
        }
      </style>
      <div class="sm-wrap">
        <div class="sm-nav">
          <button id="btnNavSessions" class="sm-nav-btn ${uiTab === 'sessions' ? 'active' : ''}" ${this.loading ? 'disabled' : ''}>Created sessions</button>
          <button id="btnNavForm" class="sm-nav-btn ${uiTab === 'form' ? 'active' : ''}" ${this.loading ? 'disabled' : ''}>
            ${editorMode === 'edit' ? 'Edit session' : 'Create session'}
          </button>
          <button id="btnNavBookings" class="sm-nav-btn ${uiTab === 'bookings' ? 'active' : ''}" ${this.loading ? 'disabled' : ''}>Bookings / applications</button>
        </div>
        <div class="sm-grid">
          ${
            uiTab === 'form'
              ? `<section class="sm-card">
            <h3 class="sm-title">${editorMode === 'edit' ? 'Edit package session' : 'Create package session'}</h3>
            <p class="sm-subtitle">Set dates, participant limits and optional overrides for this session.</p>
            <div class="sm-row">
              <label>Package
                <select data-field="packageKey">
                  ${products
                    .map((x) => {
                      const selected = String(form.packageKey || '') === String(x.packageKey || '') ? 'selected' : '';
                      return `<option value="${x.packageKey || ''}" ${selected}>${x.title || x.packageKey || ''}</option>`;
                    })
                    .join('')}
                </select>
              </label>
              <label>Booking status
                ${
                  editorMode === 'edit'
                    ? `<select data-field="status">
                  <option value="open" ${String(form.status || 'open') === 'open' ? 'selected' : ''}>Open for bookings</option>
                  <option value="closed" ${String(form.status || 'open') === 'closed' ? 'selected' : ''}>Closed</option>
                </select>`
                    : `<select data-field="status" class="sm-status-readonly" disabled title="New sessions are always created as open. Change status later from the session list if needed.">
                  <option value="open" selected>Open for bookings</option>
                </select>`
                }
              </label>
            </div>
            <div class="sm-row">
              <label>Session start date
                <input class="js-date-input" data-date-picker data-min-today="false" data-field="sessionStartDate" type="text" placeholder="YYYY-MM-DD" value="${
                  form.sessionStartDate || ''
                }" />
              </label>
              <label>Session end date
                <input class="js-date-input" data-date-picker data-min-today="false" data-field="sessionEndDate" type="text" placeholder="YYYY-MM-DD" value="${
                  form.sessionEndDate || ''
                }" />
              </label>
            </div>
            <p class="sm-muted">Session end date must be later than session start date.</p>
            <div class="sm-row">
              <label>Dorm beds reserved (override)
                <input data-field="preBlockedDormBeds" type="number" min="0" step="1" value="${form.preBlockedDormBeds ?? ''}" />
              </label>
              <label>Duration override (nights)
                <input data-field="nightsOverride" type="number" min="1" step="1" placeholder="leave empty for package defaults" value="${
                  form.nightsOverride ?? ''
                }" />
              </label>
            </div>
            <div class="sm-row">
              <label>Minimum participants for this session
                <input data-field="minParticipantsSnapshot" type="number" min="1" step="1" value="${
                  form.minParticipantsSnapshot ?? ''
                }" />
              </label>
              <label>Maximum participants for this session
                <input data-field="maxParticipantsSnapshot" type="number" min="1" step="1" value="${
                  form.maxParticipantsSnapshot ?? ''
                }" />
              </label>
            </div>
            <div class="sm-actions sm-form-actions">
              <button id="btnSaveSession" ${this.loading ? 'disabled' : ''}>Save session</button>
              <button id="btnPreviewOverride" class="secondary" ${this.loading ? 'disabled' : ''}>Preview dorm override</button>
              <button id="btnCreateNew" class="secondary" ${this.loading ? 'disabled' : ''}>Clear form</button>
            </div>
            <div class="sm-info">${durationHint} Leave duration override empty to follow package settings.</div>
            ${
              preview
                ? `<div class="sm-info">Effective dorm beds reserved: <b>${preview.effectivePreBlockedDormBeds}</b> (session override: ${
                    preview.sessionOverridePreBlockedDormBeds ?? 'not set'
                  }, package default: ${preview.productDefaultPreBlockedDormBeds ?? 0}).</div>`
                : ''
            }
            ${this.formValidationError ? `<div class="sm-error">${this.escapeHtml(this.formValidationError)}</div>` : ''}
            ${this.errors.form ? `<div class="sm-error">${this.errors.form}</div>` : ''}
          </section>`
              : ''
          }

          ${
            uiTab === 'sessions'
              ? `<section class="sm-card">
            <div class="sm-section-head">
              <div>
                <h3 class="sm-title">Package sessions</h3>
                <p class="sm-subtitle">Review active configuration and quickly edit/open/close each session.</p>
              </div>
            </div>
            <input type="hidden" data-filter="packageKey" value="${this.escapeHtml(String(filters.packageKey || ''))}" />
            <div>
              <label>Filter by package</label>
              <div class="sm-filter-tags">
                <button type="button" class="sm-filter-tag ${!filters.packageKey ? 'active' : ''}" data-filter-package-tag="">All packages</button>
                ${products
                  .map((x) => {
                    const active = String(filters.packageKey || '') === String(x.packageKey || '');
                    return `<button type="button" class="sm-filter-tag ${active ? 'active' : ''}" data-filter-package-tag="${this.escapeHtml(
                      x.packageKey || ''
                    )}">${this.escapeHtml(x.title || x.packageKey || '')}</button>`;
                  })
                  .join('')}
              </div>
            </div>
            <div class="sm-row">
              <label>Filter by month
                <input data-filter="monthKey" data-month-picker type="month" value="${this.escapeHtml(
                  String(filters.monthKey || '')
                )}" />
              </label>
              <label>Filter by status
                <select data-filter="status">
                  <option value="" ${!filters.status ? 'selected' : ''}>Any status</option>
                  <option value="open" ${filters.status === 'open' ? 'selected' : ''}>Open</option>
                  <option value="closed" ${filters.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
              </label>
            </div>
            <div class="sm-actions sm-list-actions">
              <button type="button" class="secondary" data-action="clear-month-filter" ${this.loading ? 'disabled' : ''}>All months</button>
              <button id="btnRefresh" class="secondary" ${this.loading ? 'disabled' : ''}>Refresh list</button>
            </div>

            <div class="sm-session-list">
              ${
                sessions.length
                  ? sessions.map((row) => this.renderSessionCard(row)).join('')
                  : '<div class="sm-empty">No sessions found for the selected filters.</div>'
              }
            </div>
            ${this.errors.global ? `<div class="sm-error">${this.errors.global}</div>` : ''}
          </section>`
              : ''
          }
          ${
            uiTab === 'bookings'
              ? `<section class="sm-card">
            <div class="sm-section-head">
              <div>
                <h3 class="sm-title">Package bookings</h3>
                <p class="sm-subtitle">Review who has submitted package reservations and current processing status.</p>
              </div>
            </div>
            <div class="sm-row">
              <label>Filter by package
                <select data-booking-filter="packageKey">
                  <option value="">All packages</option>
                  ${products
                    .map((x) => {
                      const selected =
                        String(bookingFilters.packageKey || '') === String(x.packageKey || '') ? 'selected' : '';
                      return `<option value="${x.packageKey || ''}" ${selected}>${x.title || x.packageKey || ''}</option>`;
                    })
                    .join('')}
                </select>
              </label>
              <label>Filter by session
                <select data-booking-filter="packageSessionId">
                  <option value="">All sessions</option>
                  ${sessions
                    .map((x) => {
                      const selected =
                        String(bookingFilters.packageSessionId || '') === String(x.sessionId || '') ? 'selected' : '';
                      return `<option value="${x.sessionId || ''}" ${selected}>${x.packageTitle || x.packageKey || ''} · ${this.formatDateRangeLabel(
                        x.sessionStartDate,
                        x.sessionEndDate
                      )}</option>`;
                    })
                    .join('')}
                </select>
              </label>
            </div>
            <div class="sm-row">
              <label>Filter by booking status
                <select data-booking-filter="status">
                  <option value="" ${!bookingFilters.status ? 'selected' : ''}>Any status</option>
                  <option value="pending_hold" ${
                    bookingFilters.status === 'pending_hold' ? 'selected' : ''
                  }>Pending hold</option>
                  <option value="pending_admin_review" ${
                    bookingFilters.status === 'pending_admin_review' ? 'selected' : ''
                  }>Pending admin review</option>
                  <option value="awaiting_manual_payment" ${
                    bookingFilters.status === 'awaiting_manual_payment' ? 'selected' : ''
                  }>Awaiting manual payment</option>
                  <option value="manually_paid" ${bookingFilters.status === 'manually_paid' ? 'selected' : ''}>Manually paid</option>
                  <option value="confirmed" ${bookingFilters.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                  <option value="cancelled" ${bookingFilters.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  <option value="released" ${bookingFilters.status === 'released' ? 'selected' : ''}>Released</option>
                </select>
              </label>
              <label> </label>
            </div>
            <div class="sm-actions sm-list-actions">
              <button id="btnRefreshBookings" class="secondary" ${this.loading ? 'disabled' : ''}>Refresh bookings</button>
            </div>
            <div class="sm-session-list">
              ${
                bookings.length
                  ? bookings.map((row) => this.renderBookingCard(row)).join('')
                  : '<div class="sm-empty">No package bookings found for selected filters.</div>'
              }
            </div>
            ${this.errors.global ? `<div class="sm-error">${this.errors.global}</div>` : ''}
          </section>`
              : ''
          }
        </div>
        ${this.loading ? '<div class="sm-loading">Loading...</div>' : ''}
      </div>
    `;

    this.bindEvents();
    this.bindDatePickerInstances();
  }
}

if (!customElements.get('session-manager-ce')) {
  customElements.define('session-manager-ce', SessionManagerElement);
}
