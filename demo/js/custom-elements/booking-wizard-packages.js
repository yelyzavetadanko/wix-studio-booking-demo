// =====================================================================
// Custom Retreat card image
// =====================================================================
// Paste a Wix Static URL here (Wix Media Manager → right-click image → Copy URL).
// Example shape: 'https://static.wixstatic.com/media/<id>~mv2.jpg'.
// Leave empty to render a clean placeholder block in the card.
const CUSTOM_RETREAT_CARD_IMAGE = 'https://static.wixstatic.com/media/4dd635_840d1ac2e90a4821870578aa92d2f3b7~mv2.png';

class BookingWizardElement extends HTMLElement {
  static get observedAttributes() {
    return ['context-json', 'state-json', 'options-json', 'errors-json', 'loading', 'theme-json'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.ctx = {};
    this.state = {};
    this.options = {};
    this.errors = {};
    this.loading = false;
    this.submitting = false;
    this.theme = {};
    this.initialized = false;
    this.flatpickrReady = false;
    this.flatpickrLoading = false;
    this.renderScheduled = false;
    this.expImageObserver = null;
    this.syncingCheckoutDate = false;
    this.scrollStateByKey = {};
    this.renderViewportState = {};
    this.layoutObserver = null;
    this.lastReportedHeight = 0;
  }

  connectedCallback() {
    const value = String(this.getAttribute('loading') || '').toLowerCase();
    this.loading = value === 'true' || value === '1';
    this.render();
    this.bindEvents();
    this.initDatePicker();
    this.setupLayoutObserver();
    if (!this.initialized) {
      this.initialized = true;
      queueMicrotask(() => {
        this.emit('booking-init', { version: 1 });
      });
    }
  }

  disconnectedCallback() {
    if (this.layoutObserver) {
      this.layoutObserver.disconnect();
      this.layoutObserver = null;
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'loading') {
      const value = String(newValue || '').toLowerCase();
      this.loading = value === 'true' || value === '1';
      if (!this.loading) this.submitting = false;
    } else if (name === 'context-json') {
      this.ctx = this.parseJson(newValue);
    } else if (name === 'state-json') {
      this.state = this.parseJson(newValue);
    } else if (name === 'options-json') {
      this.options = this.parseJson(newValue);
    } else if (name === 'errors-json') {
      this.errors = this.parseJson(newValue);
      if (!this.loading) this.submitting = false;
    } else if (name === 'theme-json') {
      this.theme = this.parseJson(newValue);
    }
    this.scheduleRender();
  }

  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const run = () => {
      this.renderScheduled = false;
      this.render();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run);
    } else {
      setTimeout(run, 0);
    }
  }

  parseJson(value) {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch (_e) {
      return {};
    }
  }

  emit(name, detail) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  log(message, payload) {
    console.log(`[booking-wizard-ce] ${message}`, payload || '');
  }

  getVariant() {
    const flow = this.ctx.flow || this.state.bookingFlow || '';
    if (flow.startsWith('package_')) return 'package';
    if (flow === 'retreats') return 'package';
    if (flow === 'enquiry') return 'enquiry';
    return 'stay';
  }

  getFlowMeta() {
    const flow = this.ctx.flow || this.state.bookingFlow || '';
    if (flow === 'surf_stay') {
      return {
        title: 'Surf & Stay Booking',
        subtitle: 'Choose dates, room allocation, add-ons, and finalize your reservation.',
      };
    }
    if (flow === 'bnb') {
      return {
        title: 'Bed & Breakfast Booking',
        subtitle: 'Choose dates, room allocation, and complete your booking details.',
      };
    }
    if (flow.startsWith('package_')) {
      return {
        title: 'Package Booking',
        subtitle: '',
      };
    }
    if (flow === 'retreats') {
      return {
        title: 'Retreat Booking Request',
        subtitle: 'Select session, room setup, add-ons, and submit your retreat enquiry.',
      };
    }
    if (flow === 'enquiry') {
      const enquiryType = String(this.ctx.enquiryType || this.state.enquiryType || '').toLowerCase();
      const retreatKey = String(this.ctx.retreatKey || this.state.retreatKey || '').toLowerCase();
      if (enquiryType === 'custom_retreat') {
        if (this.isCustomRetreatRequest()) {
          return {
            title: 'Custom Retreat Request',
            subtitle:
              'Tell us your dates, accommodation, retreat vision and details. We will review and follow up — no inventory is held until then.',
          };
        }
        const retreatLabel =
          retreatKey === 'dihya'
            ? 'Beyond the Break - Dihya'
            : retreatKey === 'anzar'
              ? 'Beyond the Break - Anzar'
              : 'Retreats';
        return {
          title: retreatKey ? `${retreatLabel} Enquiry` : 'Retreats Enquiry',
          subtitle: retreatKey
            ? 'Send your retreat request and complete the mandatory intake form before submission.'
            : 'Choose a retreat or design your own to begin your request.',
        };
      }
      if (enquiryType === 'surf_activity') {
        return {
          title: 'Surf Activity Enquiry',
          subtitle: 'Choose participants and send a surf lesson request. We confirm everything manually.',
        };
      }
      if (enquiryType === 'activity_enquiry') {
        return {
          title: 'Activity Enquiry',
          subtitle: 'To ensure the best experience, we check availability and confirm your booking with a payment link.',
        };
      }
      if (enquiryType === 'custom_package') {
        return {
          title: 'Custom Package Enquiry',
          subtitle: 'Share your dates, group size, and preferences. We will confirm details manually.',
        };
      }
      return {
        title: 'Enquiry',
        subtitle: 'Send your request and we will follow up with availability and options.',
      };
    }
    return {
      title: 'Booking',
      subtitle: 'Complete the steps to submit your reservation.',
    };
  }

  getPackageIncludedItems(flowKey) {
    if (flowKey === 'retreats') {
      const retreat = this.getRetreatCatalog().find((row) => String(row.retreatKey || '') === this.getRetreatKey()) || {};
      const includes = Array.isArray(retreat.includes) ? retreat.includes : [];
      if (includes.length > 0) return includes;
      const fallback = [retreat.mealsIncluded === true ? 'All meals included' : '', retreat.transfersIncluded === true ? 'Transfer included' : '']
        .filter(Boolean);
      return fallback.length ? fallback : ['Retreat inclusions apply according to your selected program'];
    }
    if (flowKey === 'package_beach_reset') {
      return [
        'Surf lesson x2',
        'Hammam Spa + massage',
        'Sunset yoga',
        'All inclusive meals',
      ];
    }
    if (flowKey === 'package_roots_ritual') {
      return [
        'Fixed Roots & Ritual weekly itinerary',
        'All meals throughout stay',
        'Airport/Station transfer included',
      ];
    }
    if (flowKey === 'package_surf_soul') {
      return [
        'Fixed Surf & Soul weekly itinerary',
        'Daily surf + yoga structure',
        'All meals + Airport/Station transfer included',
      ];
    }
    return [];
  }

  getFlowKey() {
    return this.ctx.flow || this.state.bookingFlow || '';
  }

  getEnquiryType() {
    return String(this.ctx.enquiryType || this.state.enquiryType || '').toLowerCase();
  }

  getRetreatKey() {
    return String(this.ctx.retreatKey || this.state.retreatKey || '').trim().toLowerCase();
  }

  isRetreatEnquiry() {
    return this.getVariant() === 'enquiry' && this.getEnquiryType() === 'custom_retreat';
  }

  // True when the user is on the bespoke 5-step Custom Retreat request flow.
  // Activated when URL carries enquiryType=custom_retreat without a preset retreatKey,
  // or when the user clicks the Custom Retreat card from the retreat browse selector.
  isCustomRetreatRequest() {
    if (!this.isRetreatEnquiry()) return false;
    if (this.state.customRetreatChosen === true || this.ctx.customRetreatRequestMode === true) return true;
    return false;
  }

  // True when the user is on a retreat browse landing screen (no card chosen yet).
  isRetreatBrowse() {
    if (!this.isRetreatEnquiry()) return false;
    if (this.isCustomRetreatRequest()) return false;
    return !this.getRetreatKey();
  }

  getRetreatCatalog() {
    const incoming = Array.isArray(this.options?.retreatCatalog) ? this.options.retreatCatalog : [];
    const baseCatalog = incoming.length > 0
      ? incoming
      : [
          {
            retreatKey: 'dihya',
            title: 'Beyond the Break - Dihya',
            audienceLabel: 'Women only',
            audienceIcon: 'W',
            durationLabel: '7 nights',
            priceLabel: 'From EUR 2200',
            includesLabel: 'Includes all meals and transfers',
            description: 'A reset-focused retreat for women with breathwork, emotional reflection, movement, and ocean connection.',
          },
          {
            retreatKey: 'anzar',
            title: 'Beyond the Break - Anzar',
            audienceLabel: 'Men only',
            audienceIcon: 'M',
            durationLabel: '7 nights',
            priceLabel: 'From EUR 2200',
            includesLabel: 'Includes all meals and transfers',
            description: 'A focused men retreat designed for clarity, grounding, and embodied work in a small group setting.',
          },
        ];
    // Append the synthetic "Custom Retreat" card so users in browse mode can opt into the
    // bespoke 5-step flow alongside the predefined retreats.
    const hasCustom = baseCatalog.some((row) => String(row?.retreatKey || '').toLowerCase() === 'custom');
    if (hasCustom) return baseCatalog;
    return baseCatalog.concat([
      {
        retreatKey: 'custom',
        title: 'Custom Retreat',
        audienceLabel: 'Design your own',
        audienceIcon: '+',
        durationLabel: 'Flexible',
        priceLabel: 'Tailored to your group',
        includesLabel: 'Bespoke programme — pricing confirmed after team review',
        description:
          'Plan a birthday, wellness, yoga, surf, creative, corporate or family retreat. Tell us your dates, group size and vision — we craft the rest.',
        // Image is a static constant at the top of this file (CUSTOM_RETREAT_CARD_IMAGE).
        // Both fields are read by the renderer (`item.cardImage || item.heroImage || ''`).
        cardImage: CUSTOM_RETREAT_CARD_IMAGE,
        heroImage: CUSTOM_RETREAT_CARD_IMAGE,
      },
    ]);
  }

  getRetreatSessions(retreatKey = '') {
    const key = String(retreatKey || this.getRetreatKey() || '').trim().toLowerCase();
    const rows = Array.isArray(this.options?.retreatSessions) ? this.options.retreatSessions : [];
    if (!key) return rows;
    return rows.filter((row) => String(row.retreatKey || '').trim().toLowerCase() === key);
  }

  isSurfActivityEnquiry() {
    return this.getVariant() === 'enquiry' && this.getEnquiryType() === 'surf_activity';
  }

  isActivityOnlyEnquiry() {
    return this.getVariant() === 'enquiry' && this.getEnquiryType() === 'activity_enquiry';
  }

  getEnquiryActivities() {
    const rows = Array.isArray(this.options?.addons?.experiences) ? this.options.addons.experiences : [];
    if (!this.isSurfActivityEnquiry()) return rows;
    return rows.filter((row) => {
      const key = String(row.activityKey || '').toLowerCase();
      return BookingWizardElement.SURF_ACTIVITY_KEYS.has(key) || key.startsWith('surf-');
    });
  }

  getActivityTitleByKey(activityKey = '') {
    if (!activityKey) return '';
    const item = this.getEnquiryActivities().find((row) => String(row.activityKey) === String(activityKey));
    return item?.title || activityKey;
  }

  activitySupportsLessonFormat(activityKey = '') {
    const key = String(activityKey || '').trim().toLowerCase();
    return key === 'surf-lesson-beginner' || key === 'surf-lesson-intermediate';
  }

  lessonTypePriceLabel(activity = {}, lessonFormat = '') {
    const full = String(activity?.priceLabel || '').trim();
    if (!full) return '';
    const supportsFormat = this.activitySupportsLessonFormat(activity?.activityKey || '');
    if (!supportsFormat) return full;
    const parts = this.getLessonPriceParts(activity);
    if (!parts.full) return '';
    const normalized = String(lessonFormat || '').trim().toLowerCase();
    if (!normalized) return parts.base || '';
    if (normalized === 'extended') {
      return parts.extended || parts.base || '';
    }
    return parts.base || '';
  }

  getExperienceLessonFormatsMap() {
    const source = this.state?.experienceLessonFormats;
    return source && typeof source === 'object' ? source : {};
  }

  getExperienceLessonFormat(activityKey = '') {
    const key = String(activityKey || '').trim();
    if (!key || !this.activitySupportsLessonFormat(key)) return '';
    const map = this.getExperienceLessonFormatsMap();
    const current = String(map[key] || '').trim().toLowerCase();
    return current === 'extended' ? 'extended' : '';
  }

  parsePriceAmountFromLabel(priceLabel = '', priceFromEur = 0) {
    const label = String(priceLabel || '').trim();
    const fallback = Number(priceFromEur || 0);
    if (!label) return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
    // Prefer explicit EUR amounts so labels like "2-Hour Lesson: 40 EUR" resolve to 40, not 2.
    const eurMatch = label.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*EUR/i);
    if (eurMatch) {
      const parsed = Number(eurMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    const match = label.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  getLessonPriceParts(activity = {}) {
    const full = String(activity?.priceLabel || '').trim();
    if (!full) return { full: '', base: '', extended: '' };
    const supportsFormat = this.activitySupportsLessonFormat(activity?.activityKey || '');
    if (!supportsFormat) return { full, base: full, extended: '' };
    const parts = full.split('|').map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return { full, base: full, extended: '' };
    const extended = parts.find((x) => x.toLowerCase().includes('extended')) || '';
    const base = parts.find((x) => x.toLowerCase().includes('2-hour')) || parts.find((x) => x !== extended) || parts[0] || '';
    return { full, base, extended };
  }

  sanitizeLessonDescription(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/[^.?!]*extended experience[^.?!]*[.?!]?\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
    return cleaned || raw;
  }

  formatExtendedAddonLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/^extended experience\s*[:\-]?\s*/i, '').trim();
    return cleaned ? `Extended Experience: ${cleaned}` : 'Extended Experience';
  }

  // Descriptive copy shown directly under the "Extended Experience" checkbox so users
  // understand what is included before opting in. Same text in every flow (surf stay,
  // activity enquiry, surf activity enquiry, package add-on lists).
  renderExtendedLessonDescription() {
    return '<p class="meta lesson-addon-desc">Includes surf lesson with wetsuit, board and leash, lunch on the beach, free surf afternoon and transport.</p>';
  }

  optimizeImageUrl(rawUrl = '', width = 240, height = 240, quality = 72) {
    const source = String(rawUrl || '').trim();
    if (!source) return '';
    const normalized = source.split('?')[0];
    if (!normalized.includes('static.wixstatic.com/media/')) return source;
    if (normalized.includes('/v1/fill/')) return normalized;
    const tail = normalized.split('/media/')[1] || '';
    const filePart = tail.split('/')[0] || 'image.jpg';
    const fileName = /[.]/.test(filePart) ? filePart : 'image.jpg';
    const w = Math.max(1, Math.round(Number(width || 240)));
    const h = Math.max(1, Math.round(Number(height || 240)));
    const q = Math.max(40, Math.min(85, Math.round(Number(quality || 72))));
    return `${normalized}/v1/fill/w_${w},h_${h},al_c,q_${q},enc_auto/${fileName}`;
  }

  getExperienceImageUrl(rawUrl = '') {
    return this.optimizeImageUrl(rawUrl, 240, 240, 72);
  }

  getRoomImageUrl(rawUrl = '') {
    return this.optimizeImageUrl(rawUrl, 720, 480, 74);
  }

  renderLazyExperienceImage(rawUrl = '', altText = '') {
    const src = this.getExperienceImageUrl(rawUrl);
    if (!src) return '<div class="exp-image placeholder"></div>';
    const placeholder =
      'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22240%22 height=%22240%22 viewBox=%220 0 240 240%22%3E%3Crect width=%22240%22 height=%22240%22 fill=%22%23efe8dc%22/%3E%3C/svg%3E';
    return `<img class="exp-image js-exp-image" src="${placeholder}" data-src="${src}" alt="${altText}" loading="lazy" decoding="async" fetchpriority="low" width="240" height="240" />`;
  }

  hydrateLazyExperienceImages() {
    if (!this.shadowRoot) return;
    const nodes = [...this.shadowRoot.querySelectorAll('img.js-exp-image[data-src]')];
    if (!nodes.length) return;
    if (this.expImageObserver) {
      this.expImageObserver.disconnect();
      this.expImageObserver = null;
    }
    const reveal = (img) => {
      const nextSrc = String(img.getAttribute('data-src') || '').trim();
      if (!nextSrc) return;
      img.src = nextSrc;
      img.removeAttribute('data-src');
    };
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.expImageObserver = new window.IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            if (img instanceof HTMLImageElement) reveal(img);
            observer.unobserve(img);
          });
        },
        { rootMargin: '220px 0px' }
      );
      nodes.forEach((img) => this.expImageObserver.observe(img));
      return;
    }
    nodes.forEach((img) => {
      if (img instanceof HTMLImageElement) reveal(img);
    });
  }

  getNightsCount() {
    const checkIn = this.state.checkIn;
    const checkOut = this.state.checkOut;
    if (!checkIn || !checkOut) return 1;
    const start = new Date(`${checkIn}T12:00:00`).getTime();
    const end = new Date(`${checkOut}T12:00:00`).getTime();
    if (!start || !end || end <= start) return 1;
    return Math.max(1, Math.round((end - start) / 86400000));
  }

  toDateInputValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const d = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(12, 0, 0, 0);
    return d;
  }

  formatDateInputValue(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  formatShortUiDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return raw;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return raw;
    const monthMap = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(day).padStart(2, '0')} ${monthMap[month - 1]} ${year}`;
  }

  addDaysToDate(baseDate, days) {
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) return null;
    const next = new Date(baseDate);
    next.setDate(next.getDate() + Math.max(0, Number(days || 0)));
    next.setHours(12, 0, 0, 0);
    return next;
  }

  readPositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    if (n <= 0) return 0;
    return Math.round(n);
  }

  getMinimumNightsForDateRange() {
    const flow = String(this.getFlowKey() || '').trim().toLowerCase();
    const stayDefaultsByFlow = {
      bnb: 1,
      surf_stay: 1,
      enquiry: 1,
    };
    const fallback = stayDefaultsByFlow[flow] || 1;
    const options = this.options || {};
    const addonsCore = options?.addons?.core || {};
    const firstRoomOption = Array.isArray(options?.stayRooms) ? options.stayRooms[0] || {} : {};
    const firstPackageSession = Array.isArray(options?.packageSessions) ? options.packageSessions[0] || {} : {};
    const candidates = [
      this.state?.minNights,
      this.state?.minimumNights,
      this.ctx?.minNights,
      this.ctx?.minimumNights,
      options?.minNights,
      options?.minimumNights,
      addonsCore?.minNights,
      addonsCore?.minimumNights,
      firstRoomOption?.minNights,
      firstRoomOption?.minimumNights,
      firstPackageSession?.minNights,
      firstPackageSession?.minimumNights,
    ];
    for (const raw of candidates) {
      const parsed = this.readPositiveInt(raw);
      if (parsed > 0) return parsed;
    }
    return fallback;
  }

  syncCheckoutDateByMinimumNights(input = {}) {
    if (!this.shadowRoot) return;
    if (this.syncingCheckoutDate) return;
    const forceApply = input?.forceApply === true;
    const checkInNode = this.shadowRoot.getElementById('stayCheckIn');
    const checkOutNode = this.shadowRoot.getElementById('stayCheckOut');
    if (!checkInNode || !checkOutNode) return;

    const minNights = Math.max(1, this.getMinimumNightsForDateRange());
    const checkInDate = this.toDateInputValue(checkInNode.value);
    const checkOutDate = this.toDateInputValue(checkOutNode.value);
    const checkOutMinToday = String(checkOutNode.dataset?.minToday || 'true').toLowerCase() !== 'false';
    const absoluteMin = checkOutMinToday ? 'today' : null;
    const minCheckoutDate = checkInDate ? this.addDaysToDate(checkInDate, minNights) : null;
    const minDateConstraint = minCheckoutDate || absoluteMin;
    const checkoutPicker = checkOutNode._flatpickr;

    this.syncingCheckoutDate = true;
    try {
      if (checkoutPicker && minDateConstraint != null) {
        checkoutPicker.set('minDate', minDateConstraint);
      } else if (checkoutPicker) {
        checkoutPicker.set('minDate', null);
      }

      if (!minCheckoutDate) return;
      const needsAutoFill =
        forceApply ||
        !checkOutDate ||
        Number.isNaN(checkOutDate.getTime()) ||
        checkOutDate.getTime() < minCheckoutDate.getTime();
      if (!needsAutoFill) return;
      const nextValue = this.formatDateInputValue(minCheckoutDate);
      if (!nextValue) return;
      if (String(checkOutNode.value || '') === nextValue) return;
      if (checkoutPicker) {
        // Use triggerChange=false to avoid recursive onChange loops.
        checkoutPicker.setDate(nextValue, false, 'Y-m-d');
      }
      checkOutNode.value = nextValue;
    } finally {
      this.syncingCheckoutDate = false;
    }
  }

  getPreviewGuestAssignments() {
    const selected = this.getRoomSelections()
      .map((row) => ({
        roomTypeKey: row.roomTypeKey,
        quantity: Math.max(0, Number(row.quantity || 0)),
      }))
      .filter((row) => row.quantity > 0);
    const result = {};
    let remaining = this.getGuestCount();
    for (const key of ['double', 'single', 'dorm']) {
      const row = selected.find((x) => x.roomTypeKey === key);
      if (!row) continue;
      const cap = this.getCapacityPerUnit(row.roomTypeKey);
      const maxGuests = row.quantity * cap;
      const assigned = Math.min(remaining, maxGuests);
      result[row.roomTypeKey] = assigned;
      remaining -= assigned;
    }
    return result;
  }

  getCartPriceSummary() {
    const flow = this.getFlowKey();
    const nights = this.getNightsCount();
    const isRetreatFlow = flow === 'retreats';
    const isPackageLikeFlow = flow.startsWith('package_') || isRetreatFlow;
    const guests = this.getGuestCount();
    const selectedRows = this.getRoomSelections().filter((r) => Number(r.quantity) > 0);
    const roomsByKey = new Map(this.getStayRooms().map((r) => [r.roomTypeKey, r]));
    const assignments = this.getPreviewGuestAssignments();
    const core = this.state.coreAddons || {};
    const lines = [];
    const roomTotals = {};
    let total = 0;

    if (flow === 'surf_stay') {
      const dorm = roomsByKey.get('dorm');
      const baseRate = Number(dorm?.unitPrice || 0);
      if (guests > 0 && baseRate > 0) {
        const lineTotal = guests * baseRate * nights;
        lines.push({ key: 'surf_base', label: 'Surf & Stay base', total: lineTotal, currency: dorm?.currency || 'EUR' });
        total += lineTotal;
      }
      const singleQty = Number(selectedRows.find((r) => r.roomTypeKey === 'single')?.quantity || 0);
      if (singleQty > 0) {
        const single = roomsByKey.get('single');
        const assigned = Number(assignments.single || 0);
        const rate = Number(single?.unitPrice || 0);
        const lineTotal = assigned * rate * nights;
        lines.push({ key: 'surf_single', label: 'Single upgrade', total: lineTotal, currency: single?.currency || 'EUR' });
        roomTotals.single = lineTotal;
        total += lineTotal;
      }
      const doubleQty = Number(selectedRows.find((r) => r.roomTypeKey === 'double')?.quantity || 0);
      if (doubleQty > 0) {
        const dbl = roomsByKey.get('double');
        const assigned = Number(assignments.double || 0);
        const doubleOccRooms = Math.min(doubleQty, Math.floor(assigned / 2));
        const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
        const singleRate = Number(dbl?.singleOccPrice || dbl?.unitPrice || 0);
        const doubleRate = Number(dbl?.doubleOccPrice || singleRate || 0);
        const lineTotal = nights * (singleOccRooms * singleRate + doubleOccRooms * doubleRate);
        lines.push({ key: 'surf_double', label: 'Double upgrade', total: lineTotal, currency: dbl?.currency || 'EUR' });
        roomTotals.double = lineTotal;
        total += lineTotal;
      }
      if (!roomTotals.single) roomTotals.single = 0;
      if (!roomTotals.double) roomTotals.double = 0;
      roomTotals.dorm = 0;
    } else if (isPackageLikeFlow) {
      const dorm = roomsByKey.get('dorm');
      const baseRate = Number(dorm?.unitPrice || 0);
      if (guests > 0 && baseRate > 0) {
        const lineTotal = guests * baseRate;
        lines.push({
          key: isRetreatFlow ? 'retreat_base' : 'package_base',
          label: isRetreatFlow ? 'Retreat base (dorm included)' : 'Package base (dorm included)',
          total: lineTotal,
          currency: dorm?.currency || 'EUR',
        });
        roomTotals.dorm = 0;
        total += lineTotal;
      } else {
        roomTotals.dorm = 0;
      }
      const singleQty = Number(selectedRows.find((r) => r.roomTypeKey === 'single')?.quantity || 0);
      if (singleQty > 0) {
        const single = roomsByKey.get('single');
        const assigned = Number(assignments.single || 0);
        const rate = Number(single?.unitPrice || 0);
        const lineTotal = assigned * rate;
        lines.push({
          key: isRetreatFlow ? 'retreat_single' : 'package_single',
          label: 'Single room upgrade',
          total: lineTotal,
          currency: single?.currency || 'EUR',
        });
        roomTotals.single = lineTotal;
        total += lineTotal;
      } else {
        roomTotals.single = 0;
      }
      const doubleQty = Number(selectedRows.find((r) => r.roomTypeKey === 'double')?.quantity || 0);
      if (doubleQty > 0) {
        const dbl = roomsByKey.get('double');
        const assigned = Number(assignments.double || 0);
        const singleOccGuests = assigned % 2;
        const doubleOccGuests = Math.max(0, assigned - singleOccGuests);
        const singleRate = Number(dbl?.singleOccPrice || dbl?.unitPrice || 0);
        const doubleRate = Number(dbl?.doubleOccPrice || singleRate || 0);
        const lineTotal = singleOccGuests * singleRate + doubleOccGuests * doubleRate;
        lines.push({
          key: isRetreatFlow ? 'retreat_double' : 'package_double',
          label: 'Double room upgrade',
          total: lineTotal,
          currency: dbl?.currency || 'EUR',
        });
        roomTotals.double = lineTotal;
        total += lineTotal;
      } else {
        roomTotals.double = 0;
      }
    } else {
      for (const row of selectedRows) {
        const opt = roomsByKey.get(row.roomTypeKey);
        const qty = Number(row.quantity || 0);
        const lineTotal = Number(opt?.unitPrice || 0) * qty * nights;
        lines.push({ key: row.roomTypeKey, label: opt?.title || row.roomTypeKey, total: lineTotal, currency: opt?.currency || 'EUR' });
        roomTotals[row.roomTypeKey] = lineTotal;
        total += lineTotal;
      }
    }

    if (core.dinner && !isPackageLikeFlow) {
      const dinnerStandard = Number(core.dinnerStandardRate || 0);
      const dinnerDoubleSingle = Number(core.dinnerDoubleSingleOccRate || 0);
      const dinnerDoubleDouble = Number(core.dinnerDoubleDoubleOccRate || 0);
      const doubleQty = Number(selectedRows.find((r) => r.roomTypeKey === 'double')?.quantity || 0);
      const assignedDouble = Number(assignments.double || 0);
      const doubleOccRooms = Math.min(doubleQty, Math.floor(assignedDouble / 2));
      const singleOccRooms = Math.max(0, doubleQty - doubleOccRooms);
      const nonDoubleGuests = Math.max(0, guests - assignedDouble);
      const dinnerTotal =
        nights * (nonDoubleGuests * dinnerStandard + singleOccRooms * dinnerDoubleSingle + doubleOccRooms * dinnerDoubleDouble);
      lines.push({
        key: 'addon_dinner',
        label: 'Dinner add-on',
        total: dinnerTotal,
        currency: core.currency || 'EUR',
      });
      total += dinnerTotal;
    }

    const transferTypes = this.getSelectedTransferTypes(core);
    if (transferTypes.length > 0) {
      for (const transferType of transferTypes) {
        const rate = transferType === 'airport' ? Number(core.transferAirportRate || 0) : Number(core.transferBusRate || 0);
        const vehiclesForType = this.getTransferVehiclesByType(transferType, core);
        const transferTotal = vehiclesForType * rate;
        if (transferTotal <= 0) continue;
        lines.push({
          key: `addon_transfer_${transferType}`,
          label: transferType === 'airport' ? 'Airport transfer' : 'Bus transfer',
          total: transferTotal,
          currency: core.currency || 'EUR',
        });
        total += transferTotal;
      }
    }
    const experienceRows = this.getSelectedExperienceRows();
    const experienceCatalog = new Map(this.getAddonOptions().experiences.map((x) => [x.activityKey, x]));
    const multiplyActivityByGuests =
      this.getVariant() === 'enquiry' && this.getEnquiryType() === 'custom_package';
    if (experienceRows.length > 0) {
      experienceRows.forEach((row) => {
        const catalogRow = experienceCatalog.get(row.activityKey) || {};
        const amount = this.parsePriceAmountFromLabel(
          row.priceLabel || '',
          Number(catalogRow.priceFromEur || 0)
        );
        if (amount <= 0) return;
        const rowQty = Math.max(1, Number(row.qty || 1));
        const qty = multiplyActivityByGuests ? Math.max(1, guests) * rowQty : rowQty;
        lines.push({
          key: `addon_experience_${row.activityKey}`,
          label: row.title || row.activityKey || 'Experience',
          qty,
          total: amount * qty,
          currency: core.currency || 'EUR',
        });
        total += amount * qty;
      });
    }
    return { lines, total, currency: lines[0]?.currency || 'EUR', roomTotals };
  }

  getSteps() {
    const variant = this.getVariant();
    if (variant === 'package') {
      if (this.getFlowKey() === 'retreats') return ['Session', 'Participants & Room', 'Contact'];
      return ['Session', 'Participants & Room', 'Requests', 'Contact'];
    }
    if (variant === 'enquiry') {
      if (this.isCustomRetreatRequest()) {
        return ['Dates & Guests', 'Accommodation', 'Retreat Type', 'Retreat Details', 'Your Details'];
      }
      if (this.isRetreatEnquiry()) return ['Retreat Request', 'Contact'];
      if (this.isSurfActivityEnquiry()) return ['Request', 'Contact & Guests'];
      if (this.isActivityOnlyEnquiry()) return ['Request', 'Contact'];
      return ['Activities', 'Contact'];
    }
    return ['Guests & Dates', 'Rooms', 'Add-ons', 'Contact'];
  }

  getCurrentStep() {
    const step = Number(this.state.currentStep || 1);
    const max = this.getSteps().length;
    return Math.max(1, Math.min(step, max));
  }

  getStayRooms() {
    const rows = this.options.stayRooms;
    return Array.isArray(rows) ? rows : [];
  }

  getAddonOptions() {
    const addon = this.options.addons || {};
    return {
      core: addon.core || {},
      experiences: Array.isArray(addon.experiences) ? addon.experiences : [],
      nights: Number(addon.nights || this.getNightsCount() || 1),
    };
  }

  getSelectedTransferTypes(coreAddons = this.state.coreAddons || {}) {
    const list = Array.isArray(coreAddons.transferTypes) ? coreAddons.transferTypes : [];
    const normalized = [...new Set(list.map((item) => String(item || '').toLowerCase()))].filter(
      (item) => item === 'airport' || item === 'bus'
    );
    if (normalized.length > 0) return normalized;
    const fallback = String(coreAddons.transferType || '').toLowerCase();
    if (fallback === 'airport' || fallback === 'bus') return [fallback];
    return [];
  }

  // See backend `getTransferVehiclesByType`: when both transfer types are selected
  // (split arrivals), each type has its own vehicle count to allow correct
  // per-vehicle pricing. With a single type, the legacy aggregate field is used.
  getTransferVehiclesByType(type, coreAddons = this.state.coreAddons || {}) {
    const types = this.getSelectedTransferTypes(coreAddons);
    if (!types.includes(type)) return 0;
    const max = this.getMaxTransferVehicles();
    if (types.length >= 2) {
      const raw = type === 'airport'
        ? Number(coreAddons.transferAirportVehicles || 0)
        : Number(coreAddons.transferBusVehicles || 0);
      return Math.max(1, Math.min(max, Math.round(raw || 1)));
    }
    return Math.max(1, Math.min(max, Math.round(Number(coreAddons.transferVehicles || 1))));
  }

  getSelectedExperienceRows() {
    const selected = Array.isArray(this.state.experienceRequests) ? this.state.experienceRequests : [];
    const isRetreatFlow = this.getFlowKey() === 'retreats';
    const map = new Map(this.getAddonOptions().experiences.map((x) => [x.activityKey, x]));
    const baseRows = selected.map((row) => ({
      activityKey: row.activityKey,
      title: row.title || map.get(row.activityKey)?.title || row.activityKey,
      lessonFormat: this.getExperienceLessonFormat(row.activityKey),
      qty: 1,
      priceLabel:
        this.lessonTypePriceLabel(map.get(row.activityKey) || {}, this.getExperienceLessonFormat(row.activityKey)) ||
        map.get(row.activityKey)?.priceLabel ||
        '',
    }));
    if (!isRetreatFlow) return baseRows;
    const guestDetails = Array.isArray(this.state.guestDetails) ? this.state.guestDetails : [];
    const groupedSurf = new Map();
    for (const guest of guestDetails) {
      const activityKey = String(guest?.enquiryActivityKey || '').trim();
      if (!activityKey || !this.activitySupportsLessonFormat(activityKey)) continue;
      const lessonFormat = String(guest?.lessonFormat || '').trim().toLowerCase() === 'extended' ? 'extended' : '';
      const bucketKey = `${activityKey}__${lessonFormat || 'base'}`;
      const current = groupedSurf.get(bucketKey) || { activityKey, lessonFormat, qty: 0 };
      current.qty += 1;
      groupedSurf.set(bucketKey, current);
    }
    const surfRows = [...groupedSurf.values()].map((row) => {
      const info = map.get(row.activityKey) || {};
      return {
        activityKey: row.activityKey,
        title: info.title || row.activityKey,
        lessonFormat: row.lessonFormat,
        qty: Math.max(1, Number(row.qty || 1)),
        priceLabel: this.lessonTypePriceLabel(info, row.lessonFormat) || info.priceLabel || '',
      };
    });
    const surfKeys = new Set(surfRows.map((row) => String(row.activityKey || '')));
    const filteredBaseRows = baseRows.filter((row) => !surfKeys.has(String(row.activityKey || '')));
    return [...filteredBaseRows, ...surfRows];
  }

  getActivityDurationText(item) {
    if (item.durationLabel) return item.durationLabel;
    const min = Number(item.durationMinMinutes || 0);
    const max = Number(item.durationMaxMinutes || 0);
    if (min > 0 && max > 0 && max >= min) return `${min}-${max} min`;
    if (min > 0) return `${min} min`;
    return '';
  }

  shouldShowDurationMeta(priceText, durationText) {
    const duration = String(durationText || '').trim();
    if (!duration) return false;
    const price = String(priceText || '').trim();
    if (!price) return true;
    const normalize = (input) => String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const d = normalize(duration);
    const p = normalize(price);
    if (!d || !p) return true;
    if (p.includes(d)) return false;
    const durationHints = ['2 hour lesson', 'extended experience', 'regular lesson'];
    const overlapByHint = durationHints.some((hint) => p.includes(hint) && d.includes(hint));
    return !overlapByHint;
  }

  getRoomSelections() {
    return Array.isArray(this.state.roomSelections) ? this.state.roomSelections : [];
  }

  renderSurfSingleChoiceGroup(input = {}) {
    const guestIndex = Math.max(0, Number(input.guestIndex || 0));
    const guestKey = String(input.guestKey || '').trim();
    const title = String(input.title || '').trim();
    const selectedValue = String(input.selectedValue || '').trim();
    const required = input.required === true;
    const options = Array.isArray(input.options) ? input.options : [];
    if (!guestKey || !title || !options.length) return '';
    const groupId = String(input.groupId || `${guestKey}-${guestIndex}`).replace(/[^a-zA-Z0-9_-]/g, '-');
    return `<div class="surf-qual-block">
      <label class="surf-qual-label">${title} ${required ? '<span class="req">*</span>' : '<span class="muted">(optional)</span>'}</label>
      <div class="surf-choice-grid">
        ${options
          .map((option) => {
            const value = String(option?.value || '').trim();
            const optionLabel = String(option?.label || value || '').trim();
            const active = selectedValue === value;
            return `<label class="surf-choice-item ${active ? 'active' : ''}">
              <input
                type="checkbox"
                class="guest-detail-input surf-single-choice"
                data-single-group="${groupId}"
                data-guest-index="${guestIndex}"
                data-guest-key="${guestKey}"
                data-checked-value="${value}"
                data-unchecked-value=""
                ${active ? 'checked' : ''}
              />
              <span>${optionLabel}</span>
            </label>`;
          })
          .join('')}
      </div>
    </div>`;
  }

  getRoomQty(roomTypeKey) {
    return Number(this.getRoomSelections().find((r) => r.roomTypeKey === roomTypeKey)?.quantity || 0);
  }

  getGuestCount() {
    return Math.max(0, Number(this.state.guestCount || 0));
  }

  isAutoIncludedAllocationMode() {
    const flow = String(this.getFlowKey() || '').trim().toLowerCase();
    return flow === 'surf_stay' || flow.startsWith('package_') || flow === 'retreats';
  }

  getIncludedRoomTypeKey() {
    return this.isAutoIncludedAllocationMode() ? 'dorm' : '';
  }

  shouldPreferSingleRoomsForStay() {
    const flow = this.getFlowKey();
    if (flow !== 'bnb' && flow !== 'surf_stay') return false;
    return this.state.stayPreferSingleRooms === true || this.state.bnbPreferSingleRooms === true;
  }

  getMaxTransferVehicles() {
    const guests = this.getGuestCount();
    return Math.max(1, guests);
  }

  normalizeTransferVehicles(value) {
    const min = 1;
    const max = this.getMaxTransferVehicles();
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  getCapacityPerUnit(roomTypeKey) {
    const row = this.getStayRooms().find((item) => item.roomTypeKey === roomTypeKey);
    if (row && Number(row.capacityPerUnit) > 0) return Number(row.capacityPerUnit);
    if (roomTypeKey === 'double') return 2;
    return 1;
  }

  getSelectedGuestSlots() {
    return this.getRoomSelections().reduce((acc, row) => {
      const qty = Number(row.quantity) || 0;
      return acc + qty * this.getCapacityPerUnit(row.roomTypeKey);
    }, 0);
  }

  getRoomAvailableUnits(roomTypeKey) {
    const row = this.getStayRooms().find((item) => item.roomTypeKey === roomTypeKey);
    return Math.max(0, Number(row?.available || 0));
  }

  getMaxAllowedQtyForType(roomTypeKey) {
    const availableUnits = this.getRoomAvailableUnits(roomTypeKey);
    const guests = this.getGuestCount();
    if (guests <= 0) return availableUnits;
    const flowKey = this.getFlowKey();
    const isPackageLikeFlow = flowKey.startsWith('package_') || flowKey === 'retreats';
    if (isPackageLikeFlow) {
      // For package/retreat flows we still allow flexible occupancy (e.g. 1 guest in double),
      // but total selected room units should not exceed guest count.
      const unitsExcludingCurrent = this.getRoomSelections().reduce((acc, row) => {
        if (row.roomTypeKey === roomTypeKey) return acc;
        return acc + Math.max(0, Number(row.quantity || 0));
      }, 0);
      const maxByGuests = Math.max(0, guests - unitsExcludingCurrent);
      return Math.max(0, Math.min(availableUnits, maxByGuests));
    }
    const includedKey = this.getIncludedRoomTypeKey();
    const autoMode = this.isAutoIncludedAllocationMode();
    if (autoMode && includedKey) {
      if (roomTypeKey === includedKey) {
        // Allow selecting included dorm beds beyond the strict minimum so mixed
        // combinations (dorm + single + double) are possible for groups.
        return availableUnits;
      }
      const cap = this.getCapacityPerUnit(roomTypeKey);
      const slotsWithoutIncludedAndCurrent = this.getRoomSelections().reduce((acc, row) => {
        if (row.roomTypeKey === includedKey || row.roomTypeKey === roomTypeKey) return acc;
        const qty = Math.max(0, Number(row.quantity || 0));
        const rowCap = this.getCapacityPerUnit(row.roomTypeKey);
        return acc + qty * rowCap;
      }, 0);
      const remainingSlots = Math.max(0, guests - slotsWithoutIncludedAndCurrent);
      const maxByGuests = Math.ceil(remainingSlots / Math.max(1, cap));
      return Math.max(0, Math.min(availableUnits, maxByGuests));
    }
    const cap = this.getCapacityPerUnit(roomTypeKey);
    const currentQty = this.getRoomQty(roomTypeKey);
    const selectedSlots = this.getSelectedGuestSlots();
    const slotsExcludingCurrent = Math.max(0, selectedSlots - currentQty * cap);
    const remainingSlots = Math.max(0, guests - slotsExcludingCurrent);
    const maxByGuests = Math.ceil(remainingSlots / cap);
    return Math.max(0, Math.min(availableUnits, maxByGuests));
  }

  canIncrementRoom(roomTypeKey) {
    return this.getRoomQty(roomTypeKey) < this.getMaxAllowedQtyForType(roomTypeKey);
  }

  emitRoomSelections(list) {
    this.emit('draft-update', {
      type: 'stay-room-selections',
      payload: {
        roomSelections: list.map((row) => ({
          roomTypeKey: String(row.roomTypeKey || '').trim(),
          quantity: Math.max(0, Number(row.quantity || 0)),
        })),
      },
    });
  }

  updateRoomSelections(nextList) {
    const normalized = Array.isArray(nextList)
      ? nextList
          .map((row) => ({
            roomTypeKey: String(row?.roomTypeKey || '').trim(),
            quantity: Math.max(0, Number(row?.quantity || 0)),
          }))
          .filter((row) => row.roomTypeKey)
      : [];
    this.state = { ...this.state, roomSelections: normalized };
    this.emitRoomSelections(normalized);
    this.render();
  }

  buildSmartRoomSelection(preferredRoomTypeKey) {
    const preferredKey = String(preferredRoomTypeKey || '').trim();
    const guests = this.getGuestCount();
    if (!preferredKey || guests <= 0) return [];
    const rooms = this.getStayRooms()
      .map((row) => ({
        roomTypeKey: String(row.roomTypeKey || '').trim(),
        capacity: Math.max(1, Number(row.capacityPerUnit || this.getCapacityPerUnit(row.roomTypeKey))),
        available: Math.max(0, Number(row.available || 0)),
      }))
      .filter((row) => row.roomTypeKey && row.available > 0);
    if (!rooms.length) return [];
    const preferredMeta = rooms.find((row) => row.roomTypeKey === preferredKey);
    if (!preferredMeta) return [];
    const best = { selection: [], score: null };
    const dfs = (idx, slots, preferredQty, selected) => {
      if (slots > guests) return;
      if (idx >= rooms.length) {
        if (slots !== guests) return;
        if (preferredQty <= 0) return;
        const includedKey = this.getIncludedRoomTypeKey();
        const roomsUsed = selected.reduce((acc, row) => acc + row.quantity, 0);
        const preferredSlots = preferredQty * preferredMeta.capacity;
        const includedQty = selected.find((row) => row.roomTypeKey === includedKey)?.quantity || 0;
        const score = [preferredSlots, preferredQty, -includedQty, -roomsUsed];
        const shouldReplace =
          !best.score ||
          (() => {
            for (let i = 0; i < score.length; i += 1) {
              if (score[i] === best.score[i]) continue;
              return score[i] > best.score[i];
            }
            return false;
          })();
        if (shouldReplace) {
          best.score = score;
          best.selection = selected.filter((row) => row.quantity > 0).map((row) => ({ ...row }));
        }
        return;
      }
      const row = rooms[idx];
      const maxByGuests = Math.floor((guests - slots) / row.capacity);
      const limit = Math.min(row.available, Math.max(0, maxByGuests));
      for (let qty = limit; qty >= 0; qty -= 1) {
        selected[idx].quantity = qty;
        dfs(
          idx + 1,
          slots + qty * row.capacity,
          preferredQty + (row.roomTypeKey === preferredKey ? qty : 0),
          selected
        );
      }
      selected[idx].quantity = 0;
    };
    const seed = rooms.map((row) => ({ roomTypeKey: row.roomTypeKey, quantity: 0 }));
    dfs(0, 0, 0, seed);
    return best.selection || [];
  }

  applyQuickRoomSelection(roomTypeKey) {
    const selectedKey = String(roomTypeKey || '').trim();
    if (!selectedKey) return;
    if (this.getFlowKey() === 'surf_stay') {
      const smartSurf = this.buildBnbQuickSelection(selectedKey);
      if (smartSurf.length > 0) {
        this.updateRoomSelections(smartSurf);
        return;
      }
    }
    if (!this.isAutoIncludedAllocationMode()) {
      if (this.getFlowKey() === 'bnb') {
        const smart = this.buildBnbQuickSelection(selectedKey);
        if (smart.length > 0) {
          this.updateRoomSelections(smart);
          return;
        }
      }
      const next = this.getRoomQty(selectedKey) + 1;
      this.updateRoomQty(selectedKey, next);
      return;
    }
    const smartSelection = this.buildSmartRoomSelection(selectedKey);
    if (smartSelection.length > 0) {
      this.updateRoomSelections(smartSelection);
      return;
    }
    const next = this.getRoomQty(selectedKey) + 1;
    this.updateRoomQty(selectedKey, next);
  }

  suggestStayRoomSelectionsLocal(guestCount) {
    const guests = Math.max(0, Number(guestCount || 0));
    if (guests <= 0) return [];
    const getAvailable = (key) => Math.max(0, Number(this.getRoomAvailableUnits(key)));
    const maxDouble = Math.min(getAvailable('double'), Math.floor(guests / 2));
    const availableSingle = getAvailable('single');
    const availableDorm = getAvailable('dorm');
    const variants = [];
    for (let doubles = maxDouble; doubles >= 0; doubles -= 1) {
      const afterDoubles = guests - doubles * 2;
      const singles = Math.min(availableSingle, afterDoubles);
      const dorms = afterDoubles - singles;
      if (dorms < 0 || dorms > availableDorm) continue;
      variants.push({
        doubles,
        singles,
        dorms,
        roomsUsed: doubles + singles + dorms,
      });
    }
    variants.sort((a, b) => {
      if (a.roomsUsed !== b.roomsUsed) return a.roomsUsed - b.roomsUsed;
      if (a.dorms !== b.dorms) return a.dorms - b.dorms;
      if (a.doubles !== b.doubles) return b.doubles - a.doubles;
      return b.singles - a.singles;
    });
    const best = variants[0];
    if (!best) return [];
    const result = [];
    if (best.doubles > 0) result.push({ roomTypeKey: 'double', quantity: best.doubles });
    if (best.singles > 0) result.push({ roomTypeKey: 'single', quantity: best.singles });
    if (best.dorms > 0) result.push({ roomTypeKey: 'dorm', quantity: best.dorms });
    return result;
  }

  buildBnbQuickSelection(preferredRoomTypeKey) {
    const preferred = String(preferredRoomTypeKey || '').trim().toLowerCase();
    const guests = this.getGuestCount();
    if (!preferred || guests <= 0) return [];
    const availableSingle = Math.max(0, this.getRoomAvailableUnits('single'));
    const availableDouble = Math.max(0, this.getRoomAvailableUnits('double'));
    const availableDorm = Math.max(0, this.getRoomAvailableUnits('dorm'));
    if (preferred === 'dorm') {
      const dormQty = Math.min(availableDorm, guests);
      if (dormQty >= guests) return [{ roomTypeKey: 'dorm', quantity: dormQty }];
      return this.suggestStayRoomSelectionsLocal(guests);
    }
    if (preferred === 'single') {
      if (this.shouldPreferSingleRoomsForStay()) {
        const singles = Math.min(availableSingle, guests);
        let remaining = guests - singles;
        const doubles = Math.min(availableDouble, Math.floor(remaining / 2));
        remaining -= doubles * 2;
        const dorms = Math.min(availableDorm, remaining);
        remaining -= dorms;
        if (remaining === 0 && singles > 0) {
          const out = [];
          if (doubles > 0) out.push({ roomTypeKey: 'double', quantity: doubles });
          if (singles > 0) out.push({ roomTypeKey: 'single', quantity: singles });
          if (dorms > 0) out.push({ roomTypeKey: 'dorm', quantity: dorms });
          return out;
        }
      }
      const singles = Math.min(availableSingle, 1);
      const remaining = Math.max(0, guests - singles);
      const doubles = Math.min(availableDouble, Math.floor(remaining / 2));
      const left = remaining - doubles * 2;
      if (left <= availableDorm) {
        const out = [];
        if (doubles > 0) out.push({ roomTypeKey: 'double', quantity: doubles });
        if (singles > 0) out.push({ roomTypeKey: 'single', quantity: singles });
        if (left > 0) out.push({ roomTypeKey: 'dorm', quantity: left });
        if (out.length > 0) return out;
      }
      return this.suggestStayRoomSelectionsLocal(guests);
    }
    if (preferred === 'double') {
      const doubles = Math.min(availableDouble, Math.max(1, Math.floor(guests / 2)));
      const remaining = Math.max(0, guests - doubles * 2);
      const singles = Math.min(availableSingle, remaining);
      const left = remaining - singles;
      if (left <= availableDorm) {
        const out = [];
        if (doubles > 0) out.push({ roomTypeKey: 'double', quantity: doubles });
        if (singles > 0) out.push({ roomTypeKey: 'single', quantity: singles });
        if (left > 0) out.push({ roomTypeKey: 'dorm', quantity: left });
        if (out.length > 0) return out;
      }
      return this.suggestStayRoomSelectionsLocal(guests);
    }
    return this.suggestStayRoomSelectionsLocal(guests);
  }

  updateRoomQty(roomTypeKey, quantity) {
    const guestCount = this.getGuestCount();
    const desired = Math.max(0, Number(quantity) || 0);
    const q = Math.min(desired, this.getMaxAllowedQtyForType(roomTypeKey));
    const list = [...this.getRoomSelections()];
    const existing = list.find((r) => r.roomTypeKey === roomTypeKey);
    if (existing) {
      existing.quantity = q;
    } else {
      list.push({ roomTypeKey, quantity: q });
    }
    if (guestCount === 1 && q > 0) {
      for (const row of list) {
        if (row.roomTypeKey !== roomTypeKey) row.quantity = 0;
      }
    }
    if (this.isAutoIncludedAllocationMode()) {
      const includedKey = this.getIncludedRoomTypeKey();
      if (includedKey) {
        const includedCap = Math.max(1, this.getCapacityPerUnit(includedKey));
        const slotsWithoutIncluded = list.reduce((acc, row) => {
          if (row.roomTypeKey === includedKey) return acc;
          const qty = Math.max(0, Number(row.quantity || 0));
          const cap = this.getCapacityPerUnit(row.roomTypeKey);
          return acc + qty * cap;
        }, 0);
        const neededIncludedSlots = Math.max(0, guestCount - slotsWithoutIncluded);
        const neededIncludedQtyRaw = Math.ceil(neededIncludedSlots / includedCap);
        const neededIncludedQty = Math.max(0, Math.min(neededIncludedQtyRaw, this.getRoomAvailableUnits(includedKey)));
        const includedRow = list.find((r) => r.roomTypeKey === includedKey);
        if (roomTypeKey !== includedKey) {
          // Keep any manually selected dorm quantity (for mixed allocation),
          // but still auto-raise to the minimum needed to cover guest count.
          if (includedRow) {
            const currentQty = Math.max(0, Number(includedRow.quantity || 0));
            includedRow.quantity = Math.max(currentQty, neededIncludedQty);
          } else if (neededIncludedQty > 0) {
            list.push({ roomTypeKey: includedKey, quantity: neededIncludedQty });
          }
        } else if (includedRow) {
          includedRow.quantity = Math.max(0, Number(includedRow.quantity || 0));
        }
      }
    }
    this.updateRoomSelections(list);
  }

  getSelectedRoomsTotal() {
    return this.getRoomSelections().reduce((acc, row) => acc + (Number(row.quantity) || 0), 0);
  }

  isSelectionWithinAvailability() {
    return this.getRoomSelections().every((row) => {
      const qty = Math.max(0, Number(row.quantity || 0));
      return qty <= this.getRoomAvailableUnits(row.roomTypeKey);
    });
  }

  getAssignedGuestCountForPreview() {
    const assignments = this.getPreviewGuestAssignments();
    return Object.values(assignments).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0);
  }

  canContinueFromStep2() {
    const guestCount = this.getGuestCount();
    if (guestCount <= 0) return false;
    if (this.getSelectedRoomsTotal() <= 0) return false;
    if (!this.isSelectionWithinAvailability()) return false;
    return this.getAssignedGuestCountForPreview() >= guestCount;
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
      if (!document.getElementById('booking-flatpickr-css')) {
        const link = document.createElement('link');
        link.id = 'booking-flatpickr-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('booking-flatpickr-theme-css')) {
        const themeLink = document.createElement('link');
        themeLink.id = 'booking-flatpickr-theme-css';
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
    if (!this.flatpickrReady || !this.shadowRoot) return;
    const parseMinToday = (node) => String(node?.dataset?.minToday || 'true').toLowerCase() !== 'false';
    const parseDateBound = (value = '') => {
      const text = String(value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
      return text;
    };
    const parseDateTimeBound = (value = '') => {
      const text = String(value || '').trim();
      if (!text) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text;
      return null;
    };
    const toDateTimeMinBound = (value = '') => {
      const text = String(value || '').trim();
      if (!text) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00`;
      return text;
    };
    const toDateTimeMaxBound = (value = '') => {
      const text = String(value || '').trim();
      if (!text) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59`;
      return text;
    };
    const dispatchSyntheticChange = (node) => {
      if (!node) return;
      node.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    };
    const bindDateInput = (node, withMinToday = true) => {
      if (!node || node.dataset.fpReady === '1') return;
      const initial = node.value || '';
      const explicitMinDate = parseDateBound(node.dataset?.minDate || '');
      const explicitMaxDate = parseDateBound(node.dataset?.maxDate || '');
      window.flatpickr(node, {
        disableMobile: true,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'F j, Y',
        minDate: explicitMinDate || (withMinToday ? 'today' : null),
        maxDate: explicitMaxDate || null,
        defaultDate: initial || null,
        allowInput: true,
        onChange: (_selectedDates, dateStr) => {
          if (this.syncingCheckoutDate) return;
          node.value = dateStr || '';
          if (node.id === 'stayCheckIn') {
            this.syncCheckoutDateByMinimumNights({ forceApply: true });
          } else if (node.id === 'stayCheckOut') {
            this.syncCheckoutDateByMinimumNights({ forceApply: false });
          }
        },
      });
      node.dataset.fpReady = '1';
    };

    const bindDateTimeInput = (node, withMinToday = true) => {
      if (!node || node.dataset.fpReady === '1') return;
      const initial = node.value || '';
      const explicitMinDateRaw = parseDateTimeBound(node.dataset?.minDate || '');
      const explicitMaxDateRaw = parseDateTimeBound(node.dataset?.maxDate || '');
      const explicitMinDate = toDateTimeMinBound(explicitMinDateRaw || '');
      const explicitMaxDate = toDateTimeMaxBound(explicitMaxDateRaw || '');
      let lastAppliedValue = String(initial || '').trim();
      const syncValueAndEmit = (dateStr = '') => {
        const nextValue = String(dateStr || '').trim();
        if (node.value !== nextValue) {
          node.value = nextValue;
        }
        if (nextValue !== lastAppliedValue) {
          lastAppliedValue = nextValue;
          dispatchSyntheticChange(node);
        }
      };
      const parseTypedDateTime = (raw = '') => {
        const value = String(raw || '').trim();
        if (!value || !window.flatpickr) return null;
        const fromStorage = window.flatpickr.parseDate(value, 'Y-m-d\\TH:i');
        if (fromStorage) return fromStorage;
        const fromStorageWithSpace = window.flatpickr.parseDate(value, 'Y-m-d H:i');
        if (fromStorageWithSpace) return fromStorageWithSpace;
        const fromDisplay = window.flatpickr.parseDate(value, 'F j, Y H:i');
        if (fromDisplay) return fromDisplay;
        const native = new Date(value);
        if (!Number.isNaN(native.getTime())) return native;
        return null;
      };
      const fp = window.flatpickr(node, {
        disableMobile: true,
        enableTime: true,
        time_24hr: true,
        minuteIncrement: 5,
        dateFormat: 'Y-m-d\\TH:i',
        altInput: false,
        allowInput: true,
        minDate: explicitMinDate || (withMinToday ? 'today' : null),
        maxDate: explicitMaxDate || null,
        defaultDate: initial || null,
        parseDate: (dateStr, format) => {
          const parsed = parseTypedDateTime(dateStr);
          if (parsed) return parsed;
          return window.flatpickr.parseDate(dateStr, format);
        },
        onChange: (_selectedDates, dateStr) => {
          syncValueAndEmit(dateStr);
        },
        onValueUpdate: (_selectedDates, dateStr) => {
          syncValueAndEmit(dateStr);
        },
        onClose: (_selectedDates, dateStr, fp) => {
          let nextValue = String(dateStr || '').trim();
          if (!nextValue && fp) {
            const manual = String(fp.altInput?.value || fp.input?.value || '').trim();
            if (manual) {
              const parsedManual = parseTypedDateTime(manual);
              if (parsedManual) {
                fp.setDate(parsedManual, false);
                nextValue = fp.formatDate(parsedManual, 'Y-m-d\\TH:i');
              }
            }
          }
          syncValueAndEmit(nextValue);
        },
      });
      const commitManualDateTime = () => {
        const manual = String(fp?.altInput?.value || fp?.input?.value || '').trim();
        if (!manual) {
          syncValueAndEmit('');
          return;
        }
        const parsedManual = parseTypedDateTime(manual);
        if (!parsedManual) return;
        fp.setDate(parsedManual, false);
        const normalized = fp.formatDate(parsedManual, 'Y-m-d\\TH:i');
        syncValueAndEmit(normalized);
      };
      if (fp?.altInput) {
        fp.altInput.addEventListener('blur', () => {
          commitManualDateTime();
        });
        fp.altInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            commitManualDateTime();
          }
        });
      }
      node.addEventListener('blur', () => {
        commitManualDateTime();
      });
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          commitManualDateTime();
        }
      });
      node.dataset.fpReady = '1';
    };
    const allDateInputs = [...this.shadowRoot.querySelectorAll('[data-date-picker]')];
    allDateInputs.forEach((node) => bindDateInput(node, parseMinToday(node)));
    const dateTimeInputs = [...this.shadowRoot.querySelectorAll('[data-datetime-picker]')];
    dateTimeInputs.forEach((node) => bindDateTimeInput(node, parseMinToday(node)));
    this.syncCheckoutDateByMinimumNights({ forceApply: false });
  }

  isUiBusy() {
    return this.loading === true || this.submitting === true;
  }

  beginSubmitting() {
    if (this.isUiBusy() || this.state.submissionStatus === 'success') return false;
    this.submitting = true;
    this.scheduleRender();
    return true;
  }

  bindEvents() {
    this.shadowRoot.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const stepJumpNode = target.closest('.chip-jump[data-step-jump]');
      if (stepJumpNode instanceof HTMLElement) {
        const step = Math.max(1, Number(stepJumpNode.getAttribute('data-step-jump') || 0));
        if (step > 0) {
          this.emit('draft-update', {
            type: 'step-jump',
            payload: { step },
          });
        }
        return;
      }

      if (target.classList.contains('guests-stepper-btn')) {
        const isCustomRetreat = this.isCustomRetreatRequest();
        const inputId = isCustomRetreat ? 'customRetreatGuests' : 'stayGuests';
        const input = this.shadowRoot.getElementById(inputId);
        const current = Number(input?.value || 1);
        const min = Math.max(1, Number(input?.min || 1));
        const max = Math.max(min, Number(input?.max || 14));
        const delta = Number(target.getAttribute('data-delta') || 0);
        const next = Math.max(min, Math.min(max, current + delta));
        if (input) input.value = String(next);
        if (isCustomRetreat) {
          this.emit('draft-update', {
            type: 'custom-retreat-guest-count',
            payload: { guests: next },
          });
        } else if (this.getVariant() === 'enquiry' && this.isSurfActivityEnquiry()) {
          this.emit('draft-update', {
            type: 'enquiry-guest-count',
            payload: { guests: next },
          });
        }
      }
      if (target.classList.contains('package-guests-stepper-btn')) {
        const input = this.shadowRoot.getElementById('packageGuests');
        if (!input || input.disabled) return;
        const current = Number(input?.value || 1);
        const maxRaw = Number(input?.max || 14);
        if (!Number.isFinite(maxRaw) || maxRaw <= 0) return;
        const min = Math.max(1, Number(input?.min || 1));
        const max = Math.max(min, maxRaw);
        const delta = Number(target.getAttribute('data-delta') || 0);
        const next = Math.max(min, Math.min(max, current + delta));
        if (input) input.value = String(next);
      }

      if (target.classList.contains('qty-stepper-btn')) {
        const roomTypeKey = target.getAttribute('data-room-type');
        const delta = Number(target.getAttribute('data-delta') || 0);
        const next = this.getRoomQty(roomTypeKey) + delta;
        this.updateRoomQty(roomTypeKey, next);
      }
      const roomCard = target.closest('.room-card-quick-select');
      if (
        roomCard instanceof HTMLElement &&
        !roomCard.classList.contains('room-card-unavailable') &&
        !target.closest('button') &&
        !target.closest('input') &&
        !target.closest('select') &&
        !target.closest('textarea') &&
        !target.closest('label')
      ) {
        const roomTypeKey = String(roomCard.getAttribute('data-room-type') || '').trim();
        if (roomTypeKey) {
          this.applyQuickRoomSelection(roomTypeKey);
        }
      }
      const retreatCard = target.closest('.retreat-card-select');
      if (
        retreatCard instanceof HTMLElement &&
        !target.closest('button') &&
        !target.closest('input') &&
        !target.closest('select') &&
        !target.closest('textarea') &&
        !target.closest('label')
      ) {
        const retreatKey = String(retreatCard.getAttribute('data-retreat-key') || '').trim().toLowerCase();
        if (retreatKey === 'custom') {
          this.emit('draft-update', {
            type: 'custom-retreat-chosen',
            payload: {},
          });
          this.log('custom retreat chosen (card)');
        } else if (retreatKey) {
          this.emit('draft-update', {
            type: 'retreat-select',
            payload: { retreatKey },
          });
          this.log('retreat selected (card)', { retreatKey });
        }
      }

      if (target.id === 'btnSwitchToSurfStay') {
        this.emit('draft-update', {
          type: 'stay-flow-switch',
          payload: { flow: 'surf_stay' },
        });
        this.log('stay flow switch requested', { flow: 'surf_stay' });
      }

      if (target.id === 'btnDismissSurfStayOffer') {
        this.emit('draft-update', {
          type: 'stay-flow-offer-dismiss',
          payload: {},
        });
        this.log('stay flow offer dismissed');
      }

      if (target.id === 'btnStayStep1Continue') {
        const payload = {
          guests: Number(this.shadowRoot.getElementById('stayGuests')?.value || 0),
          checkIn: this.shadowRoot.getElementById('stayCheckIn')?.value || '',
          checkOut: this.shadowRoot.getElementById('stayCheckOut')?.value || '',
        };
        this.emit('step-submit', {
          step: 1,
          variant: 'stay',
          payload,
        });
        this.log('step1 submitted', payload);
      }
      if (target.id === 'btnPackageStep1Continue') {
        const payload = {
          guests: Number(this.shadowRoot.getElementById('packageGuests')?.value || 0),
          packageSessionId: this.shadowRoot.getElementById('packageSession')?.value || '',
        };
        this.emit('step-submit', {
          step: 1,
          variant: 'package',
          payload,
        });
        this.log('package step1 submitted', payload);
      }
      if (target.id === 'btnEnquiryStep1Continue') {
        const payload = {
          guests: Number(this.shadowRoot.getElementById('stayGuests')?.value || 0),
          checkIn: this.shadowRoot.getElementById('stayCheckIn')?.value || '',
          checkOut: this.shadowRoot.getElementById('stayCheckOut')?.value || '',
          retreatSessionId: this.shadowRoot.getElementById('retreatSession')?.value || '',
          notes: this.shadowRoot.getElementById('enquiryNotes')?.value || '',
        };
        this.emit('step-submit', {
          step: 1,
          variant: 'enquiry',
          payload,
        });
        this.log('enquiry step1 submitted', payload);
      }
      if (target.classList.contains('retreat-select-btn')) {
        const retreatKey = String(target.getAttribute('data-retreat-key') || '').trim().toLowerCase();
        if (retreatKey === 'custom') {
          this.emit('draft-update', {
            type: 'custom-retreat-chosen',
            payload: {},
          });
          this.log('custom retreat chosen');
        } else if (retreatKey) {
          this.emit('draft-update', {
            type: 'retreat-select',
            payload: { retreatKey },
          });
          this.log('retreat selected', { retreatKey });
        }
      }

      if (target.id === 'btnStayStep2Refresh') {
        this.emit('request-options', {
          type: 'stay-room-options',
          payload: {
            guests: Number(this.shadowRoot.getElementById('stayGuests')?.value || 0),
            checkIn: this.shadowRoot.getElementById('stayCheckIn')?.value || '',
            checkOut: this.shadowRoot.getElementById('stayCheckOut')?.value || '',
          },
        });
        this.log('step2 refresh requested');
      }

      if (target.id === 'btnStayStep2Continue') {
        const payload = {
          roomSelections: this.getRoomSelections().map((row) => ({
            roomTypeKey: row.roomTypeKey,
            quantity: Number(row.quantity) || 0,
          })),
        };
        this.emit('step-submit', {
          step: 2,
          variant: this.getVariant(),
          payload,
        });
        this.log('step2 submitted', payload);
      }
      if (target.id === 'btnApplyRoomRecommendation') {
        this.emit('draft-update', {
          type: 'room-recommendation-action',
          payload: { action: 'apply' },
        });
      }
      if (target.id === 'btnDismissRoomRecommendation') {
        this.emit('draft-update', {
          type: 'room-recommendation-action',
          payload: { action: 'dismiss' },
        });
      }

      if (target.id === 'btnStayStep3Refresh') {
        this.emit('request-options', {
          type: 'stay-addon-options',
          payload: {},
        });
        this.log('step3 refresh requested');
      }

      if (target.id === 'btnStayStep3Continue') {
        this.emit('step-submit', {
          step: 3,
          variant: this.getVariant(),
          payload: {},
        });
        this.log('step3 submitted');
      }

      if (target.classList.contains('transfer-vehicles-btn')) {
        const delta = Number(target.getAttribute('data-delta') || 0);
        const vehiclesKey = String(target.getAttribute('data-vehicles-key') || '').toLowerCase();
        if (vehiclesKey === 'airport' || vehiclesKey === 'bus') {
          const current = this.getTransferVehiclesByType(vehiclesKey);
          const next = this.normalizeTransferVehicles((current || 1) + delta);
          this.emit('draft-update', {
            type: 'core-transfer-vehicles-by-type',
            payload: { transferType: vehiclesKey, vehicles: next },
          });
        } else {
          const current = Math.max(1, Number(this.state.coreAddons?.transferVehicles || 1));
          const next = this.normalizeTransferVehicles(current + delta);
          this.emit('draft-update', {
            type: 'core-transfer-vehicles',
            payload: { transferVehicles: next },
          });
        }
      }

      if (target.id === 'btnSubmitBooking') {
        if (!this.beginSubmitting()) return;
        this.emit('submit-booking', {
          variant: this.getVariant(),
          state: this.state,
        });
        this.log('submit booking clicked', { variant: this.getVariant() });
      }

      // ---- Custom Retreat (bespoke 5-step request flow) ----
      if (target.id === 'btnCustomRetreatStep1Continue') {
        const guestsRaw = Number(this.shadowRoot.getElementById('customRetreatGuests')?.value || 1);
        const checkIn = String(this.shadowRoot.getElementById('customRetreatCheckIn')?.value || '').trim();
        const checkOut = String(this.shadowRoot.getElementById('customRetreatCheckOut')?.value || '').trim();
        this.emit('step-submit', {
          step: 1,
          variant: 'enquiry',
          flow: 'custom_retreat',
          payload: { guests: Math.max(1, guestsRaw), checkIn, checkOut },
        });
      }
      if (target.id === 'btnCustomRetreatStep2Continue') {
        const wholeHouse = !!this.shadowRoot.getElementById('customRetreatWholeHouse')?.checked;
        const roomSelections = wholeHouse
          ? []
          : this.getCustomRetreatRoomTypes()
              .map((rt) => {
                const input = this.shadowRoot.querySelector(`.custom-retreat-room-qty[data-room-type="${rt.roomTypeKey}"]`);
                const sanitized = String(input?.value || '').replace(/[^0-9]/g, '');
                const quantity = Math.max(0, Math.min(rt.maxUnits, Number(sanitized || 0)));
                return { roomTypeKey: rt.roomTypeKey, quantity };
              })
              .filter((row) => row.quantity > 0);
        this.emit('step-submit', {
          step: 2,
          variant: 'enquiry',
          flow: 'custom_retreat',
          payload: { wholeHouseEnquiry: wholeHouse, roomSelections },
        });
      }
      if (target.id === 'btnCustomRetreatStep3Continue') {
        const checked = [...this.shadowRoot.querySelectorAll('.custom-retreat-type-toggle')]
          .filter((el) => el.checked)
          .map((el) => String(el.getAttribute('data-type-key') || '').trim().toLowerCase())
          .filter(Boolean);
        const otherText = String(this.shadowRoot.getElementById('customRetreatTypeOther')?.value || '').trim();
        this.emit('step-submit', {
          step: 3,
          variant: 'enquiry',
          flow: 'custom_retreat',
          payload: { retreatTypes: checked, retreatTypeOther: otherText },
        });
      }
      if (target.id === 'btnCustomRetreatStep4Continue') {
        const vision = String(this.shadowRoot.getElementById('customRetreatVision')?.value || '').trim();
        const activitiesWanted = String(this.shadowRoot.getElementById('customRetreatActivities')?.value || '').trim();
        const specialRequirements = String(this.shadowRoot.getElementById('customRetreatSpecialRequirements')?.value || '').trim();
        this.emit('step-submit', {
          step: 4,
          variant: 'enquiry',
          flow: 'custom_retreat',
          payload: { vision, activitiesWanted, specialRequirements },
        });
      }
      if (target.id === 'btnCustomRetreatSubmit') {
        if (!this.beginSubmitting()) return;
        const country = String(this.shadowRoot.getElementById('customRetreatCountry')?.value || '').trim();
        this.emit('draft-update', {
          type: 'custom-retreat-country',
          payload: { country },
        });
        this.emit('submit-booking', {
          variant: 'enquiry',
          flow: 'custom_retreat',
          state: this.state,
        });
        this.log('custom retreat submit clicked');
      }
      if (target.classList.contains('custom-retreat-back-btn')) {
        const stepNum = Number(target.getAttribute('data-target-step') || 1);
        this.emit('draft-update', {
          type: 'custom-retreat-step-back',
          payload: { step: Math.max(1, stepNum) },
        });
      }
      if (target.classList.contains('custom-retreat-room-step')) {
        const roomTypeKey = String(target.getAttribute('data-room-type') || '').trim();
        const delta = Number(target.getAttribute('data-delta') || 0);
        const input = this.shadowRoot.querySelector(`.custom-retreat-room-qty[data-room-type="${roomTypeKey}"]`);
        if (!input) return;
        // Input is now type="text" (cleaner UI without native spinners) — read max from data-max
        // and parse the digits-only value to keep behaviour identical to the previous number input.
        const max = Math.max(0, Number(input.getAttribute('data-max') || 0));
        const sanitized = String(input.value || '').replace(/[^0-9]/g, '');
        const current = Math.max(0, Number(sanitized || 0));
        const next = Math.max(0, Math.min(max, current + delta));
        input.value = String(next);
        this.emit('draft-update', {
          type: 'custom-retreat-room-qty',
          payload: { roomTypeKey, quantity: next },
        });
      }
    });

    this.shadowRoot.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (this.syncingCheckoutDate && (target.id === 'stayCheckIn' || target.id === 'stayCheckOut')) {
        return;
      }
      if (target.id === 'stayCheckIn') {
        this.syncCheckoutDateByMinimumNights({ forceApply: true });
      }
      if (target.id === 'stayCheckOut') {
        this.syncCheckoutDateByMinimumNights({ forceApply: false });
      }
      if (target.id === 'stayGuests' && this.getVariant() === 'enquiry' && this.isSurfActivityEnquiry()) {
        const guests = Math.max(1, Number(target.value || 1));
        this.emit('draft-update', {
          type: 'enquiry-guest-count',
          payload: { guests },
        });
      }

      // ---- Custom Retreat (bespoke 5-step request flow) ----
      if (target.id === 'customRetreatGuests') {
        const guests = Math.max(1, Number(target.value || 1));
        this.emit('draft-update', {
          type: 'custom-retreat-guest-count',
          payload: { guests },
        });
      }
      if (target.id === 'customRetreatCheckIn' || target.id === 'customRetreatCheckOut') {
        const checkIn = String(this.shadowRoot.getElementById('customRetreatCheckIn')?.value || '').trim();
        const checkOut = String(this.shadowRoot.getElementById('customRetreatCheckOut')?.value || '').trim();
        this.emit('draft-update', {
          type: 'custom-retreat-dates',
          payload: { checkIn, checkOut },
        });
      }
      if (target.id === 'customRetreatWholeHouse') {
        this.emit('draft-update', {
          type: 'custom-retreat-whole-house',
          payload: { value: target.checked === true },
        });
      }
      if (target.classList.contains('custom-retreat-room-qty')) {
        const roomTypeKey = String(target.getAttribute('data-room-type') || '').trim();
        const max = Math.max(0, Number(target.getAttribute('data-max') || 0));
        const sanitized = String(target.value || '').replace(/[^0-9]/g, '');
        const quantity = Math.max(0, Math.min(max, Number(sanitized || 0)));
        if (String(target.value) !== String(quantity)) target.value = String(quantity);
        this.emit('draft-update', {
          type: 'custom-retreat-room-qty',
          payload: { roomTypeKey, quantity },
        });
      }
      if (target.classList.contains('custom-retreat-type-toggle')) {
        const checked = [...this.shadowRoot.querySelectorAll('.custom-retreat-type-toggle')]
          .filter((el) => el.checked)
          .map((el) => String(el.getAttribute('data-type-key') || '').trim().toLowerCase())
          .filter(Boolean);
        const otherText = String(this.shadowRoot.getElementById('customRetreatTypeOther')?.value || '').trim();
        this.emit('draft-update', {
          type: 'custom-retreat-types',
          payload: { retreatTypes: checked, retreatTypeOther: otherText },
        });
      }
      if (target.id === 'customRetreatCountry') {
        this.emit('draft-update', {
          type: 'custom-retreat-country',
          payload: { country: String(target.value || '').trim() },
        });
      }
      if (target.id === 'customRetreatTypeOther') {
        const checked = [...this.shadowRoot.querySelectorAll('.custom-retreat-type-toggle')]
          .filter((el) => el.checked)
          .map((el) => String(el.getAttribute('data-type-key') || '').trim().toLowerCase())
          .filter(Boolean);
        this.emit('draft-update', {
          type: 'custom-retreat-types',
          payload: { retreatTypes: checked, retreatTypeOther: String(target.value || '').trim() },
        });
      }
      if (target.classList.contains('qty-input')) {
        const roomTypeKey = target.getAttribute('data-room-type');
        const quantity = Number(target.value || 0);
        this.updateRoomQty(roomTypeKey, quantity);
      }
      if (target.classList.contains('addon-toggle')) {
        const key = target.getAttribute('data-addon-key');
        this.emit('draft-update', {
          type: 'core-addon-toggle',
          payload: { key, value: target.checked === true },
        });
      }
      if (target.id === 'transferType') {
        const transferType = target.value || 'none';
        this.emit('draft-update', {
          type: 'core-transfer-select',
          payload: {
            transferType,
            transferTypes: transferType === 'none' ? [] : [transferType],
          },
        });
      }
      if (target.classList.contains('transfer-radio')) {
        const transferType = target.value || 'none';
        this.emit('draft-update', {
          type: 'core-transfer-select',
          payload: {
            transferType,
            transferTypes: transferType === 'none' ? [] : [transferType],
          },
        });
      }
      if (target.classList.contains('transfer-multi-checkbox')) {
        const checked = [...this.shadowRoot.querySelectorAll('.transfer-multi-checkbox')]
          .filter((input) => input.checked)
          .map((input) => input.value);
        this.emit('draft-update', {
          type: 'core-transfer-types',
          payload: { transferTypes: checked },
        });
      }
      if (target.classList.contains('transfer-together-radio')) {
        this.emit('draft-update', {
          type: 'core-transfer-group',
          payload: { transferTravelTogether: target.value || 'yes' },
        });
      }
      if (target.id === 'transferVehicles') {
        this.emit('draft-update', {
          type: 'core-transfer-vehicles',
          payload: { transferVehicles: this.normalizeTransferVehicles(target.value || 1) },
        });
      }
      if (target.classList.contains('transfer-vehicles-input')) {
        const vehiclesKey = String(target.getAttribute('data-vehicles-key') || '').toLowerCase();
        if (vehiclesKey === 'airport' || vehiclesKey === 'bus') {
          this.emit('draft-update', {
            type: 'core-transfer-vehicles-by-type',
            payload: {
              transferType: vehiclesKey,
              vehicles: this.normalizeTransferVehicles(target.value || 1),
            },
          });
        }
      }
      if (target.classList.contains('stay-single-preference-toggle')) {
        this.emit('draft-update', {
          type: 'stay-single-preference',
          payload: { value: target.checked === true },
        });
      }
      if (target.classList.contains('enquiry-activity-select')) {
        if (!(target instanceof HTMLInputElement)) return;
        if (target.checked !== true) {
          target.checked = true;
          return;
        }
        this.emit('draft-update', {
          type: 'guest-detail-field',
          payload: {
            index: Number(target.getAttribute('data-guest-index') || 0),
            key: 'enquiryActivityKey',
            value: target.getAttribute('data-activity-key') || '',
          },
        });
      }
      if (target.classList.contains('experience-toggle')) {
        this.emit('draft-update', {
          type: 'experience-toggle',
          payload: {
            activityKey: target.getAttribute('data-activity-key') || '',
            title: target.getAttribute('data-activity-title') || '',
            selected: target.checked === true,
          },
        });
      }
      if (target.classList.contains('experience-lesson-format-toggle')) {
        this.emit('draft-update', {
          type: 'experience-lesson-format',
          payload: {
            activityKey: target.getAttribute('data-activity-key') || '',
            lessonFormat: target.checked ? 'extended' : '',
          },
        });
      }
      if (target.classList.contains('activity-date-input')) {
        this.emit('draft-update', {
          type: 'activity-date-field',
          payload: {
            activityKey: target.getAttribute('data-activity-key') || '',
            value: target.value || '',
          },
        });
      }
      if (target.classList.contains('retreat-intake-input')) {
        const intakeKey = String(target.getAttribute('data-intake-key') || '').trim();
        if (intakeKey) {
          if (target instanceof HTMLInputElement && target.type === 'checkbox' && target.hasAttribute('data-intake-group')) {
            const group = String(target.getAttribute('data-intake-group') || '').trim();
            const checked = [...this.shadowRoot.querySelectorAll(`.retreat-intake-input[data-intake-group="${group}"]`)]
              .filter((input) => input instanceof HTMLInputElement && input.checked)
              .map((input) => String(input.value || '').trim())
              .filter(Boolean);
            this.emit('draft-update', {
              type: 'retreat-intake-field',
              payload: { key: intakeKey, value: checked },
            });
          } else {
            this.emit('draft-update', {
              type: 'retreat-intake-field',
              payload: { key: intakeKey, value: target.value || '' },
            });
          }
        }
      }
      if (target.classList.contains('surf-single-choice') && target instanceof HTMLInputElement && target.checked) {
        const singleGroup = String(target.getAttribute('data-single-group') || '').trim();
        if (singleGroup) {
          const peers = [...this.shadowRoot.querySelectorAll(`.surf-single-choice[data-single-group="${singleGroup}"]`)];
          peers.forEach((peer) => {
            if (peer instanceof HTMLInputElement && peer !== target) {
              peer.checked = false;
            }
          });
        }
      }
      if (target.classList.contains('guest-detail-input')) {
        const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
        const checkedValue = target.getAttribute('data-checked-value') || 'extended';
        const uncheckedValue = target.getAttribute('data-unchecked-value') || '';
        this.emit('draft-update', {
          type: 'guest-detail-field',
          payload: {
            index: Number(target.getAttribute('data-guest-index') || 0),
            key: target.getAttribute('data-guest-key') || '',
            value: isCheckbox ? (target.checked ? checkedValue : uncheckedValue) : target.value || '',
          },
        });
      }
      if (target.classList.contains('transfer-shared-input')) {
        this.emit('draft-update', {
          type: 'transfer-shared-field',
          payload: {
            key: target.getAttribute('data-shared-key') || '',
            value: target.value || '',
          },
        });
      }
      if (target.classList.contains('contact-input')) {
        const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
        this.emit('draft-update', {
          type: 'contact-field',
          payload: {
            key: target.getAttribute('data-field-key') || '',
            value: isCheckbox ? target.checked === true : target.value || '',
          },
        });
      }
      if (target.classList.contains('package-session-select')) {
        this.emit('draft-update', {
          type: 'package-session-select',
          payload: { packageSessionId: target.value || '' },
        });
      }
      if (target.classList.contains('retreat-session-select')) {
        this.emit('draft-update', {
          type: 'retreat-session-select',
          payload: { retreatSessionId: target.value || '' },
        });
      }
    });
  }

  renderStepChips(steps, currentStep) {
    const canJumpBack = this.state.submissionStatus !== 'success';
    return steps
      .map((label, index) => {
        const n = index + 1;
        const cls = n === currentStep ? 'active' : n < currentStep ? 'done' : '';
        const jumpable = canJumpBack && n < currentStep;
        return `<div class="chip ${cls} ${jumpable ? 'chip-jump' : ''}" ${jumpable ? `data-step-jump="${n}"` : ''}><span class="dot">${n}</span><span>${label}</span></div>`;
      })
      .join('');
  }

  renderStayStep1(currentStep) {
    const hidden = currentStep !== 1 ? 'hidden' : '';
    const stepErr = this.errors.step1 || '';
    const flowKey = String(this.getFlowKey() || '').toLowerCase();
    const showSurfStayOffer = flowKey === 'bnb' && this.state.surfStayOfferDismissed !== true;
    const surfStayOffer = showSurfStayOffer
      ? `
        <div class="stay-flow-offer">
          <div class="stay-flow-offer-title">Planning to surf while staying with us?</div>
          <p class="stay-flow-offer-copy">
            Looking for the Surf & Stay option? We can switch this booking to Surf & Stay right here.
          </p>
          <div class="stay-flow-offer-actions">
            <button type="button" class="offer-primary" id="btnSwitchToSurfStay" ${this.loading ? 'disabled' : ''}>Yes, show Surf & Stay</button>
            <button type="button" class="offer-secondary" id="btnDismissSurfStayOffer" ${this.loading ? 'disabled' : ''}>No, thanks</button>
          </div>
        </div>
      `
      : '';
    return `
      <section class="step-card enquiry-step ${hidden}">
        ${surfStayOffer}
        <h3>Guests & Dates</h3>
        <div class="row">
          <div>
            <label>Guests <span class="req">*</span></label>
            <div class="stepper-wrap">
              <button type="button" class="guests-stepper-btn" data-delta="-1">-</button>
              <input id="stayGuests" type="number" min="1" max="14" value="${this.state.guestCount || 1}" />
              <button type="button" class="guests-stepper-btn" data-delta="1">+</button>
            </div>
          </div>
          <div>
            <label>Check In <span class="req">*</span></label>
            <input id="stayCheckIn" data-date-picker data-min-today="true" type="text" placeholder="YYYY-MM-DD" value="${this.state.checkIn || ''}" />
          </div>
          <div>
            <label>Check Out <span class="req">*</span></label>
            <input id="stayCheckOut" data-date-picker data-min-today="true" type="text" placeholder="YYYY-MM-DD" value="${this.state.checkOut || ''}" />
          </div>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnStayStep1Continue" ${this.loading ? 'disabled' : ''}>Check availability</button>
      </section>
    `;
  }

  renderPackageStep1(currentStep) {
    const hidden = currentStep !== 1 ? 'hidden' : '';
    const stepErr = this.errors.step1 || '';
    const flowKey = this.getFlowKey();
    const isRetreatFlow = flowKey === 'retreats';
    const sessions = Array.isArray(this.options.packageSessions) ? this.options.packageSessions : [];
    const selectedSessionId = this.state.packageSessionId || sessions[0]?.sessionId || '';
    const selectedSession = sessions.find((row) => String(row.sessionId || '') === String(selectedSessionId)) || sessions[0] || {};
    const minParticipants = Math.max(1, Number(selectedSession.minParticipants || this.state.packageMinParticipants || 1));
    const maxParticipants = Math.max(minParticipants, Number(selectedSession.maxParticipants || this.state.packageMaxParticipants || 14));
    const participantsLeft = Math.max(
      0,
      Number(
        selectedSession.participantsLeft != null
          ? selectedSession.participantsLeft
          : this.state.packageParticipantsLeft != null
          ? this.state.packageParticipantsLeft
          : maxParticipants
      )
    );
    const isSoldOut = selectedSession.isSoldOut === true || (maxParticipants > 0 && participantsLeft <= 0);
    const maxSelectableParticipants = isSoldOut ? 0 : Math.max(1, Math.min(maxParticipants, participantsLeft || maxParticipants));
    const guestsValueRaw = Number(this.state.guestCount || 1);
    const guestsValue = isSoldOut ? 0 : Math.max(1, Math.min(maxSelectableParticipants, guestsValueRaw));
    const optionsHtml = sessions.length
      ? sessions
          .map((row) => {
            const start = row.sessionStartDateKey || '-';
            const end = row.sessionEndDateKey || '-';
            const nights = Number(row.nights || 0);
            const left = Number(row.participantsLeft || 0);
            const max = Number(row.maxParticipants || 0);
            const booked = Number(row.participantsBooked || 0);
            const soldOut = row.isSoldOut === true || (max > 0 && left <= 0);
            const label = `${start} -> ${end}${nights > 0 ? ` (${nights} nights)` : ''} | ${booked}/${max} booked${
              left >= 0 ? ` | ${left} left` : ''
            }`;
            return `<option value="${row.sessionId || ''}" ${String(row.sessionId || '') === String(selectedSessionId) ? 'selected' : ''} ${
              soldOut ? 'disabled' : ''
            }>${label}${soldOut ? ' · SOLD OUT' : ''}</option>`;
          })
          .join('')
      : '<option value="">No open sessions available</option>';
    const retreat = isRetreatFlow
      ? this.getRetreatCatalog().find((row) => String(row.retreatKey || '') === this.getRetreatKey()) || {}
      : {};
    const lateWindowDays = Math.max(0, Number(retreat.lateBookingWindowDays || 90)) || 90;
    const paymentNote = isRetreatFlow
      ? Number(selectedSession?.sessionStartDateKey ? Math.ceil((new Date(`${selectedSession.sessionStartDateKey}T12:00:00`).getTime() - Date.now()) / 86400000) : 9999) <=
        lateWindowDays
        ? `This retreat starts within ${lateWindowDays} days. Full payment is required after your request is approved.`
        : `For retreats booked earlier than ${lateWindowDays} days before start, a 50% deposit is required after approval. The remaining balance is due ${lateWindowDays} days before start.`
      : 'A deposit is required for bookings made 3 months or more before the start date of your chosen package, with the final balance due 3 months prior to arrival. For bookings made less than 3 months before the start date, full payment is required to confirm the booking.';
    return `
      <section class="step-card ${hidden}">
        <h3>${isRetreatFlow ? 'Retreat Session & Participants' : 'Session & Participants'}</h3>
        <div class="row">
          <div style="grid-column: span 2;">
            <label>${isRetreatFlow ? 'Retreat session' : 'Package Dates'} <span class="req">*</span></label>
            <select id="packageSession" class="package-session-select">${optionsHtml}</select>
          </div>
          <div>
            <label>Participants <span class="req">*</span></label>
            <div class="stepper-wrap">
              <button type="button" class="package-guests-stepper-btn" data-delta="-1">-</button>
              <input id="packageGuests" type="number" min="${isSoldOut ? 0 : 1}" max="${maxSelectableParticipants}" value="${guestsValue}" ${
                isSoldOut ? 'disabled' : ''
              } />
              <button type="button" class="package-guests-stepper-btn" data-delta="1">+</button>
            </div>
          </div>
        </div>
        <p class="package-payment-note">${paymentNote}</p>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnPackageStep1Continue" ${this.loading || !sessions.length || isSoldOut ? 'disabled' : ''}>Check availability</button>
      </section>
    `;
  }

  renderEnquiryStep1(currentStep) {
    const hidden = currentStep !== 1 ? 'hidden' : '';
    const stepErr = this.errors.step1 || '';
    const enquiryType = this.getEnquiryType();
    const isRetreatEnquiry = enquiryType === 'custom_retreat';
    const selectedRetreatKey = this.getRetreatKey();
    const retreatCatalog = this.getRetreatCatalog();
    const selectedRetreat = retreatCatalog.find((row) => String(row.retreatKey || '') === selectedRetreatKey) || null;
    const retreatSessions = this.getRetreatSessions(selectedRetreatKey);
    const selectedRetreatSessionId = String(this.state.retreatSessionId || this.ctx.retreatSessionId || '').trim();
    const selectedRetreatSession =
      retreatSessions.find((row) => String(row.sessionId || '') === selectedRetreatSessionId) ||
      retreatSessions.find((row) => row.isSoldOut !== true) ||
      retreatSessions[0] ||
      null;
    const retreatLateWindowDays = Math.max(0, Number(selectedRetreat?.lateBookingWindowDays || 90)) || 90;
    const retreatDaysToStart = (() => {
      const startKey = selectedRetreatSession?.sessionStartDateKey || '';
      if (!startKey) return null;
      const startTs = new Date(`${startKey}T12:00:00`).getTime();
      if (!startTs) return null;
      return Math.max(0, Math.ceil((startTs - Date.now()) / 86400000));
    })();
    const retreatPaymentRuleText =
      retreatDaysToStart == null
        ? selectedRetreat?.paymentPolicyTextShort || '50% deposit required. Full payment for late bookings.'
        : retreatDaysToStart <= retreatLateWindowDays
          ? `Booking within ${retreatLateWindowDays} days of retreat start requires full payment after approval.`
          : `Booking earlier than ${retreatLateWindowDays} days requires a 50% deposit after approval, balance due ${retreatLateWindowDays} days before start.`;
    const isSurfActivity = enquiryType === 'surf_activity';
    const isActivityOnly = enquiryType === 'activity_enquiry';
    const requiresMin3 = enquiryType === 'custom_package';
    const experiences = this.getEnquiryActivities();
    const selectedKeys = new Set((this.state.experienceRequests || []).map((x) => x.activityKey));
    const retreatGuestsMax = isRetreatEnquiry
      ? Math.max(1, Number(selectedRetreatSession?.participantsLeft || selectedRetreat?.maxParticipantsDefault || 8))
      : 20;
    const guests = Math.max(
      1,
      Math.min(retreatGuestsMax, Number(this.state.guestCount || (requiresMin3 ? 3 : 1)))
    );
    const notes = this.state.activityRequestNotes || '';
    const defaultActivityKey =
      this.state.guestDetails?.[0]?.enquiryActivityKey ||
      this.ctx.activityKey ||
      this.state.experienceRequests?.[0]?.activityKey ||
      experiences[0]?.activityKey ||
      '';
    if (isRetreatEnquiry && !selectedRetreat) {
      return `
        <section class="step-card enquiry-step ${hidden}">
          <h3>Select your retreat</h3>
          <p class="meta">Choose one retreat to continue with your request. You will complete the mandatory intake form before submission.</p>
          <div class="experience-list retreat-selector-grid">
            ${retreatCatalog
              .map((item) => {
                const retreatTitle = item.title || item.name || item.retreatKey;
                const retreatImage = item.cardImage || item.heroImage || '';
                const isSelected = String(item.retreatKey || '') === String(selectedRetreatKey || '');
                const audienceIcon = String(item.audienceIcon || '').trim();
                const audienceIconUrl = audienceIcon.startsWith('//') ? `https:${audienceIcon}` : audienceIcon;
                const hasAudienceIconImage = /^https?:\/\//i.test(audienceIconUrl);
                const audienceHtml = audienceIcon
                  ? hasAudienceIconImage
                    ? `<img class="meta-icon-img" src="${audienceIconUrl}" alt="${item.audienceLabel || 'Audience'}" />${item.audienceLabel || ''}`
                    : `${audienceIcon} ${item.audienceLabel || ''}`
                  : item.audienceLabel || '';
                const nightsLabel = item.durationLabel || (item.durationNights ? `${item.durationNights} nights` : '');
                const priceWithNights = [item.priceLabel || '', nightsLabel].filter(Boolean).join(' / ');
                const audienceIconOnlyHtml = audienceIcon
                  ? hasAudienceIconImage
                    ? `<img class="meta-icon-img retreat-corner-icon-img" src="${audienceIconUrl}" alt="${item.audienceLabel || 'Audience'}" />`
                    : `<span class="retreat-corner-icon-text">${audienceIcon}</span>`
                  : '';
                return `<div class="exp-item-wrap retreat-card-select ${isSelected ? 'retreat-card-selected' : ''}" data-retreat-key="${item.retreatKey}">
                  <div class="exp-card">
                    <div class="exp-image-wrap">
                      ${
                        retreatImage
                          ? this.renderLazyExperienceImage(retreatImage, retreatTitle)
                          : '<div class="exp-image placeholder"></div>'
                      }
                    </div>
                    <div class="exp-content retreat-card-content">
                      <div class="exp-title-row">
                        <span class="exp-title">${retreatTitle}</span>
                        <span class="retreat-choice-pill ${isSelected ? 'selected' : ''}">${isSelected ? 'Selected' : 'Select'}</span>
                      </div>
                      <div class="exp-price">${priceWithNights}</div>
                      <div class="exp-meta-row">
                        <span>${item.audienceLabel || audienceHtml}</span>
                      </div>
                      <p class="exp-desc">${item.description || item.shortDescription || ''}</p>
                      <p class="exp-note">${item.includesLabel}</p>
                      <div class="retreat-corner-icon">${audienceIconOnlyHtml}</div>
                    </div>
                  </div>
                </div>`;
              })
              .join('')}
          </div>
          <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        </section>
      `;
    }
    const selectedActivity = experiences.find((item) => String(item.activityKey) === String(defaultActivityKey)) || experiences[0] || null;
    const guestPreviewDetails = Array.from({ length: guests }).map((_, idx) => this.state.guestDetails?.[idx] || {});
    const renderSurfLessonPicker = (guest, idx) => {
      const selectedKey = String(guest.enquiryActivityKey || defaultActivityKey || experiences[0]?.activityKey || '').trim();
      const selected = experiences.find((item) => String(item.activityKey) === selectedKey) || null;
      const alternatives = experiences.filter((item) => String(item.activityKey) !== selectedKey);
      const selectedLessonFormat = String(guest.lessonFormat || '').toLowerCase();
      const selectedPriceParts = this.getLessonPriceParts(selected || {});
      const selectedBasePrice =
        selectedPriceParts.base ||
        (!this.activitySupportsLessonFormat(selected?.activityKey || '')
          ? Number(selected?.priceFromEur || 0) > 0
            ? `From ${selected.priceFromEur} ${selected.currency || 'EUR'}`
            : 'Request'
          : '');
      const selectedExtendedAddonLabel = this.formatExtendedAddonLabel(selectedPriceParts.extended);
      const supportsExtendedAddon = this.activitySupportsLessonFormat(selected?.activityKey || '') && !!selectedExtendedAddonLabel;
      const isExtendedSelected = supportsExtendedAddon && selectedLessonFormat === 'extended';
      const selectedPrimaryPrice = isExtendedSelected ? selectedExtendedAddonLabel : selectedBasePrice;
      return `<div class="guest-card ${idx === 0 ? 'guest-card-contact' : ''}">
        <div class="guest-card-head">
          <div class="guest-card-title">Participant № ${idx + 1}</div>
          ${idx === 0 ? '<span class="guest-badge">Contact person</span>' : ''}
        </div>
        ${
          selected
            ? `<div class="exp-card enquiry-selected-card">
                <div class="exp-image-wrap">
                  ${
                    selected.image
                      ? this.renderLazyExperienceImage(selected.image, selected.title || selected.activityKey)
                      : '<div class="exp-image placeholder"></div>'
                  }
                </div>
                <div class="exp-content">
                  <div class="exp-title-row">
                    <span class="exp-title">${selected.title || selected.activityKey}</span>
                    <span class="selected-pill">Selected</span>
                  </div>
                  <div class="exp-meta-row ${selectedPrimaryPrice ? '' : 'hidden'}">
                    <span>${selectedPrimaryPrice || ''}</span>
                  </div>
                  ${selected.description ? `<p class="exp-desc">${this.sanitizeLessonDescription(selected.description)}</p>` : ''}
                </div>
              </div>`
            : '<p class="meta">No surf activity selected.</p>'
        }
        ${
          supportsExtendedAddon
            ? `<div class="lesson-addon-row">
                <label class="lesson-addon-toggle">
                  <input
                    class="guest-detail-input"
                    data-guest-index="${idx}"
                    data-guest-key="lessonFormat"
                    data-checked-value="extended"
                    data-unchecked-value=""
                    type="checkbox"
                    ${selectedLessonFormat === 'extended' ? 'checked' : ''}
                  />
                  <span class="lesson-addon-text">${selectedExtendedAddonLabel}</span>
                </label>
                ${this.renderExtendedLessonDescription()}
              </div>`
            : ''
        }
        <div class="meta enquiry-activity-switch-title">Want to change lesson type?</div>
        <div class="experience-list enquiry-switch-list">
          ${
            alternatives.length
              ? alternatives
                  .map((item) => {
                    const durationText = this.getActivityDurationText(item);
                    const itemPriceParts = this.getLessonPriceParts(item);
                    const priceText =
                      itemPriceParts.base || (Number(item.priceFromEur || 0) > 0 ? `From ${item.priceFromEur} ${item.currency || 'EUR'}` : '');
                    const showDurationMeta = this.shouldShowDurationMeta(priceText, durationText);
                    return `<label class="exp-item enquiry-switch-item">
                      <input
                        type="checkbox"
                        class="enquiry-activity-select"
                        data-guest-index="${idx}"
                        data-activity-key="${item.activityKey}"
                      />
                      <div class="exp-card">
                        <div class="exp-image-wrap">
                          ${item.image ? this.renderLazyExperienceImage(item.image, item.title || item.activityKey) : '<div class="exp-image placeholder"></div>'}
                        </div>
                        <div class="exp-content">
                          <div class="exp-title-row">
                            <span class="exp-title">${item.title || item.activityKey}</span>
                            <span class="enquiry-switch-indicator">Switch</span>
                          </div>
                          <div class="exp-meta-row ${priceText ? '' : 'hidden'}"><span>${priceText || ''}</span></div>
                          <div class="exp-meta-row ${showDurationMeta ? '' : 'hidden'}">${showDurationMeta ? `<span>Duration: ${durationText}</span>` : ''}</div>
                          ${item.description ? `<p class="exp-desc">${this.sanitizeLessonDescription(item.description)}</p>` : ''}
                        </div>
                      </div>
                    </label>`;
                  })
                  .join('')
              : '<p class="meta">No alternative surf lesson types available.</p>'
          }
        </div>
      </div>`;
    };
    const renderActivityCard = (item, options = {}) => {
      const isSelected = selectedKeys.has(item.activityKey);
      const durationText = this.getActivityDurationText(item);
      const supportsExtendedAddon = this.activitySupportsLessonFormat(item.activityKey || '') && !!this.formatExtendedAddonLabel(this.getLessonPriceParts(item).extended);
      const lessonFormat = this.getExperienceLessonFormat(item.activityKey);
      const priceText =
        this.lessonTypePriceLabel(item, lessonFormat) ||
        item.priceLabel ||
        (Number(item.priceFromEur || 0) > 0 ? `From ${item.priceFromEur} ${item.currency || 'EUR'}` : '');
      const showDurationMeta = this.shouldShowDurationMeta(priceText, durationText);
      const showToggle = options.showLessonToggle === true && isSelected && supportsExtendedAddon;
      return `<div class="exp-item-wrap">
        <label class="exp-item">
          <input type="checkbox"
            class="experience-toggle"
            data-activity-key="${item.activityKey}"
            data-activity-title="${item.title}"
            ${isSelected ? 'checked' : ''} />
          <div class="exp-card">
            <div class="exp-image-wrap">
              ${item.image ? this.renderLazyExperienceImage(item.image, item.title || item.activityKey) : '<div class="exp-image placeholder"></div>'}
            </div>
            <div class="exp-content">
              <div class="exp-title-row">
                <span class="exp-title">${item.title || item.activityKey}</span>
                <span class="exp-price">${priceText || 'Request'}</span>
              </div>
              <div class="exp-meta-row ${showDurationMeta ? '' : 'hidden'}">${showDurationMeta ? `<span>Duration: ${durationText}</span>` : ''}</div>
              ${item.description ? `<p class="exp-desc">${item.description}</p>` : ''}
              ${item.timeRestriction ? `<p class="exp-note">${item.timeRestriction}</p>` : ''}
              ${item.notes ? `<p class="exp-note">${item.notes}</p>` : ''}
            </div>
          </div>
        </label>
        ${
          showToggle
            ? `<div class="lesson-addon-row">
                <label class="lesson-addon-toggle">
                  <input
                    type="checkbox"
                    class="experience-lesson-format-toggle"
                    data-activity-key="${item.activityKey}"
                    ${lessonFormat === 'extended' ? 'checked' : ''}
                  />
                  <span class="lesson-addon-text">${this.formatExtendedAddonLabel(this.getLessonPriceParts(item).extended)}</span>
                </label>
                ${this.renderExtendedLessonDescription()}
              </div>`
            : ''
        }
      </div>`;
    };
    const renderExperienceCards = experiences.length
      ? experiences
          .map((item) => renderActivityCard(item, { showLessonToggle: isActivityOnly }))
          .join('')
      : '<p class="meta">No activities available for this enquiry.</p>';
    const renderActivityOnlyExtraCards = (() => {
      const selectedKey = String(selectedActivity?.activityKey || '').trim();
      const rows = experiences.filter((item) => String(item.activityKey || '') !== selectedKey);
      if (!rows.length) return '<p class="meta">No additional activities available.</p>';
      return rows
        .map((item) => renderActivityCard(item, { showLessonToggle: true }))
        .join('');
    })();

    return `
      <section class="step-card enquiry-step ${hidden}">
        <h3>${
          isRetreatEnquiry
            ? 'Retreat request details'
            : requiresMin3
              ? 'Custom package details'
              : isSurfActivity
                ? 'Surf lesson request'
                : isActivityOnly
                  ? 'Activity request'
                  : 'Request details'
        }</h3>
        ${
          isRetreatEnquiry && selectedRetreat
            ? `<div class="addon-block">
                <h4>${selectedRetreat.title || selectedRetreat.name || selectedRetreat.retreatKey}</h4>
                <p class="meta">${
                  selectedRetreat.audienceLabel || ''
                } · ${
                  selectedRetreat.durationLabel || (selectedRetreat.durationNights ? `${selectedRetreat.durationNights} nights` : '')
                } · ${selectedRetreat.priceLabel || ''}</p>
                <p class="meta">${selectedRetreat.includesLabel}</p>
                <div class="row">
                  <div style="grid-column: span 2;">
                    <label>Retreat session <span class="req">*</span></label>
                    <select id="retreatSession" class="retreat-session-select">
                      ${
                        retreatSessions.length
                          ? retreatSessions
                              .map((row) => {
                                const start = row.sessionStartDateKey || '-';
                                const end = row.sessionEndDateKey || '-';
                                const left = Math.max(0, Number(row.participantsLeft || 0));
                                const max = Math.max(0, Number(row.maxParticipants || 0));
                                const soldOut = row.isSoldOut === true;
                                const label = `${start} -> ${end}${row.nights ? ` (${row.nights} nights)` : ''} | ${left}/${max} left`;
                                return `<option value="${row.sessionId || ''}" ${
                                  String(row.sessionId || '') === String(selectedRetreatSession?.sessionId || '') ? 'selected' : ''
                                } ${soldOut ? 'disabled' : ''}>${label}${soldOut ? ' · SOLD OUT' : ''}</option>`;
                              })
                              .join('')
                          : '<option value="">No open retreat sessions available</option>'
                      }
                    </select>
                  </div>
                </div>
                <p class="package-payment-note">${retreatPaymentRuleText}</p>
              </div>`
            : ''
        }
        <div class="row">
          <div>
            <label>Guests <span class="req">*</span> ${requiresMin3 ? '(min 3)' : ''}</label>
            <div class="stepper-wrap">
              <button type="button" class="guests-stepper-btn" data-delta="-1">-</button>
              <input id="stayGuests" type="number" min="${requiresMin3 ? 3 : 1}" max="${retreatGuestsMax}" value="${guests}" />
              <button type="button" class="guests-stepper-btn" data-delta="1">+</button>
            </div>
          </div>
          <div class="${isSurfActivity || isRetreatEnquiry || isActivityOnly ? 'hidden' : ''}">
            <label>Preferred start date (optional)</label>
            <input id="stayCheckIn" data-date-picker data-min-today="true" type="text" placeholder="YYYY-MM-DD" value="${this.state.checkIn || ''}" />
          </div>
          <div class="${isSurfActivity || isRetreatEnquiry || isActivityOnly ? 'hidden' : ''}">
            <label>Preferred end date (optional)</label>
            <input id="stayCheckOut" data-date-picker data-min-today="true" type="text" placeholder="YYYY-MM-DD" value="${this.state.checkOut || ''}" />
          </div>
        </div>
        ${
          isSurfActivity
            ? `<div class="addon-block enquiry-activity-preview">
                ${guestPreviewDetails.map((guest, idx) => renderSurfLessonPicker(guest, idx)).join('')}
              </div>`
            : isActivityOnly
              ? `<div class="addon-block enquiry-activity-preview">
                  ${
                    selectedActivity
                      ? `<div class="exp-item-wrap">
                          <div class="exp-card enquiry-selected-card">
                          <div class="exp-image-wrap">
                            ${
                              selectedActivity.image
                                ? this.renderLazyExperienceImage(selectedActivity.image, selectedActivity.title || selectedActivity.activityKey)
                                : '<div class="exp-image placeholder"></div>'
                            }
                          </div>
                          <div class="exp-content">
                            <div class="exp-title-row">
                              <span class="exp-title">${selectedActivity.title || selectedActivity.activityKey}</span>
                              <span class="exp-price">${
                                this.lessonTypePriceLabel(
                                  selectedActivity,
                                  this.getExperienceLessonFormat(selectedActivity.activityKey)
                                ) ||
                                selectedActivity.priceLabel ||
                                (Number(selectedActivity.priceFromEur || 0) > 0
                                  ? `From ${selectedActivity.priceFromEur} ${selectedActivity.currency || 'EUR'}`
                                  : 'Request')
                              }</span>
                            </div>
                            ${selectedActivity.description ? `<p class="exp-desc">${selectedActivity.description}</p>` : ''}
                            ${selectedActivity.timeRestriction ? `<p class="exp-note">${selectedActivity.timeRestriction}</p>` : ''}
                            ${selectedActivity.notes ? `<p class="exp-note">${selectedActivity.notes}</p>` : ''}
                          </div>
                        </div>
                        ${
                          this.activitySupportsLessonFormat(selectedActivity.activityKey) &&
                          this.formatExtendedAddonLabel(this.getLessonPriceParts(selectedActivity).extended)
                            ? `<div class="lesson-addon-row">
                                <label class="lesson-addon-toggle">
                                  <input
                                    type="checkbox"
                                    class="experience-lesson-format-toggle"
                                    data-activity-key="${selectedActivity.activityKey}"
                                    ${this.getExperienceLessonFormat(selectedActivity.activityKey) === 'extended' ? 'checked' : ''}
                                  />
                                  <span class="lesson-addon-text">${this.formatExtendedAddonLabel(
                                    this.getLessonPriceParts(selectedActivity).extended
                                  )}</span>
                                </label>
                                ${this.renderExtendedLessonDescription()}
                              </div>`
                            : ''
                        }
                        </div>`
                      : '<p class="meta">No activity was preselected.</p>'
                  }
                  <div class="meta enquiry-activity-switch-title">Want to add more activities?</div>
                  <div class="experience-list" data-scroll-key="enquiry-activity-extra-list">
                    ${renderActivityOnlyExtraCards}
                  </div>
                </div>`
            : `<div class="addon-block">
                <h4>Activities / workshops / retreats (request)</h4>
                <p class="meta">Selections are request-based and confirmed manually by the team.</p>
                <div class="experience-list" data-scroll-key="enquiry-experience-list">${renderExperienceCards}</div>
              </div>`
        }
        ${
          isSurfActivity
            ? ''
            : `<div class="addon-block">
                <h4>${requiresMin3 ? 'Describe your request <span class="req">*</span>' : 'Additional notes (optional)'}</h4>
                <textarea class="contact-input" id="enquiryNotes" data-field-key="activityRequestNotes" placeholder="${
                  requiresMin3
                    ? 'Tell us what you want to book, dates flexibility, private use, special needs...'
                    : 'Optional notes for our team...'
                }">${notes}</textarea>
              </div>`
        }
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnEnquiryStep1Continue" ${
          this.loading || (isRetreatEnquiry && retreatSessions.length === 0) ? 'disabled' : ''
        }>Continue</button>
      </section>
    `;
  }

  renderEnquiryStep2(currentStep) {
    const hidden = currentStep !== 2 ? 'hidden' : '';
    const stepErr = this.errors.step2 || '';
    const submitted = this.state.submissionStatus === 'success';
    const isSurfActivity = this.isSurfActivityEnquiry();
    const isActivityOnly = this.isActivityOnlyEnquiry();
    const guests = Math.max(1, Number(this.state.guestCount || 1));
    const guestDetails = Array.from({ length: guests }).map((_, idx) => this.state.guestDetails?.[idx] || {});
    const activities = this.getEnquiryActivities();
    const surfLevelOptions = [
      { value: 'beginner', label: 'Beginner (never surfed / very little experience)' },
      { value: 'intermediate', label: 'Intermediate (can catch waves independently)' },
      { value: 'advanced', label: 'Advanced (confident in varied conditions)' },
    ];
    const waterConfidenceOptions = [
      { value: 'very_comfortable', label: 'Very comfortable' },
      { value: 'somewhat_comfortable', label: 'Somewhat comfortable' },
      { value: 'not_very_comfortable', label: 'Not very comfortable but willing to learn' },
    ];
    const renderOptions = (options, selected, placeholder) =>
      [`<option value="">${placeholder}</option>`]
        .concat(options.map((opt) => `<option value="${opt.value}" ${selected === opt.value ? 'selected' : ''}>${opt.label}</option>`))
        .join('');
    if (submitted) {
      return `
        <section class="step-card enquiry-step ${hidden}">
          <h3>Request received</h3>
          <div class="success-box">
            <p>Thank you, your enquiry has been received successfully.</p>
            <p>We will contact you within 12 hours with next steps and availability.</p>
          </div>
        </section>
      `;
    }
    if (!isSurfActivity) {
      const selectedActivityRows = (() => {
        const byKey = new Map((activities || []).map((row) => [String(row.activityKey || ''), row]));
        const selectedKeys = (Array.isArray(this.state.experienceRequests) ? this.state.experienceRequests : [])
          .map((row) => String(row.activityKey || '').trim())
          .filter(Boolean);
        const fallback = String(this.ctx.activityKey || '').trim();
        const mergedKeys = [...new Set([...selectedKeys, ...[fallback].filter(Boolean)])];
        return mergedKeys.map((key) => {
          const match = byKey.get(key) || {};
          return {
            activityKey: key,
            title: match.title || key,
          };
        });
      })();
      const activityDatePrefs = this.state.activityDatePrefs || {};
      const missingActivityDateKeys = selectedActivityRows
        .map((row) => String(row.activityKey || '').trim())
        .filter((key) => !!key && !String(activityDatePrefs[key] || '').trim());
      return `
        <section class="step-card ${hidden}">
          <h3>Contact</h3>
          <div class="guest-card guest-card-contact">
            <div class="row">
              <div>
                <label>Full name <span class="req">*</span></label>
                <input class="contact-input" data-field-key="guestName" type="text" value="${this.state.guestName || ''}" />
              </div>
              <div>
                <label>Email <span class="req">*</span></label>
                <input class="contact-input" data-field-key="guestEmail" type="email" value="${this.state.guestEmail || ''}" />
              </div>
              <div>
                <label>Phone <span class="req">*</span></label>
                <input class="contact-input" data-field-key="guestPhone" type="text" value="${this.state.guestPhone || ''}" />
              </div>
            </div>
          </div>
          ${
            isActivityOnly
              ? `<div class="guest-card">
                  <div class="guest-card-title">Preferred date per activity</div>
                  <p class="meta">Please pick a preferred date for each selected activity.</p>
                  <p class="error ${missingActivityDateKeys.length ? '' : 'hidden'}">Please choose dates for all selected activities.</p>
                  ${
                    selectedActivityRows.length
                      ? selectedActivityRows
                          .map(
                            (row) => {
                              const value = String(activityDatePrefs[row.activityKey] || '').trim();
                              const missing = !value;
                              const todayKey = new Date().toISOString().slice(0, 10);
                              return `<div class="row">
                              <div style="grid-column: span 3;">
                                <label>${row.title} <span class="req">*</span></label>
                                <input
                                  class="activity-date-input date-picker-input ${missing ? 'input-missing' : ''}"
                                  data-activity-key="${row.activityKey}"
                                  type="date"
                                  min="${todayKey}"
                                  value="${value}"
                                />
                                <p class="field-hint ${missing ? '' : 'hidden'}">Date is required for this activity.</p>
                              </div>
                            </div>`;
                            }
                          )
                          .join('')
                      : '<p class="meta">No activities selected yet.</p>'
                  }
                </div>`
              : ''
          }
          <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
          <button id="btnSubmitBooking" ${this.isUiBusy() ? 'disabled' : ''}>Submit enquiry</button>
          <label class="check-line terms-check terms-under-button">
            <input class="contact-input" data-field-key="termsAccepted" type="checkbox" ${this.state.termsAccepted ? 'checked' : ''} />
            <span>I agree to the booking terms and policy <span class="req">*</span>.</span>
          </label>
        </section>
      `;
    }

    return `
      <section class="step-card enquiry-step ${hidden}">
        <h3>Contact & participant details</h3>
        <div class="contact-section">
          ${guestDetails
            .map((guest, idx) => {
              const selectedKey =
                guest.enquiryActivityKey ||
                this.state.guestDetails?.[0]?.enquiryActivityKey ||
                this.ctx.activityKey ||
                this.state.experienceRequests?.[0]?.activityKey ||
                activities[0]?.activityKey ||
                '';
              const selectedActivity = activities.find((item) => String(item.activityKey) === String(selectedKey)) || null;
              const normalizedLessonFormat = String(guest.lessonFormat || '').toLowerCase() === 'extended' ? 'extended' : '';
              const priceParts = this.getLessonPriceParts(selectedActivity || {});
              const selectedBasePrice = priceParts.base || '';
              const selectedExtendedAddonLabel = this.formatExtendedAddonLabel(priceParts.extended);
              const participantPrimaryPrice =
                normalizedLessonFormat === 'extended' && selectedExtendedAddonLabel ? selectedExtendedAddonLabel : selectedBasePrice;
              return `<div class="guest-card ${idx === 0 ? 'guest-card-contact' : ''}">
                <div class="guest-card-head">
                  <div class="guest-card-title">Participant № ${idx + 1}</div>
                  ${idx === 0 ? '<span class="guest-badge">Contact person</span>' : ''}
                </div>
                <div class="participant-activity-box">
                  <div class="participant-activity-label">Selected activity</div>
                  <div class="participant-activity-value">${selectedActivity?.title || this.getActivityTitleByKey(selectedKey) || '-'}</div>
                  <div class="participant-activity-price">${participantPrimaryPrice}</div>
                </div>
                <div class="row">
                  <div>
                    <label>Full name <span class="req">*</span></label>
                    <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="fullName" type="text" value="${guest.fullName || ''}" />
                  </div>
                  <div>
                    <label>Email ${idx === 0 ? '<span class="req">*</span>' : '(optional)'}</label>
                    <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="email" type="email" value="${guest.email || ''}" />
                  </div>
                  <div>
                    <label>Phone ${idx === 0 ? '<span class="req">*</span>' : '(optional)'}</label>
                    <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="phone" type="text" value="${guest.phone || ''}" />
                  </div>
                </div>
                <div class="row">
                  <div>
                    <label>Preferred surf activity <span class="req">*</span></label>
                    <select class="guest-detail-input" data-guest-index="${idx}" data-guest-key="enquiryActivityKey">
                      ${
                        activities.length
                          ? activities
                              .map(
                                (item) =>
                                  `<option value="${item.activityKey}" ${String(item.activityKey) === String(selectedKey) ? 'selected' : ''}>${
                                    item.title || item.activityKey
                                  }</option>`
                              )
                              .join('')
                          : '<option value="">No activities available</option>'
                      }
                    </select>
                  </div>
                  <div>
                    <label>Preferred date (optional)</label>
                    <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="preferredDate" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${guest.preferredDate || ''}" />
                  </div>
                </div>
                <div class="surf-qualification-card">
                  ${this.renderSurfSingleChoiceGroup({
                    guestIndex: idx,
                    guestKey: 'surfLevel',
                    title: 'How would you describe your surfing level?',
                    options: surfLevelOptions,
                    selectedValue: guest.surfLevel || '',
                    required: true,
                    groupId: `enquiry-surf-level-${idx}`,
                  })}
                  ${this.renderSurfSingleChoiceGroup({
                    guestIndex: idx,
                    guestKey: 'waterConfidence',
                    title: 'How comfortable are you in the ocean?',
                    options: waterConfidenceOptions,
                    selectedValue: guest.waterConfidence || '',
                    required: true,
                    groupId: `enquiry-water-comfort-${idx}`,
                  })}
                  <div class="surf-qual-block">
                    <label class="surf-qual-label">Any relevant experience or notes <span class="muted">(optional)</span></label>
                    <textarea class="guest-detail-input" data-guest-index="${idx}" data-guest-key="surfNotes">${guest.surfNotes || guest.surfGoals || ''}</textarea>
                  </div>
                </div>
              </div>`;
            })
            .join('')}
        </div>
        <div class="addon-block">
          <h4>Additional notes (optional)</h4>
          <textarea class="contact-input" data-field-key="activityRequestNotes" placeholder="Any extra details for the team...">${
            this.state.activityRequestNotes || ''
          }</textarea>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnSubmitBooking" ${this.isUiBusy() ? 'disabled' : ''}>Submit enquiry</button>
        <label class="check-line terms-check terms-under-button">
          <input class="contact-input" data-field-key="termsAccepted" type="checkbox" ${this.state.termsAccepted ? 'checked' : ''} />
          <span>I agree to the booking terms and policy <span class="req">*</span>.</span>
        </label>
      </section>
    `;
  }

  renderStayStep2(currentStep) {
    const hidden = currentStep !== 2 ? 'hidden' : '';
    const flowKey = this.getFlowKey();
    const isSurfStay = flowKey === 'surf_stay';
    const isRetreatFlow = flowKey === 'retreats';
    const isPackageFlow = String(flowKey || '').startsWith('package_') || isRetreatFlow;
    const isBnbFlow = flowKey === 'bnb';
    const showRoomStatusChips = isSurfStay || isPackageFlow;
    const includedRoomTypeKey = showRoomStatusChips ? 'dorm' : '';
    const rows = this.getStayRooms();
    const hasAnyAvailability = rows.some((row) => Math.max(0, Number(row?.available || 0)) > 0);
    const hasActiveUpgrade = rows.some(
      (row) => row.roomTypeKey !== includedRoomTypeKey && this.getRoomQty(row.roomTypeKey) > 0
    );
    const list = rows
      .map((row) => {
        const qty = this.getRoomQty(row.roomTypeKey);
        const availableUnits = Math.max(0, Number(row.available || 0));
        const isUnavailable = availableUnits <= 0;
        const canPlus = this.canIncrementRoom(row.roomTypeKey);
        const roomTitle = row.title || row.roomTypeKey;
        const isIncludedRoom = includedRoomTypeKey && row.roomTypeKey === includedRoomTypeKey;
        const isQuickSelectable = (showRoomStatusChips || isBnbFlow) && !isUnavailable;
        const roomStatusMeta = (() => {
          if (!showRoomStatusChips) return { text: '', className: '' };
          if (isUnavailable && qty <= 0) return { text: 'Unavailable', className: 'fully-booked' };
          if (isIncludedRoom) {
            if (qty > 0 && !hasActiveUpgrade) return { text: 'Included', className: 'included' };
            if (qty > 0 && hasActiveUpgrade) return { text: 'Included option', className: 'included-option' };
            return { text: 'Included option', className: 'included-option' };
          }
          if (qty > 0) return { text: 'Upgraded', className: 'upgraded' };
          return { text: 'Upgrade', className: 'upgrade' };
        })();
        const bnbSelectionMeta =
          isBnbFlow && !showRoomStatusChips
            ? isUnavailable && qty <= 0
              ? { text: 'Unavailable', className: 'fully-booked' }
              : qty > 0
              ? { text: 'Selected', className: 'selected' }
              : { text: 'Choose', className: 'choose' }
            : { text: '', className: '' };
        const chipMeta = showRoomStatusChips ? roomStatusMeta : bnbSelectionMeta;
        const roomStatusChip =
          chipMeta.text
            ? `<span class="room-status-chip ${chipMeta.className}">${chipMeta.text}</span>`
            : '';
        const roomPriceText = (() => {
          if (isPackageFlow) {
            if (isIncludedRoom) {
              return row.priceLabel || (isRetreatFlow ? 'Included in retreat base price' : 'Included in package base price');
            }
            if (row.priceLabel) return row.priceLabel;
            if (Number(row.unitPrice || 0) > 0) return `+${row.unitPrice} ${row.currency || 'EUR'} upgrade`;
            return 'Optional room upgrade';
          }
          if (!isSurfStay) {
            return row.priceLabel || (Number(row.unitPrice || 0) > 0 ? `${row.unitPrice} ${row.currency || 'EUR'}` : '');
          }
          if (row.roomTypeKey === 'dorm') {
            return 'Included in Surf & Stay base price';
          }
          if (row.priceLabel) return `Upgrade ${row.priceLabel}`;
          if (Number(row.unitPrice || 0) > 0) return `Upgrade +${row.unitPrice} ${row.currency || 'EUR'}`;
          return 'Optional room upgrade';
        })();
        const availabilityHint =
          isUnavailable && qty <= 0 ? '<div class="meta room-unavailable-note">Not available for your selected dates.</div>' : '';
        return `
          <div class="room-card ${isQuickSelectable ? 'room-card-quick-select' : ''} ${qty > 0 ? 'room-card-selected' : ''} ${
            isUnavailable && qty <= 0 ? 'room-card-unavailable' : ''
          }" data-room-type="${row.roomTypeKey}">
            <div class="room-main">
              <div class="room-image-wrap">
                ${row.image ? `<img class="room-image" src="${this.getRoomImageUrl(row.image)}" alt="${row.title || row.roomTypeKey}" loading="lazy" decoding="async" fetchpriority="low" />` : '<div class="room-image placeholder">No image</div>'}
              </div>
              <div class="room-content">
                <div class="room-title-row">
                  <div class="title">${roomTitle}</div>
                  ${roomStatusChip}
                </div>
                <div class="meta">${row.meta || ''}</div>
                <div class="meta room-price">${roomPriceText}</div>
                ${availabilityHint}
                <div class="qty-block">
                  <label>Rooms / beds</label>
                  <div class="stepper-wrap">
                    <button type="button" class="qty-stepper-btn" data-room-type="${row.roomTypeKey}" data-delta="-1" ${
                      qty <= 0 && isUnavailable ? 'disabled' : ''
                    }>-</button>
                    <input class="qty-input" data-room-type="${row.roomTypeKey}" type="number" min="0" step="1" value="${qty}" ${
                      isUnavailable && qty <= 0 ? 'disabled' : ''
                    } />
                    <button type="button" class="qty-stepper-btn" data-room-type="${row.roomTypeKey}" data-delta="1" ${canPlus ? '' : 'disabled'}>+</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const stepErr = this.errors.step2 || '';
    const guests = this.getGuestCount();
    const sectionCopy = showRoomStatusChips
      ? 'Click any room card to switch setup instantly. We auto-balance included capacity and keep pricing/upgrade rules in sync.'
      : isBnbFlow
        ? 'Click a room card to select it quickly, or use the quantity controls for precise setup.'
      : 'Choose your preferred room setup. You can combine room types as long as total capacity matches guests.';
    const showStaySinglePreference = (isBnbFlow || isSurfStay || isPackageFlow) && this.getRoomAvailableUnits('single') > 0 && guests > 1;
    const staySinglePreference = this.shouldPreferSingleRoomsForStay();
    const recommendation = this.state.roomRecommendation || {};
    const recRows = Array.isArray(recommendation.suggestedSelections)
      ? recommendation.suggestedSelections.filter((row) => Number(row.quantity || 0) > 0)
      : [];
    const recSummary = recRows
      .map((row) => {
        const title = this.getStayRooms().find((x) => x.roomTypeKey === row.roomTypeKey)?.title || row.roomTypeKey;
        return `${row.quantity} x ${title}`;
      })
      .join(' + ');
    const showRec = !staySinglePreference && recRows.length > 0 && recommendation.status === 'pending';
    const upgradeHint = isSurfStay
      ? 'Upgrade prices are added on top of the Surf & Stay base price.'
      : '';
    return `
      <section class="step-card ${hidden}">
        <div class="step-head room-step-head">
          <h3>${isSurfStay ? 'Room setup & upgrades' : 'Rooms'}</h3>
        </div>
        <p class="meta room-step-intro">${sectionCopy}</p>
        ${
          showStaySinglePreference
            ? `<label class="check-line bnb-single-pref-line">
                <input type="checkbox" class="stay-single-preference-toggle" ${staySinglePreference ? 'checked' : ''} />
                <span>Prefer separate single rooms for each guest (when available).</span>
              </label>`
            : ''
        }
        ${
          showRec
            ? `<div class="recommend-box">
                <div class="recommend-title">Recommended setup</div>
                <p class="meta">${recSummary}</p>
                <div class="recommend-actions">
                  <button id="btnApplyRoomRecommendation" ${this.loading ? 'disabled' : ''}>Apply recommended</button>
                  <button id="btnDismissRoomRecommendation" class="secondary" ${this.loading ? 'disabled' : ''}>Choose manually</button>
                </div>
              </div>`
            : ''
        }
        <p class="meta ${upgradeHint ? '' : 'hidden'}">${upgradeHint}</p>
        <p class="availability-alert ${hasAnyAvailability ? 'hidden' : ''}">
          No rooms are available for your selected dates. Try different dates and we will show available options.
        </p>
        <div>${list || '<p class="meta">No room options loaded yet.</p>'}</div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnStayStep2Continue" class="continue" ${!this.canContinueFromStep2() || this.loading ? 'disabled' : ''}>${
          isRetreatFlow ? 'Continue to contact' : 'Continue to add-ons'
        }</button>
      </section>
    `;
  }

  renderCartSummary() {
    if (this.isCustomRetreatRequest()) {
      const guests = Math.max(1, Number(this.state.guestCount || 1));
      const checkIn = String(this.state.checkIn || '');
      const checkOut = String(this.state.checkOut || '');
      const wholeHouse = this.state.wholeHouseEnquiry === true;
      const intake = this.state.retreatIntakeJson && typeof this.state.retreatIntakeJson === 'object'
        ? this.state.retreatIntakeJson
        : {};
      const types = Array.isArray(intake.retreatTypes) ? intake.retreatTypes : [];
      const typeLabelByKey = Object.fromEntries(this.getCustomRetreatTypeOptions().map((opt) => [opt.key, opt.label]));
      const typeChips = types
        .map((key) => {
          if (key === 'other') {
            const other = String(intake.retreatTypeOther || '').trim();
            return other ? `Other: ${other}` : 'Other';
          }
          return typeLabelByKey[key] || key;
        })
        .filter(Boolean);
      const rooms = Array.isArray(this.state.roomSelections) ? this.state.roomSelections : [];
      const roomLabelByKey = {
        dorm: 'Dorm bed',
        single: 'Single room',
        double: 'Double room',
      };
      const roomLines = wholeHouse
        ? ['Whole house (enquiry)']
        : rooms
            .filter((r) => Number(r.quantity || 0) > 0)
            .map((r) => `${roomLabelByKey[r.roomTypeKey] || r.roomTypeKey} × ${r.quantity}`);
      const datesLine = checkIn && checkOut
        ? `${this.formatShortUiDate(checkIn)} → ${this.formatShortUiDate(checkOut)}`
        : '';
      const empty = !checkIn && !checkOut && !roomLines.length && !typeChips.length;
      if (empty) {
        return `
          <div class="cart-empty">
            <div class="cart-icon">🏝️</div>
            <div class="cart-title">Your retreat request will appear here</div>
            <div class="meta">Add dates, accommodation and retreat type to start the request.</div>
          </div>
        `;
      }
      const renderListRow = (label, items) => {
        if (!items || !items.length) return '';
        const valueHtml = items.map((it) => `<span class="cart-meta-list-item">${it}</span>`).join('');
        return `<div class="cart-meta-row cart-meta-row-multi">
          <span class="cart-meta-label">${label}</span>
          <span class="cart-meta-list">${valueHtml}</span>
        </div>`;
      };
      return `
        <div class="cart-meta-block">
          <div class="cart-meta-row"><span class="cart-meta-label">Guests</span><span>${guests}</span></div>
          ${datesLine ? `<div class="cart-meta-row"><span class="cart-meta-label">Dates</span><span>${datesLine}</span></div>` : ''}
          ${renderListRow('Accommodation', roomLines)}
          ${renderListRow('Retreat type', typeChips)}
        </div>
        <div class="custom-retreat-enquiry-note">
          <span>This is an enquiry — no inventory is held until our team confirms.</span>
        </div>
      `;
    }
    if (this.isActivityOnlyEnquiry()) {
      const guestCount = Math.max(1, Number(this.state.guestCount || 1));
      const activityDatePrefs =
        this.state.activityDatePrefs && typeof this.state.activityDatePrefs === 'object'
          ? this.state.activityDatePrefs
          : {};
      const allActivities = Array.isArray(this.options?.addons?.experiences)
        ? this.options.addons.experiences
        : [];
      const selectedKeys = (Array.isArray(this.state.experienceRequests) ? this.state.experienceRequests : [])
        .map((row) => String(row?.activityKey || '').trim())
        .filter(Boolean);
      const activityRows = selectedKeys.map((key) => {
        const info = allActivities.find((row) => String(row.activityKey || '') === key) || {};
        const dateKey = String(activityDatePrefs[key] || '').trim();
        const priceLabel = String(info.priceLabel || '').trim();
        const fallbackPrice = Number(info.priceFromEur || 0);
        return {
          activityKey: key,
          title: info.title || key,
          image: info.image || '',
          dateLabel: dateKey ? this.formatShortUiDate(dateKey) : '',
          priceLabel:
            priceLabel ||
            (fallbackPrice > 0 ? `From ${fallbackPrice} ${info.currency || 'EUR'}` : 'Request'),
        };
      });
      if (!activityRows.length) {
        return `
          <div class="cart-empty">
            <div class="cart-icon">🧺</div>
            <div class="cart-title">Your enquiry details will appear here</div>
            <div class="meta">Select activities and preferred dates to build your request.</div>
          </div>
        `;
      }
      return `
        <div class="cart-meta-block">
          <div class="cart-meta-row"><span><img class="meta-icon-img" src="https://static.wixstatic.com/media/4dd635_121146c25e704c69891e2d3c151a2348~mv2.png" alt="" />Guests</span><span>${guestCount}</span></div>
        </div>
        <div class="cart-list surf-cart-list">
          ${activityRows
            .map(
              (item) => `<div class="cart-row">
                <div class="cart-left surf-cart-left">
                  <div class="cart-thumb-wrap">${
                    item.image ? `<img class="cart-thumb" src="${item.image}" alt="${item.title}" />` : '<div class="cart-thumb placeholder"></div>'
                  }</div>
                  <div class="surf-cart-content">
                    <div class="cart-item-title">${item.title}</div>
                    <div class="meta ${item.dateLabel ? '' : 'hidden'}">${item.dateLabel || ''}</div>
                    <div class="cart-row-price ${item.priceLabel ? '' : 'hidden'}">${item.priceLabel || ''}</div>
                  </div>
                </div>
              </div>`
            )
            .join('')}
        </div>
      `;
    }

    if (this.isSurfActivityEnquiry()) {
      const guestCount = Math.max(1, Number(this.state.guestCount || 1));
      const guestDetails = Array.from({ length: guestCount }).map((_, idx) => this.state.guestDetails?.[idx] || {});
      const fallbackKey =
        this.state.guestDetails?.[0]?.enquiryActivityKey ||
        this.ctx.activityKey ||
        this.state.experienceRequests?.[0]?.activityKey ||
        '';
      const keyCounts = new Map();
      for (const guest of guestDetails) {
        const key = String(guest.enquiryActivityKey || fallbackKey || '').trim();
        if (!key) continue;
        const lessonFormat = this.activitySupportsLessonFormat(key) ? String(guest.lessonFormat || '').toLowerCase() : '';
        const mapKey = `${key}__${lessonFormat || 'na'}`;
        const current = keyCounts.get(mapKey) || { activityKey: key, lessonFormat, qty: 0 };
        current.qty += 1;
        keyCounts.set(mapKey, current);
      }
      const activityRows = [...keyCounts.values()].map((entry) => {
        const info = this.getEnquiryActivities().find((row) => String(row.activityKey) === String(entry.activityKey)) || {};
        return {
          activityKey: entry.activityKey,
          lessonFormat: entry.lessonFormat,
          qty: entry.qty,
          title: info.title || entry.activityKey,
          image: info.image || '',
          priceLabel:
            this.lessonTypePriceLabel(info, entry.lessonFormat) ||
            (!this.activitySupportsLessonFormat(entry.activityKey)
              ? Number(info.priceFromEur || 0) > 0
                ? `From ${info.priceFromEur} ${info.currency || 'EUR'}`
                : 'Request'
              : ''),
        };
      });
      if (!activityRows.length && !fallbackKey) {
        return `
          <div class="cart-empty">
            <div class="cart-icon">🧺</div>
            <div class="cart-title">Your enquiry details will appear here</div>
            <div class="meta">Select participants to build your request.</div>
          </div>
        `;
      }
      return `
        <div class="cart-meta-block">
          <div class="cart-meta-row"><span><img class="meta-icon-img" src="https://static.wixstatic.com/media/4dd635_121146c25e704c69891e2d3c151a2348~mv2.png" alt="" />Participants</span><span>${guestCount}</span></div>
        </div>
        <div class="cart-list surf-cart-list">
          ${activityRows
            .map(
              (item) => `<div class="cart-row">
                <div class="cart-left surf-cart-left">
                  <div class="cart-thumb-wrap">${
                    item.image ? `<img class="cart-thumb" src="${item.image}" alt="${item.title}" />` : '<div class="cart-thumb placeholder"></div>'
                  }</div>
                  <div class="surf-cart-content">
                    <div class="cart-item-title">${item.title}</div>
                    <div class="cart-row-price ${item.priceLabel ? '' : 'hidden'}">${item.priceLabel || ''}</div>
                    <div class="meta">x${item.qty}</div>
                  </div>
                </div>
              </div>`
            )
            .join('')}
        </div>
      `;
    }

    const priceSummary = this.getCartPriceSummary();
    const flowKey = this.getFlowKey();
    const hasContext = !!this.getGuestCount() || !!this.state.checkIn || !!this.state.checkOut;
    const dateText =
      this.state.checkIn && this.state.checkOut
        ? `${this.formatShortUiDate(this.state.checkIn)} - ${this.formatShortUiDate(this.state.checkOut)}`
        : '-';
    const addonLines = priceSummary.lines.filter(
      (line) => String(line.key || '').startsWith('addon_') && !String(line.key || '').startsWith('addon_experience_')
    );
    const experiencePriceLines = priceSummary.lines.filter((line) =>
      String(line.key || '').startsWith('addon_experience_')
    );
    const experienceRows = this.getSelectedExperienceRows();
    const selected = this.getRoomSelections()
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => {
        const room = this.getStayRooms().find((x) => x.roomTypeKey === r.roomTypeKey);
        const currency = room?.currency || 'EUR';
        const lineTotal = Number(priceSummary.roomTotals?.[r.roomTypeKey] || 0);
        return {
          roomTypeKey: r.roomTypeKey,
          title: room?.title || r.roomTypeKey,
          quantity: Number(r.quantity) || 0,
          image: room?.image || '',
          currency,
          lineTotal,
        };
      });
    const baseAccommodationRows = (priceSummary.lines || [])
      .filter((line) => ['surf_base', 'package_base', 'retreat_base'].includes(String(line.key || '').trim()))
      .map((line) => {
        const dormRoom = this.getStayRooms().find((x) => x.roomTypeKey === 'dorm');
        const dormQty = Number(this.getRoomSelections().find((r) => r.roomTypeKey === 'dorm')?.quantity || 0);
        return {
          roomTypeKey: String(line.key || '').trim(),
          title: String(line.label || 'Base accommodation').trim(),
          quantity: Math.max(0, Number(this.getGuestCount() || 0)),
          dormQty,
          image: dormRoom?.image || '',
          currency: line.currency || dormRoom?.currency || 'EUR',
          lineTotal: Math.max(0, Number(line.total || 0)),
          isBase: true,
        };
      });
    const hasIncludedBase = baseAccommodationRows.length > 0;
    const upgradeRows = hasIncludedBase ? selected.filter((r) => r.roomTypeKey !== 'dorm') : selected;
    const accommodationRows = [...baseAccommodationRows, ...upgradeRows];
    if (selected.length === 0 && !hasContext) {
      return `
        <div class="cart-empty">
          <div class="cart-icon">🧺</div>
          <div class="cart-title">Your selection will appear here</div>
          <div class="meta">Choose dates and room quantities to build your reservation.</div>
        </div>
      `;
    }
    return `
      <div class="cart-meta-block">
        <div class="cart-meta-row"><span><img class="meta-icon-img" src="https://static.wixstatic.com/media/4dd635_121146c25e704c69891e2d3c151a2348~mv2.png" alt="" />Guests</span><span>${this.getGuestCount() || '-'}</span></div>
        <div class="cart-meta-row"><span><img class="meta-icon-img" src="https://static.wixstatic.com/media/4dd635_f66b452f71b94f57a039f10f52450e20~mv2.png" alt="" />Dates</span><span>${dateText}</span></div>
      </div>
      <div class="cart-section-title">Accommodation</div>
      <div class="cart-list">
        ${accommodationRows
          .map(
            (item) => `<div class="cart-row">
              <div class="cart-left">
                <div class="cart-thumb-wrap">${
                  item.image ? `<img class="cart-thumb" src="${item.image}" alt="${item.title}" />` : '<div class="cart-thumb placeholder"></div>'
                }</div>
                <div>
                  <div class="cart-item-title">${item.title}</div>
                  <div class="meta">${
                    item.isBase
                      ? item.quantity > 0
                        ? `${item.quantity} guest${item.quantity > 1 ? 's' : ''}${
                            item.dormQty > 0 ? ` · dorm ×${item.dormQty}` : ''
                          }`
                        : 'Included in base estimate'
                      : `x${item.quantity}`
                  }</div>
                </div>
              </div>
              <span class="cart-row-price">${item.lineTotal > 0 ? `${item.lineTotal} ${item.currency}` : ''}</span>
            </div>`
          )
          .join('')}
      </div>
      ${upgradeRows.length === 0 ? '<div class="meta" style="margin-top:10px;">No room upgrades selected yet.</div>' : ''}
      <div class="cart-addon-block ${addonLines.length || experiencePriceLines.length || experienceRows.length ? '' : 'hidden'}">
        <div class="cart-addon-title">Add-ons</div>
        ${addonLines.map((line) => `<div class="cart-price-row"><span>${line.label}</span><span>${line.total} ${line.currency}</span></div>`).join('')}
        ${
          experiencePriceLines.length
            ? experiencePriceLines
                .map(
                  (line) =>
                    `<div class="cart-price-row"><span>${line.label}${Number(line.qty || 1) > 1 ? ` x${Number(line.qty || 1)}` : ''}</span><span>${line.total} ${line.currency}</span></div>`
                )
                .join('')
            : experienceRows
                .map(
                  (row) =>
                    `<div class="cart-price-row"><span>${row.title}${Number(row.qty || 1) > 1 ? ` x${Number(row.qty || 1)}` : ''}</span><span>${row.priceLabel || 'Request'}</span></div>`
                )
                .join('')
        }
      </div>
      <div class="cart-total">
        <span>Estimated total</span>
        <span>${priceSummary.total} ${priceSummary.currency}</span>
      </div>
    `;
  }

  renderStayStep3(currentStep) {
    const hidden = currentStep !== 3 ? 'hidden' : '';
    const stepErr = this.errors.step3 || '';
    const addons = this.getAddonOptions();
    const flowKey = this.getFlowKey();
    const isSurfStay = flowKey === 'surf_stay';
    const isRetreatFlow = flowKey === 'retreats';
    const useSurfLessonPicker = isSurfStay || isRetreatFlow;
    const isPackageFlow = flowKey.startsWith('package_') || flowKey === 'retreats';
    const hasIncludedTransfer = isPackageFlow && (flowKey === 'package_roots_ritual' || flowKey === 'package_surf_soul' || flowKey === 'retreats');
    const includedItems = isPackageFlow ? this.getPackageIncludedItems(flowKey) : [];
    const experiences = addons.experiences;
    const surfLessonOptions = useSurfLessonPicker
      ? experiences.filter((item) => {
          const key = String(item?.activityKey || '').trim().toLowerCase();
          if (!key) return false;
          if (key === 'surf-extended-experience' || key === 'extended_experience') return false;
          return BookingWizardElement.SURF_ACTIVITY_KEYS.has(key) || key.startsWith('surf-');
        })
      : [];
    const experienceOptions = useSurfLessonPicker
      ? experiences.filter((item) => {
          const key = String(item?.activityKey || '').trim().toLowerCase();
          if (!key) return true;
          if (key === 'surf-extended-experience' || key === 'extended_experience') return false;
          return !(BookingWizardElement.SURF_ACTIVITY_KEYS.has(key) || key.startsWith('surf-'));
        })
      : experiences;
    const selectedKeys = new Set((this.state.experienceRequests || []).map((x) => x.activityKey));
    const selectedExperienceRows = (this.state.experienceRequests || [])
      .map((row) => {
        const key = String(row?.activityKey || '').trim();
        if (!key) return null;
        const match = (experiences || []).find((item) => String(item?.activityKey || '') === key) || {};
        return {
          activityKey: key,
          title: String(match.title || row?.title || key).trim(),
        };
      })
      .filter(Boolean);
    const selectedSurfLessonRows = isRetreatFlow
      ? (() => {
          const byKey = new Map((experiences || []).map((item) => [String(item?.activityKey || '').trim(), item]));
          const rows = Array.isArray(this.state.guestDetails) ? this.state.guestDetails : [];
          const uniqueKeys = [...new Set(rows
            .map((guest) => String(guest?.enquiryActivityKey || '').trim())
            .filter((key) => {
              const normalized = key.toLowerCase();
              return normalized && (BookingWizardElement.SURF_ACTIVITY_KEYS.has(normalized) || normalized.startsWith('surf-'));
            }))];
          return uniqueKeys.map((key) => ({
            activityKey: key,
            title: String(byKey.get(key)?.title || key).trim(),
          }));
        })()
      : [];
    const retreatDateRows = isRetreatFlow
      ? [...selectedExperienceRows, ...selectedSurfLessonRows].filter(
          (row, idx, arr) => arr.findIndex((x) => String(x.activityKey || '') === String(row.activityKey || '')) === idx
        )
      : [];
    const activityDatePrefs = this.state.activityDatePrefs && typeof this.state.activityDatePrefs === 'object' ? this.state.activityDatePrefs : {};
    const retreatStart = String(this.state.checkIn || '').trim();
    const retreatEnd = String(this.state.checkOut || '').trim();
    const missingRetreatDateKeys = isRetreatFlow
      ? retreatDateRows.map((row) => row.activityKey).filter((key) => !String(activityDatePrefs[key] || '').trim())
      : [];
    const core = this.state.coreAddons || {};
    const guests = this.getGuestCount();
    const dinnerRate = Number(addons.core?.dinner?.standardRate || 0);
    const dinnerEnabled = !isPackageFlow && addons.core?.dinner?.enabled !== false && dinnerRate > 0;
    const transferAirportRate = Number(addons.core?.transfer?.airportRate || 0);
    const transferBusRate = Number(addons.core?.transfer?.busRate || 0);
    const transferEnabled = addons.core?.transfer?.enabled !== false && (transferAirportRate > 0 || transferBusRate > 0);
    const transferConfigEnabled = transferEnabled || hasIncludedTransfer;
    const showPaidTransferControls = transferEnabled && !hasIncludedTransfer;
    const showPaidAddonsBlock = !isPackageFlow || dinnerEnabled || transferEnabled;
    const dinnerOn = dinnerEnabled && !!core.dinner;
    const selectedTransferTypesRaw = this.getSelectedTransferTypes(core);
    const selectedTransferTypes = transferConfigEnabled ? selectedTransferTypesRaw : [];
    const fallbackTransferType = selectedTransferTypes[0] || (hasIncludedTransfer ? 'airport' : 'none');
    const transferType = core.transferType && core.transferType !== 'none' ? core.transferType : fallbackTransferType;
    const maxTransferVehicles = this.getMaxTransferVehicles();
    const transferVehicles = this.normalizeTransferVehicles(core.transferVehicles || 1);
    const transferVehiclesLocked = guests <= 1;
    const transferTravelTogether = core.transferTravelTogether || 'yes';
    const hasTransfer = transferConfigEnabled && (selectedTransferTypes.length > 0 || hasIncludedTransfer);
    const airportSelected = selectedTransferTypes.includes('airport');
    const busSelected = selectedTransferTypes.includes('bus');
    // When the user chose "split arrivals" and selected both transfer types, each type
    // gets its own vehicle stepper so pricing can be calculated per type.
    const splitVehiclesNeeded = airportSelected && busSelected;
    const transferAirportVehicles = splitVehiclesNeeded
      ? this.getTransferVehiclesByType('airport', core)
      : (airportSelected ? transferVehicles : 0);
    const transferBusVehicles = splitVehiclesNeeded
      ? this.getTransferVehiclesByType('bus', core)
      : (busSelected ? transferVehicles : 0);
    const renderTransferVehiclesSteppers = (locked) => {
      if (splitVehiclesNeeded) {
        return `
          <div class="transfer-vehicles-block transfer-group-line">
            <div class="transfer-vehicles-grid">
              <div class="transfer-vehicles-cell">
                <label>Airport vehicles</label>
                <div class="stepper-wrap transfer-stepper">
                  <button type="button" class="transfer-vehicles-btn" data-vehicles-key="airport" data-delta="-1" ${locked ? 'disabled' : ''}>-</button>
                  <input class="transfer-vehicles-input" data-vehicles-key="airport" type="number" min="1" max="${maxTransferVehicles}" value="${transferAirportVehicles}" ${locked ? 'disabled' : ''} />
                  <button type="button" class="transfer-vehicles-btn" data-vehicles-key="airport" data-delta="1" ${locked ? 'disabled' : ''}>+</button>
                </div>
              </div>
              <div class="transfer-vehicles-cell">
                <label>Bus vehicles</label>
                <div class="stepper-wrap transfer-stepper">
                  <button type="button" class="transfer-vehicles-btn" data-vehicles-key="bus" data-delta="-1" ${locked ? 'disabled' : ''}>-</button>
                  <input class="transfer-vehicles-input" data-vehicles-key="bus" type="number" min="1" max="${maxTransferVehicles}" value="${transferBusVehicles}" ${locked ? 'disabled' : ''} />
                  <button type="button" class="transfer-vehicles-btn" data-vehicles-key="bus" data-delta="1" ${locked ? 'disabled' : ''}>+</button>
                </div>
              </div>
            </div>
            <p class="meta">Each type is priced per vehicle, so you can mix airport and bus pickups in one booking.</p>
          </div>`;
      }
      return `
        <div class="transfer-vehicles-block transfer-group-line">
          <label>Vehicles</label>
          <div class="stepper-wrap transfer-stepper">
            <button type="button" class="transfer-vehicles-btn" data-delta="-1" ${locked ? 'disabled' : ''}>-</button>
            <input id="transferVehicles" class="transfer-vehicles-input" type="number" min="1" max="${maxTransferVehicles}" value="${transferVehicles}" ${locked ? 'disabled' : ''} />
            <button type="button" class="transfer-vehicles-btn" data-delta="1" ${locked ? 'disabled' : ''}>+</button>
          </div>
        </div>`;
    };
    const currency = addons.core?.dinner?.currency || addons.core?.transfer?.currency || 'EUR';
    const guestPreviewDetails = Array.from({ length: Math.max(1, guests) }).map((_, idx) => this.state.guestDetails?.[idx] || {});
    const surfStayPreferredDefaultKey =
      surfLessonOptions.find((item) => String(item?.activityKey || '').trim().toLowerCase() === 'surf-lesson-beginner')?.activityKey ||
      surfLessonOptions[0]?.activityKey ||
      '';
    const defaultSurfLessonKey = isSurfStay
      ? (this.state.guestDetails?.[0]?.enquiryActivityKey || this.state.experienceRequests?.[0]?.activityKey || surfStayPreferredDefaultKey || '')
      : '';
    const renderSurfStayLessonPicker = (guest, idx) => {
      const selectedKey = String(guest.enquiryActivityKey || defaultSurfLessonKey || '').trim();
      const selected = surfLessonOptions.find((item) => String(item.activityKey) === selectedKey) || null;
      const alternatives = surfLessonOptions.filter((item) => String(item.activityKey) !== selectedKey);
      const switchCtaLabel = selected ? 'Switch' : 'Choose';
      const selectedLessonFormat = String(guest.lessonFormat || '').toLowerCase();
      const selectedPriceParts = this.getLessonPriceParts(selected || {});
      const selectedBasePrice =
        selectedPriceParts.base ||
        (!this.activitySupportsLessonFormat(selected?.activityKey || '')
          ? Number(selected?.priceFromEur || 0) > 0
            ? `From ${selected.priceFromEur} ${selected.currency || 'EUR'}`
            : 'Request'
          : '');
      const selectedExtendedAddonLabel = this.formatExtendedAddonLabel(selectedPriceParts.extended);
      const supportsExtendedAddon = this.activitySupportsLessonFormat(selected?.activityKey || '') && !!selectedExtendedAddonLabel;
      const isIncludedExtendedForSurfStay =
        isSurfStay && supportsExtendedAddon && String(selected?.activityKey || '').trim().toLowerCase() === 'surf-lesson-beginner';
      const effectiveLessonFormat = isIncludedExtendedForSurfStay ? 'extended' : selectedLessonFormat;
      const isExtendedSelected = supportsExtendedAddon && effectiveLessonFormat === 'extended';
      const selectedPrimaryPrice = isIncludedExtendedForSurfStay
        ? 'Extended Experience included in Surf & Stay (no extra charge)'
        : isExtendedSelected
          ? selectedExtendedAddonLabel
          : selectedBasePrice;
      return `<div class="guest-card ${idx === 0 ? 'guest-card-contact' : ''}">
        <div class="guest-card-head">
          <div class="guest-card-title">Participant № ${idx + 1}</div>
          ${idx === 0 ? '<span class="guest-badge">Contact person</span>' : ''}
        </div>
        ${
          selected
            ? `<div class="exp-card enquiry-selected-card">
                <div class="exp-image-wrap">
                  ${
                    selected.image
                                  ? this.renderLazyExperienceImage(selected.image, selected.title || selected.activityKey)
                      : '<div class="exp-image placeholder"></div>'
                  }
                </div>
                <div class="exp-content">
                  <div class="exp-title-row">
                    <span class="exp-title">${selected.title || selected.activityKey}</span>
                    <span class="selected-pill">Selected</span>
                  </div>
                  <div class="exp-meta-row ${selectedPrimaryPrice ? '' : 'hidden'}">
                    <span>${selectedPrimaryPrice || ''}</span>
                  </div>
                  ${selected.description ? `<p class="exp-desc">${this.sanitizeLessonDescription(selected.description)}</p>` : ''}
                </div>
              </div>`
            : '<p class="meta">No surf activity selected.</p>'
        }
        ${
          supportsExtendedAddon
            ? `<div class="lesson-addon-row">
                <label class="lesson-addon-toggle ${isIncludedExtendedForSurfStay ? 'included-fixed' : ''}">
                  <input
                    class="guest-detail-input"
                    data-guest-index="${idx}"
                    data-guest-key="lessonFormat"
                    data-checked-value="extended"
                    data-unchecked-value=""
                    type="checkbox"
                    ${isExtendedSelected ? 'checked' : ''}
                    ${isIncludedExtendedForSurfStay ? 'disabled' : ''}
                  />
                  <span class="lesson-addon-text">${
                    isIncludedExtendedForSurfStay
                      ? 'Extended Experience included'
                      : selectedExtendedAddonLabel
                  }</span>
                </label>
                ${this.renderExtendedLessonDescription()}
              </div>`
            : ''
        }
        <div class="meta enquiry-activity-switch-title">${selected ? 'Want to change lesson type?' : 'Choose lesson type'}</div>
        <div class="experience-list enquiry-switch-list">
          ${
            alternatives.length
              ? alternatives
                  .map((item) => {
                    const durationText = this.getActivityDurationText(item);
                    const itemPriceParts = this.getLessonPriceParts(item);
                    const priceText =
                      itemPriceParts.base || (Number(item.priceFromEur || 0) > 0 ? `From ${item.priceFromEur} ${item.currency || 'EUR'}` : '');
                    const showDurationMeta = this.shouldShowDurationMeta(priceText, durationText);
                    return `<label class="exp-item enquiry-switch-item">
                      <input
                        type="checkbox"
                        class="enquiry-activity-select"
                        data-guest-index="${idx}"
                        data-activity-key="${item.activityKey}"
                      />
                      <div class="exp-card">
                        <div class="exp-image-wrap">
                          ${item.image ? this.renderLazyExperienceImage(item.image, item.title || item.activityKey) : '<div class="exp-image placeholder"></div>'}
                        </div>
                        <div class="exp-content">
                          <div class="exp-title-row">
                            <span class="exp-title">${item.title || item.activityKey}</span>
                            <span class="enquiry-switch-indicator">${switchCtaLabel}</span>
                          </div>
                          <div class="exp-meta-row ${priceText ? '' : 'hidden'}"><span>${priceText || ''}</span></div>
                          <div class="exp-meta-row ${showDurationMeta ? '' : 'hidden'}">${showDurationMeta ? `<span>Duration: ${durationText}</span>` : ''}</div>
                          ${item.description ? `<p class="exp-desc">${this.sanitizeLessonDescription(item.description)}</p>` : ''}
                        </div>
                      </div>
                    </label>`;
                  })
                  .join('')
              : '<p class="meta">No alternative surf lesson types available.</p>'
          }
        </div>
      </div>`;
    };

    return `
      <section class="step-card ${hidden}">
        <div class="step-head">
          <h3>${isPackageFlow ? 'Included Experience & Requests' : 'Add-ons'}</h3>
        </div>
        ${
          isPackageFlow && includedItems.length
            ? `<div class="addon-block">
                <h4>Included in your package</h4>
                <p class="meta">These items are fixed and already included in package pricing.</p>
                <ul class="included-list">
                  ${includedItems.map((item) => `<li>${item}</li>`).join('')}
                </ul>
              </div>`
            : ''
        }
        ${
          showPaidAddonsBlock
            ? `<div class="addon-block">
                ${isPackageFlow ? '<h4>Paid add-ons</h4>' : ''}
                ${
                  dinnerEnabled
                    ? `<label class="check-line">
                        <input type="checkbox" class="addon-toggle" data-addon-key="dinner" ${dinnerOn ? 'checked' : ''} />
                        <span>Dinner add-on (${dinnerRate} ${currency} / guest / night)</span>
                      </label>`
                    : ''
                }
                ${
                  showPaidTransferControls
                    ? `<div class="transfer-layout">
                        <div>
                          <label>Transfer</label>
                          <div class="transfer-type-grid">
                            <label class="transfer-type-option ${transferType === 'none' ? 'active' : ''}">
                              <input type="radio" class="transfer-radio" name="transferType" value="none" ${transferType === 'none' ? 'checked' : ''} />
                              <span>No transfer</span>
                            </label>
                            <label class="transfer-type-option ${transferType === 'airport' ? 'active' : ''}">
                              <input type="radio" class="transfer-radio" name="transferType" value="airport" ${transferType === 'airport' ? 'checked' : ''} />
                              <span>Airport transfer</span>
                            </label>
                            <label class="transfer-type-option ${transferType === 'bus' ? 'active' : ''}">
                              <input type="radio" class="transfer-radio" name="transferType" value="bus" ${transferType === 'bus' ? 'checked' : ''} />
                              <span>Bus transfer</span>
                            </label>
                          </div>
                        </div>
                      </div>`
                    : ''
                }
                ${
                  showPaidTransferControls && hasTransfer && guests > 1
                    ? `<div class="transfer-group-line">
                        <label>Are all guests travelling together on the same flight/bus?</label>
                        <div class="transfer-yesno-grid">
                          <label class="transfer-yesno-option ${transferTravelTogether === 'yes' ? 'active' : ''}">
                            <input type="radio" class="transfer-together-radio" name="transferTogether" value="yes" ${
                              transferTravelTogether === 'yes' ? 'checked' : ''
                            } />
                            <span>Yes</span>
                          </label>
                          <label class="transfer-yesno-option ${transferTravelTogether === 'no' ? 'active' : ''}">
                            <input type="radio" class="transfer-together-radio" name="transferTogether" value="no" ${
                              transferTravelTogether === 'no' ? 'checked' : ''
                            } />
                            <span>No</span>
                          </label>
                        </div>
                        <p class="meta">
                          Our service can take up to 6 passengers per vehicle if travelling on the same flight or bus.
                          If arrivals are split or multiple collection points are required for one booking, additional vehicles are required.
                          The price listed is per vehicle.
                        </p>
                      </div>`
                    : ''
                }
                ${
                  showPaidTransferControls && hasTransfer && guests > 1 && transferTravelTogether === 'no'
                    ? `<div class="transfer-group-line">
                        <label>Select transfer types for split arrivals</label>
                        <div class="transfer-multi-grid">
                          <label class="transfer-type-option ${airportSelected ? 'active' : ''}">
                            <input type="checkbox" class="transfer-multi-checkbox" value="airport" ${airportSelected ? 'checked' : ''} />
                            <span>Airport transfer</span>
                          </label>
                          <label class="transfer-type-option ${busSelected ? 'active' : ''}">
                            <input type="checkbox" class="transfer-multi-checkbox" value="bus" ${busSelected ? 'checked' : ''} />
                            <span>Bus transfer</span>
                          </label>
                        </div>
                      </div>`
                    : ''
                }
                ${
                  showPaidTransferControls && hasTransfer
                    ? renderTransferVehiclesSteppers(transferVehiclesLocked)
                    : ''
                }
              </div>`
            : ''
        }
        ${
          hasIncludedTransfer && !isRetreatFlow
            ? `<div class="addon-block">
                <h4>Your included transfer details</h4>
                <p class="meta">Your package already includes transfer. Share a few arrival details so we can prepare everything smoothly for your group.</p>
                <div class="transfer-layout">
                  <div>
                    <label>Transfer type</label>
                    <div class="transfer-type-grid">
                      <label class="transfer-type-option ${transferType === 'airport' ? 'active' : ''}">
                        <input type="radio" class="transfer-radio" name="transferType" value="airport" ${transferType === 'airport' ? 'checked' : ''} />
                        <span>Airport transfer</span>
                      </label>
                      <label class="transfer-type-option ${transferType === 'bus' ? 'active' : ''}">
                        <input type="radio" class="transfer-radio" name="transferType" value="bus" ${transferType === 'bus' ? 'checked' : ''} />
                        <span>Bus transfer</span>
                      </label>
                    </div>
                  </div>
                </div>
                ${
                  guests > 1
                    ? `<div class="transfer-group-line">
                        <label>Will everyone arrive together on the same flight or bus?</label>
                        <div class="transfer-yesno-grid">
                          <label class="transfer-yesno-option ${transferTravelTogether === 'yes' ? 'active' : ''}">
                            <input type="radio" class="transfer-together-radio" name="transferTogether" value="yes" ${
                              transferTravelTogether === 'yes' ? 'checked' : ''
                            } />
                            <span>Yes</span>
                          </label>
                          <label class="transfer-yesno-option ${transferTravelTogether === 'no' ? 'active' : ''}">
                            <input type="radio" class="transfer-together-radio" name="transferTogether" value="no" ${
                              transferTravelTogether === 'no' ? 'checked' : ''
                            } />
                            <span>No</span>
                          </label>
                        </div>
                        <p class="meta">
                          Our service can take up to 6 passengers per vehicle if travelling on the same flight or bus.
                          If arrivals are split or multiple collection points are required for one booking, additional vehicles are required.
                          The price listed is per vehicle.
                        </p>
                      </div>`
                    : ''
                }
                ${
                  guests > 1 && transferTravelTogether === 'no'
                    ? `<div class="transfer-group-line">
                        <label>Select transfer type(s) for split arrivals</label>
                        <div class="transfer-multi-grid">
                          <label class="transfer-type-option ${airportSelected ? 'active' : ''}">
                            <input type="checkbox" class="transfer-multi-checkbox" value="airport" ${airportSelected ? 'checked' : ''} />
                            <span>Airport transfer</span>
                          </label>
                          <label class="transfer-type-option ${busSelected ? 'active' : ''}">
                            <input type="checkbox" class="transfer-multi-checkbox" value="bus" ${busSelected ? 'checked' : ''} />
                            <span>Bus transfer</span>
                          </label>
                        </div>
                      </div>`
                    : ''
                }
                ${renderTransferVehiclesSteppers(transferVehiclesLocked)}
              </div>`
            : ''
        }
        ${
          isRetreatFlow && retreatDateRows.length
            ? `<div class="addon-block">
                <h4>Preferred activity date (required)</h4>
                <p class="meta">Choose one preferred date per selected activity. Dates must stay within your retreat session window.</p>
                <p class="error ${missingRetreatDateKeys.length ? '' : 'hidden'}">Please choose dates for all selected activities.</p>
                ${retreatDateRows
                  .map((row) => {
                    const value = String(activityDatePrefs[row.activityKey] || '').trim();
                    const missing = !value;
                    return `<div class="row">
                      <div style="grid-column: span 3;">
                        <label>${row.title} <span class="req">*</span></label>
                        <input
                          class="activity-date-input date-picker-input ${missing ? 'input-missing' : ''}"
                          data-date-picker
                          data-min-today="true"
                          data-min-date="${retreatStart}"
                          data-max-date="${retreatEnd}"
                          data-activity-key="${row.activityKey}"
                          type="text"
                          placeholder="YYYY-MM-DD"
                          value="${value}"
                        />
                        <p class="field-hint ${missing ? '' : 'hidden'}">Date is required for this activity.</p>
                      </div>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : ''
        }
        ${
          useSurfLessonPicker && surfLessonOptions.length
            ? `<div class="addon-block">
                <h4>Surf lesson setup</h4>
                <p class="meta">
                  ${
                    isSurfStay
                      ? 'A beginner surf lesson with extended experience is already applied to your booking. This includes daily: 1 lesson, all equipment, transport, lunch on the beach, and free surf afternoon. If you want to upgrade your lesson type or organise a surf guiding trip, please select the appropriate option below.'
                      : 'Choose a surf lesson per participant when needed. You can switch lesson type and enable extended experience per participant.'
                  }
                </p>
                <div class="enquiry-activity-preview">
                  ${guestPreviewDetails.map((guest, idx) => renderSurfStayLessonPicker(guest, idx)).join('')}
                </div>
              </div>`
            : ''
        }
        <div class="addon-block">
          <h4>Experience requests</h4>
          ${
            isPackageFlow
              ? `<p class="meta">${
                  flowKey === 'package_beach_reset'
                    ? 'Package request window: Friday afternoon only.'
                    : flowKey === 'package_roots_ritual'
                      ? 'Package request window: Monday afternoon only.'
                      : flowKey === 'package_surf_soul'
                        ? 'Package request window: Afternoon sessions only.'
                        : ''
                }</p>`
              : ''
          }
          <p class="meta">These are request-based and confirmed manually by the team.</p>
          <div class="experience-list" data-scroll-key="stay-experience-list">
            ${
              experienceOptions.length
                ? experienceOptions
                    .map(
                      (item) => {
                        const durationText = this.getActivityDurationText(item);
                        const priceText = item.priceLabel || (Number(item.priceFromEur || 0) > 0 ? `From ${item.priceFromEur} ${item.currency || 'EUR'}` : '');
                        const noteText = item.notes || '';
                        const restrictionText = item.timeRestriction || '';
                        return `<label class="exp-item">
                          <input type="checkbox"
                            class="experience-toggle"
                            data-activity-key="${item.activityKey}"
                            data-activity-title="${item.title}"
                            ${selectedKeys.has(item.activityKey) ? 'checked' : ''} />
                          <div class="exp-card">
                            <div class="exp-image-wrap">
                              ${
                                item.image
                                  ? this.renderLazyExperienceImage(item.image, item.title || item.activityKey)
                                  : '<div class="exp-image placeholder"></div>'
                              }
                            </div>
                            <div class="exp-content">
                              <div class="exp-title-row">
                                <span class="exp-title">${item.title || item.activityKey}</span>
                                <span class="exp-price">${priceText || 'Request'}</span>
                              </div>
                              <div class="exp-meta-row">
                                ${durationText ? `<span>Duration: ${durationText}</span>` : ''}
                              </div>
                              ${item.description ? `<p class="exp-desc">${item.description}</p>` : ''}
                              ${restrictionText ? `<p class="exp-note">${restrictionText}</p>` : ''}
                              ${noteText ? `<p class="exp-note">${noteText}</p>` : ''}
                            </div>
                          </div>
                        </label>`;
                      }
                    )
                    .join('')
                : '<p class="meta">No experience add-ons available for this flow.</p>'
            }
          </div>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnStayStep3Continue" class="continue" ${this.loading ? 'disabled' : ''}>Continue to contact</button>
      </section>
    `;
  }

  renderStayStep4(currentStep) {
    const flowKey = this.getFlowKey();
    const isRetreatFlow = flowKey === 'retreats';
    const contactStep = isRetreatFlow ? 3 : 4;
    const hidden = currentStep !== contactStep ? 'hidden' : '';
    const stepErr = this.errors.step4 || '';
    const submitted = this.state.submissionStatus === 'success';
    if (submitted) {
      return `
        <section class="step-card ${hidden}">
          <h3>Request received</h3>
          <div class="success-box">
            <p>Thank you, your booking request has been received successfully.</p>
            <p>We will contact you within 12 hours to finalize your booking details.</p>
            <p class="meta">A confirmation summary has also been prepared for your contact email.</p>
          </div>
        </section>
      `;
    }
    const isSurfStay = flowKey === 'surf_stay';
    const hasIncludedTransfer = flowKey === 'package_roots_ritual' || flowKey === 'package_surf_soul' || isRetreatFlow;
    const core = this.state.coreAddons || {};
    const selectedTransferTypes = this.getSelectedTransferTypes(core);
    const transferTypeOptions = isRetreatFlow
      ? []
      : selectedTransferTypes.length > 0
        ? selectedTransferTypes
        : hasIncludedTransfer
          ? ['airport', 'bus']
          : [];
    const hasTransfer = !isRetreatFlow && transferTypeOptions.length > 0;
    const transferTravelTogether = core.transferTravelTogether === 'no' ? 'no' : 'yes';
    const guests = Math.max(1, Number(this.getGuestCount() || 1));
    const guestDetails = Array.isArray(this.state.guestDetails) ? this.state.guestDetails : [];
    const contactGuest = guestDetails[0] || {};
    const selectedExperienceRows = (Array.isArray(this.state.experienceRequests) ? this.state.experienceRequests : [])
      .map((row) => ({
        activityKey: String(row?.activityKey || '').trim(),
        title: String(row?.title || row?.activityKey || '').trim(),
      }))
      .filter((row) => !!row.activityKey);
    const activityDatePrefs =
      this.state.activityDatePrefs && typeof this.state.activityDatePrefs === 'object' ? this.state.activityDatePrefs : {};
    const sharedTransport = this.state.transportShared || {};
    const transferArrivalMaxDate = String(this.state.checkIn || '').trim();
    const transferArrivalMinDate = new Date().toISOString().slice(0, 10);
    const transferArrivalMinDateTime = `${transferArrivalMinDate}T00:00`;
    const transferArrivalMaxDateTime = transferArrivalMaxDate ? `${transferArrivalMaxDate}T23:59` : '';
    const singleTransferTypeDefault = transferTypeOptions.length === 1 ? transferTypeOptions[0] : '';
    const sharedTransferTypeValue = String(sharedTransport.transferType || '').trim() || singleTransferTypeDefault;
    const retreatHasSurfRequest = false;
    const surfLevelOptions = [
      { value: 'beginner', label: 'Beginner (never surfed / very little experience)' },
      { value: 'intermediate', label: 'Intermediate (can catch waves independently)' },
      { value: 'advanced', label: 'Advanced (confident in varied conditions)' },
    ];
    const waterConfidenceOptions = [
      { value: 'very_comfortable', label: 'Very comfortable' },
      { value: 'somewhat_comfortable', label: 'Somewhat comfortable' },
      { value: 'not_very_comfortable', label: 'Not very comfortable but willing to learn' },
    ];
    const renderOptions = (options, selected, placeholder) =>
      [`<option value="">${placeholder}</option>`]
        .concat(options.map((opt) => `<option value="${opt.value}" ${selected === opt.value ? 'selected' : ''}>${opt.label}</option>`))
        .join('');
    const intake = this.state.retreatIntakeJson && typeof this.state.retreatIntakeJson === 'object' ? this.state.retreatIntakeJson : {};
    const intakeQ2 = Array.isArray(intake.q2) ? intake.q2 : [];
    const extraGuestBlocks =
      guests > 1
        ? Array.from({ length: guests - 1 })
            .map((_, idx) => {
              const guestIndex = idx + 1;
              const guest = guestDetails[guestIndex] || {};
              const guestTransferTypeValue = String(guest.arrivalTransferType || '').trim() || singleTransferTypeDefault;
              return `
                <div class="guest-card">
                  <div class="guest-card-title">Guest ${guestIndex + 1}</div>
                  <div class="row">
                    <div>
                      <label>Full name <span class="req">*</span></label>
                      <input class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="fullName" type="text" value="${guest.fullName || ''}" />
                    </div>
                    <div>
                      <label>Email (optional)</label>
                      <input class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="email" type="email" value="${guest.email || ''}" />
                    </div>
                    <div>
                      <label>Phone (optional)</label>
                      <input class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="phone" type="text" value="${guest.phone || ''}" />
                    </div>
                  </div>
                  ${
                    isSurfStay || retreatHasSurfRequest
                      ? `<div class="surf-qualification-card">
                          ${this.renderSurfSingleChoiceGroup({
                            guestIndex,
                            guestKey: 'surfLevel',
                            title: 'How would you describe your surfing level?',
                            options: surfLevelOptions,
                            selectedValue: guest.surfLevel || '',
                            required: true,
                            groupId: `stay-surf-level-${guestIndex}`,
                          })}
                          ${this.renderSurfSingleChoiceGroup({
                            guestIndex,
                            guestKey: 'waterConfidence',
                            title: 'How comfortable are you in the ocean?',
                            options: waterConfidenceOptions,
                            selectedValue: guest.waterConfidence || '',
                            required: true,
                            groupId: `stay-water-comfort-${guestIndex}`,
                          })}
                          <div class="surf-qual-block">
                            <label class="surf-qual-label">Any relevant experience or notes <span class="muted">(optional)</span></label>
                            <textarea class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="surfNotes">${guest.surfNotes || guest.surfGoals || ''}</textarea>
                          </div>
                        </div>`
                      : ''
                  }
                  ${
                    hasTransfer && transferTravelTogether === 'no'
                      ? `<div class="row">
                          <div>
                            <label>Arrival transfer type <span class="req">*</span></label>
                            <select class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="arrivalTransferType">
                              ${renderOptions(
                                transferTypeOptions.map((type) => ({
                                  value: type,
                                  label: type === 'airport' ? 'Airport transfer' : 'Bus transfer',
                                })),
                                guestTransferTypeValue,
                                'Select transfer type'
                              )}
                            </select>
                          </div>
                          <div>
                            <label>Flight/Bus number <span class="req">*</span></label>
                            <input class="guest-detail-input" data-guest-index="${guestIndex}" data-guest-key="arrivalReference" type="text" value="${guest.arrivalReference || ''}" />
                          </div>
                          <div>
                            <label>Arrival date & time <span class="req">*</span></label>
                            <input class="guest-detail-input transfer-datetime-input" data-guest-index="${guestIndex}" data-guest-key="arrivalTime" type="datetime-local" min="${transferArrivalMinDateTime}" ${
                              transferArrivalMaxDateTime ? `max="${transferArrivalMaxDateTime}"` : ''
                            } value="${guest.arrivalTime || ''}" />
                          </div>
                        </div>`
                      : ''
                  }
                </div>
              `;
            })
            .join('')
        : '';
    return `
      <section class="step-card ${hidden}">
        <h3>Contact</h3>
        <p class="meta contact-intro">Please complete details for all guests. We use Guest 1 as the main contact for this booking.</p>
        <div class="guest-card guest-card-contact">
          <div class="guest-card-head">
            <div class="guest-card-title">Contact person</div>
            <span class="guest-badge">Guest 1</span>
          </div>
          <p class="meta guest-card-note">This person receives booking updates and confirmation communication.</p>
          <div class="row">
            <div>
              <label>Full name <span class="req">*</span></label>
              <input class="contact-input" data-field-key="guestName" type="text" value="${this.state.guestName || ''}" />
            </div>
            <div>
              <label>Email <span class="req">*</span></label>
              <input class="contact-input" data-field-key="guestEmail" type="email" value="${this.state.guestEmail || ''}" />
            </div>
            <div>
              <label>Phone <span class="req">*</span></label>
              <input class="contact-input" data-field-key="guestPhone" type="text" value="${this.state.guestPhone || ''}" />
            </div>
          </div>
        </div>
        ${
          isSurfStay || retreatHasSurfRequest
            ? `<div class="guest-card">
                <div class="guest-card-title">Surf profile (Guest 1)</div>
                <div class="surf-qualification-card">
                  ${this.renderSurfSingleChoiceGroup({
                    guestIndex: 0,
                    guestKey: 'surfLevel',
                    title: 'How would you describe your surfing level?',
                    options: surfLevelOptions,
                    selectedValue: contactGuest.surfLevel || '',
                    required: true,
                    groupId: 'stay-surf-level-0',
                  })}
                  ${this.renderSurfSingleChoiceGroup({
                    guestIndex: 0,
                    guestKey: 'waterConfidence',
                    title: 'How comfortable are you in the ocean?',
                    options: waterConfidenceOptions,
                    selectedValue: contactGuest.waterConfidence || '',
                    required: true,
                    groupId: 'stay-water-comfort-0',
                  })}
                  <div class="surf-qual-block">
                    <label class="surf-qual-label">Any relevant experience or notes <span class="muted">(optional)</span></label>
                    <textarea class="guest-detail-input" data-guest-index="0" data-guest-key="surfNotes">${contactGuest.surfNotes || contactGuest.surfGoals || ''}</textarea>
                  </div>
                </div>
              </div>`
            : ''
        }
        ${
          !isRetreatFlow && selectedExperienceRows.length
            ? `<div class="guest-card">
                <div class="guest-card-title">Preferred activity dates</div>
                <p class="meta">If you selected activities, choose preferred dates so the team can schedule them correctly.</p>
                ${selectedExperienceRows
                  .map((row) => {
                    const value = String(activityDatePrefs[row.activityKey] || '').trim();
                    return `<div class="row">
                      <div style="grid-column: span 3;">
                        <label>${row.title || row.activityKey}</label>
                        <input
                          class="activity-date-input date-picker-input"
                          data-date-picker
                          data-min-date="${this.state.checkIn || ''}"
                          data-max-date="${this.state.checkOut || ''}"
                          data-activity-key="${row.activityKey}"
                          type="text"
                          placeholder="YYYY-MM-DD"
                          value="${value}"
                        />
                      </div>
                    </div>`;
                  })
                  .join('')}
              </div>`
            : ''
        }
        ${
          hasTransfer && transferTravelTogether === 'yes'
            ? `<div class="guest-card">
                <div class="guest-card-title">Shared transfer arrival details</div>
                <p class="meta">All guests are travelling together, so one arrival plan is enough.</p>
                <div class="row">
                  <div>
                    <label>Transfer type <span class="req">*</span></label>
                    <select class="transfer-shared-input" data-shared-key="transferType">
                      ${renderOptions(
                        transferTypeOptions.map((type) => ({
                          value: type,
                          label: type === 'airport' ? 'Airport transfer' : 'Bus transfer',
                        })),
                        sharedTransferTypeValue,
                        'Select transfer type'
                      )}
                    </select>
                  </div>
                  <div>
                    <label>Flight/Bus number <span class="req">*</span></label>
                    <input class="transfer-shared-input" data-shared-key="arrivalReference" type="text" value="${sharedTransport.arrivalReference || ''}" />
                  </div>
                  <div>
                    <label>Arrival date & time <span class="req">*</span></label>
                    <input class="transfer-shared-input transfer-datetime-input" data-shared-key="arrivalTime" type="datetime-local" min="${transferArrivalMinDateTime}" ${
                      transferArrivalMaxDateTime ? `max="${transferArrivalMaxDateTime}"` : ''
                    } value="${sharedTransport.arrivalTime || ''}" />
                  </div>
                </div>
              </div>`
            : ''
        }
        ${
          hasTransfer && transferTravelTogether === 'no'
            ? `<div class="guest-card">
                <div class="guest-card-title">Guest 1 arrival details</div>
                <div class="row">
                  <div>
                    <label>Arrival transfer type <span class="req">*</span></label>
                    <select class="guest-detail-input" data-guest-index="0" data-guest-key="arrivalTransferType">
                      ${renderOptions(
                        transferTypeOptions.map((type) => ({
                          value: type,
                          label: type === 'airport' ? 'Airport transfer' : 'Bus transfer',
                        })),
                        String(contactGuest.arrivalTransferType || '').trim() || singleTransferTypeDefault,
                        'Select transfer type'
                      )}
                    </select>
                  </div>
                  <div>
                    <label>Flight/Bus number <span class="req">*</span></label>
                    <input class="guest-detail-input" data-guest-index="0" data-guest-key="arrivalReference" type="text" value="${contactGuest.arrivalReference || ''}" />
                  </div>
                  <div>
                    <label>Arrival date & time <span class="req">*</span></label>
                    <input class="guest-detail-input transfer-datetime-input" data-guest-index="0" data-guest-key="arrivalTime" type="datetime-local" min="${transferArrivalMinDateTime}" ${
                      transferArrivalMaxDateTime ? `max="${transferArrivalMaxDateTime}"` : ''
                    } value="${contactGuest.arrivalTime || ''}" />
                  </div>
                </div>
              </div>`
            : ''
        }
        ${
          hasTransfer && transferTravelTogether === 'no'
            ? `<p class="meta contact-inline-note">Add arrival details for each guest below.</p>`
            : ''
        }
        <div class="contact-section ${guests > 1 ? '' : 'hidden'}">
          <h4 class="contact-section-title">Other guests</h4>
          <p class="meta">Add names for all guests included in this booking.</p>
          ${extraGuestBlocks}
        </div>
        ${
          isRetreatFlow
            ? `<div class="guest-card">
                <div class="guest-card-title">Final retreat intake (required)</div>
                <p class="meta">This is not a formal application. It helps us understand where you are and whether this space feels supportive for you right now.</p>
                <div class="row">
                  <div style="grid-column: span 3;">
                    <label>1) What has led you to explore this retreat at this moment in your life? <span class="req">*</span></label>
                    <textarea class="retreat-intake-input" data-intake-key="q1">${intake.q1 || ''}</textarea>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>2) Which of the following best reflects your current experience? <span class="req">*</span></label>
                    <div class="check-col">
                      ${[
                        ['mentally_overloaded', 'Feeling mentally overloaded or overthinking'],
                        ['emotional_fatigue', 'Emotional fatigue or burnout'],
                        ['disconnected_body', 'Disconnected from my body'],
                        ['seeking_clarity', 'Seeking clarity or direction'],
                        ['stuck_patterns', 'Feeling stuck in repeating patterns'],
                        ['deep_rest_reset', 'Wanting deep rest and reset'],
                        ['hard_to_words', 'Something hard to put into words'],
                        ['other', 'Other'],
                      ]
                        .map(
                          ([value, label]) =>
                            `<label class="check-line"><input type="checkbox" class="retreat-intake-input" data-intake-key="q2" data-intake-group="q2" value="${value}" ${
                              intakeQ2.includes(value) ? 'checked' : ''
                            } /><span>${label}</span></label>`
                        )
                        .join('')}
                    </div>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>3) What feels ready to shift, soften, or be understood differently right now? <span class="req">*</span></label>
                    <textarea class="retreat-intake-input" data-intake-key="q3">${intake.q3 || ''}</textarea>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>4) Comfort with breathwork, emotional reflection, movement, or somatic work? <span class="req">*</span></label>
                    <select class="retreat-intake-input" data-intake-key="q4">
                      ${renderOptions(
                        [
                          { value: 'very_comfortable', label: 'Very comfortable / experienced' },
                          { value: 'open_new', label: 'Open but new to it' },
                          { value: 'curious_unsure', label: 'Curious but slightly unsure' },
                          { value: 'not_sure_open', label: 'Not sure yet, but willing to explore' },
                        ],
                        intake.q4 || '',
                        'Select option'
                      )}
                    </select>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>5) How comfortable are you being in the ocean? <span class="req">*</span></label>
                    <select class="retreat-intake-input" data-intake-key="q5">
                      ${renderOptions(
                        [
                          { value: 'very_comfortable', label: 'Very comfortable / experienced' },
                          { value: 'somewhat_comfortable', label: 'Somewhat comfortable' },
                          { value: 'unsure_curious', label: 'Unsure but curious' },
                          { value: 'not_comfortable', label: 'Not comfortable / limited experience' },
                          { value: 'cant_swim', label: 'Can’t swim' },
                        ],
                        intake.q5 || '',
                        'Select option'
                      )}
                    </select>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>6) When you experience emotional intensity, what tends to support you most? <span class="req">*</span></label>
                    <textarea class="retreat-intake-input" data-intake-key="q6">${intake.q6 || ''}</textarea>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>7) How do you feel in small group environments? <span class="req">*</span></label>
                    <select class="retreat-intake-input" data-intake-key="q7">
                      ${renderOptions(
                        [
                          { value: 'at_ease', label: 'I feel naturally at ease in groups' },
                          { value: 'warm_up', label: 'I warm up with time' },
                          { value: 'prefer_space', label: 'I prefer space but can engage when needed' },
                          { value: 'unsure_open', label: 'I feel unsure but open to it' },
                        ],
                        intake.q7 || '',
                        'Select option'
                      )}
                    </select>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>8) What are you hoping this experience supports you with? <span class="req">*</span></label>
                    <textarea class="retreat-intake-input" data-intake-key="q8">${intake.q8 || ''}</textarea>
                  </div>
                  <div style="grid-column: span 3;">
                    <label>9) Are you open to a short confidential call with Julia before confirmation? <span class="req">*</span></label>
                    <select class="retreat-intake-input" data-intake-key="q9">
                      ${renderOptions(
                        [
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                          { value: 'more_info', label: 'I would like more information first' },
                        ],
                        intake.q9 || '',
                        'Select option'
                      )}
                    </select>
                  </div>
                </div>
                <p class="meta">We read every response with care. This is a space of honesty, not perfection.</p>
              </div>`
            : ''
        }
        <div class="guest-card">
          <div class="guest-card-title">Final details</div>
          <div class="row">
            <div style="grid-column: span 3;">
              <label>Dietary notes / allergies (optional)</label>
              <textarea class="contact-input" data-field-key="dietaryNotes">${this.state.dietaryNotes || ''}</textarea>
            </div>
          </div>
          <label class="check-line terms-check">
            <input class="contact-input" data-field-key="termsAccepted" type="checkbox" ${this.state.termsAccepted ? 'checked' : ''} />
            <span>I agree to the booking terms and policy <span class="req">*</span>.</span>
          </label>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnSubmitBooking" ${this.isUiBusy() ? 'disabled' : ''}>Submit reservation</button>
      </section>
    `;
  }

  renderOtherSteps(currentStep, variant) {
    if (variant === 'stay' || variant === 'package') {
      if (this.getFlowKey() === 'retreats') return `${this.renderStayStep4(currentStep)}`;
      return `${this.renderStayStep3(currentStep)}${this.renderStayStep4(currentStep)}`;
    }
    if (variant === 'enquiry') {
      if (this.isCustomRetreatRequest()) {
        return [
          this.renderCustomRetreatStep1(currentStep),
          this.renderCustomRetreatStep2(currentStep),
          this.renderCustomRetreatStep3(currentStep),
          this.renderCustomRetreatStep4(currentStep),
          this.renderCustomRetreatStep5(currentStep),
        ].join('');
      }
      return `${this.renderEnquiryStep1(currentStep)}${this.renderEnquiryStep2(currentStep)}`;
    }
    return '';
  }

  getCustomRetreatTypeOptions() {
    return [
      { key: 'birthday', label: 'Birthday celebration' },
      { key: 'special_occasion', label: 'Special occasion' },
      { key: 'wellness', label: 'Wellness retreat' },
      { key: 'yoga', label: 'Yoga retreat' },
      { key: 'surf', label: 'Surf retreat' },
      { key: 'creative', label: 'Creative retreat' },
      { key: 'corporate', label: 'Corporate retreat / team offsite' },
      { key: 'family', label: 'Family gathering' },
      { key: 'friends', label: 'Friends getaway' },
      { key: 'cultural', label: 'Cultural experience' },
      { key: 'other', label: 'Other' },
    ];
  }

  getCountryOptions() {
    return [
      'Morocco', 'Spain', 'Portugal', 'France', 'United Kingdom', 'Germany',
      'Netherlands', 'Belgium', 'Switzerland', 'Italy', 'Austria', 'Sweden',
      'Norway', 'Denmark', 'Finland', 'Ireland', 'Poland', 'Czech Republic',
      'United States', 'Canada', 'Australia', 'New Zealand', 'Brazil', 'Argentina',
      'Mexico', 'Chile', 'Colombia', 'Japan', 'South Korea', 'Singapore',
      'United Arab Emirates', 'Israel', 'South Africa', 'India', 'Greece', 'Hungary',
      'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'Slovakia', 'Estonia', 'Latvia',
      'Lithuania', 'Iceland', 'Luxembourg', 'Malta', 'Cyprus', 'Turkey', 'Other',
    ];
  }

  getCustomRetreatRoomTypes() {
    // Static accommodation matrix used by the bespoke flow.
    // Counts mirror the property's master inventory but availability is NOT checked here
    // — the request is purely informational until the team reviews it.
    // Image / title come from `loadRoomTypeMetadata` (CMS-driven, same source as the
    // package/stay flows) so visuals stay consistent across all booking entry points.
    const fallback = [
      { roomTypeKey: 'dorm', label: 'Dorm bed', maxUnits: 8, capacity: 1, unitWord: 'bed', image: '' },
      { roomTypeKey: 'single', label: 'Single room', maxUnits: 2, capacity: 1, unitWord: 'room', image: '' },
      { roomTypeKey: 'double', label: 'Double room', maxUnits: 2, capacity: 2, unitWord: 'room', image: '' },
    ];
    const incoming = Array.isArray(this.options?.customRetreatRoomMeta) ? this.options.customRetreatRoomMeta : [];
    if (!incoming.length) return fallback;
    const byKey = new Map(incoming.map((row) => [String(row?.roomTypeKey || '').toLowerCase(), row]));
    return fallback.map((base) => {
      const meta = byKey.get(base.roomTypeKey) || {};
      return {
        roomTypeKey: base.roomTypeKey,
        label: String(meta.title || base.label),
        maxUnits: Math.max(0, Number(meta.maxUnits || base.maxUnits)),
        capacity: Math.max(1, Number(meta.capacityPerUnit || base.capacity)),
        unitWord: String(meta.unitWord || base.unitWord),
        image: String(meta.image || ''),
      };
    });
  }

  renderCustomRetreatStep1(currentStep) {
    const hidden = currentStep !== 1 ? 'hidden' : '';
    const stepErr = this.errors.step1 || '';
    const guests = Math.max(1, Math.min(20, Number(this.state.guestCount || 1)));
    const todayKey = new Date().toISOString().slice(0, 10);
    const checkInMin = todayKey;
    const checkOut = String(this.state.checkOut || '');
    const checkOutMin = this.state.checkIn || todayKey;
    return `
      <section class="step-card enquiry-step custom-retreat-step ${hidden}">
        <h3>Dates &amp; guests</h3>
        <p class="meta">Tell us your preferred arrival and departure, and how many people will join.</p>
        <div class="row">
          <div>
            <label>Guests <span class="req">*</span></label>
            <div class="stepper-wrap">
              <button type="button" class="guests-stepper-btn" data-delta="-1">-</button>
              <input id="customRetreatGuests" type="number" min="1" max="20" value="${guests}" />
              <button type="button" class="guests-stepper-btn" data-delta="1">+</button>
            </div>
          </div>
          <div>
            <label>Preferred arrival <span class="req">*</span></label>
            <input id="customRetreatCheckIn" type="date" min="${checkInMin}" value="${this.state.checkIn || ''}" />
          </div>
          <div>
            <label>Preferred departure <span class="req">*</span></label>
            <input id="customRetreatCheckOut" type="date" min="${checkOutMin}" value="${checkOut}" />
          </div>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <button id="btnCustomRetreatStep1Continue" ${this.loading ? 'disabled' : ''}>Continue</button>
      </section>
    `;
  }

  renderCustomRetreatStep2(currentStep) {
    const hidden = currentStep !== 2 ? 'hidden' : '';
    const stepErr = this.errors.step2 || '';
    const wholeHouse = this.state.wholeHouseEnquiry === true;
    const roomSelections = Array.isArray(this.state.roomSelections) ? this.state.roomSelections : [];
    const getQty = (key) => {
      const row = roomSelections.find((r) => r.roomTypeKey === key);
      return Math.max(0, Number(row?.quantity || row?.quantityUnits || 0));
    };
    const roomCards = this.getCustomRetreatRoomTypes()
      .map((rt) => {
        const qty = wholeHouse ? 0 : getQty(rt.roomTypeKey);
        const unitsLabel = `Up to ${rt.maxUnits} ${rt.unitWord}${rt.maxUnits === 1 ? '' : 's'}`;
        const sleepsLabel = `sleeps ${rt.capacity}/${rt.unitWord}`;
        const imageHtml = rt.image
          ? `<img class="custom-retreat-room-image" src="${this.optimizeImageUrl(rt.image, 320, 240, 72)}" alt="${rt.label}" loading="lazy" decoding="async" fetchpriority="low" />`
          : '<div class="custom-retreat-room-image placeholder">No image</div>';
        return `<div class="custom-retreat-room-card ${qty > 0 ? 'is-selected' : ''}" data-room-type="${rt.roomTypeKey}">
          <div class="custom-retreat-room-image-wrap">${imageHtml}</div>
          <div class="custom-retreat-room-body">
            <div class="custom-retreat-room-head">
              <span class="custom-retreat-room-title">${rt.label}</span>
              <span class="custom-retreat-room-meta">${unitsLabel} · ${sleepsLabel}</span>
            </div>
            <div class="stepper-wrap">
              <button type="button" class="custom-retreat-room-step" data-room-type="${rt.roomTypeKey}" data-delta="-1" ${wholeHouse ? 'disabled' : ''}>-</button>
              <input class="custom-retreat-room-qty" data-room-type="${rt.roomTypeKey}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${qty}" data-max="${rt.maxUnits}" ${wholeHouse ? 'disabled' : ''} />
              <button type="button" class="custom-retreat-room-step" data-room-type="${rt.roomTypeKey}" data-delta="1" ${wholeHouse ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>`;
      })
      .join('');
    return `
      <section class="step-card enquiry-step custom-retreat-step ${hidden}">
        <h3>Accommodation</h3>
        <p class="meta">Pick rooms or request the whole house. This is an enquiry — we will not block any inventory until our team confirms.</p>
        <label class="custom-retreat-whole-house-toggle">
          <input type="checkbox" id="customRetreatWholeHouse" ${wholeHouse ? 'checked' : ''} />
          <span><strong>We would like to book the whole house</strong> — enquiry only, calendar availability is not blocked.</span>
        </label>
        <div class="custom-retreat-rooms ${wholeHouse ? 'rooms-disabled' : ''}">
          ${roomCards}
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <div class="custom-retreat-step-actions">
          <button type="button" class="custom-retreat-back-btn" data-target-step="1">Back</button>
          <button id="btnCustomRetreatStep2Continue" ${this.loading ? 'disabled' : ''}>Continue</button>
        </div>
      </section>
    `;
  }

  renderCustomRetreatStep3(currentStep) {
    const hidden = currentStep !== 3 ? 'hidden' : '';
    const stepErr = this.errors.step3 || '';
    const intake = this.state.retreatIntakeJson && typeof this.state.retreatIntakeJson === 'object' ? this.state.retreatIntakeJson : {};
    const types = Array.isArray(intake.retreatTypes) ? intake.retreatTypes.map((x) => String(x || '').toLowerCase()) : [];
    const otherText = String(intake.retreatTypeOther || '');
    const otherChecked = types.includes('other');
    const checkboxes = this.getCustomRetreatTypeOptions()
      .map((opt) => {
        const isChecked = types.includes(opt.key);
        return `<label class="custom-retreat-type-row">
          <input type="checkbox" class="custom-retreat-type-toggle" data-type-key="${opt.key}" ${isChecked ? 'checked' : ''} />
          <span>${opt.label}</span>
        </label>`;
      })
      .join('');
    return `
      <section class="step-card enquiry-step custom-retreat-step ${hidden}">
        <h3>Tell us about your retreat</h3>
        <p class="meta">What would you like to create? Select all that apply.</p>
        <div class="custom-retreat-type-list">
          ${checkboxes}
        </div>
        <div class="custom-retreat-type-other ${otherChecked ? '' : 'hidden'}">
          <label>Tell us more about "Other"</label>
          <input id="customRetreatTypeOther" type="text" value="${otherText.replace(/"/g, '&quot;')}" placeholder="Briefly describe the retreat type" />
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <div class="custom-retreat-step-actions">
          <button type="button" class="custom-retreat-back-btn" data-target-step="2">Back</button>
          <button id="btnCustomRetreatStep3Continue" ${this.loading ? 'disabled' : ''}>Continue</button>
        </div>
      </section>
    `;
  }

  renderCustomRetreatStep4(currentStep) {
    const hidden = currentStep !== 4 ? 'hidden' : '';
    const stepErr = this.errors.step4 || '';
    const intake = this.state.retreatIntakeJson && typeof this.state.retreatIntakeJson === 'object' ? this.state.retreatIntakeJson : {};
    const vision = String(intake.vision || '');
    const activitiesWanted = String(intake.activitiesWanted || '');
    const specialRequirements = String(intake.specialRequirements || '');
    return `
      <section class="step-card enquiry-step custom-retreat-step ${hidden}">
        <h3>Retreat details</h3>
        <p class="meta">Please tell us a little more about your plans.</p>
        <div class="addon-block">
          <label>What are you hoping to create? <span class="req">*</span></label>
          <textarea id="customRetreatVision" class="retreat-intake-input" data-intake-key="vision" placeholder="Share the vision for your retreat...">${vision}</textarea>
        </div>
        <div class="addon-block">
          <label>Any activities or experiences you would like included? <span class="req">*</span></label>
          <textarea id="customRetreatActivities" class="retreat-intake-input" data-intake-key="activitiesWanted" placeholder="Surf sessions, yoga, breathwork, hammam, workshops...">${activitiesWanted}</textarea>
        </div>
        <div class="addon-block">
          <label>Any special requirements or requests?</label>
          <textarea id="customRetreatSpecialRequirements" class="retreat-intake-input" data-intake-key="specialRequirements" placeholder="Dietary needs, accessibility, anything else worth mentioning...">${specialRequirements}</textarea>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <div class="custom-retreat-step-actions">
          <button type="button" class="custom-retreat-back-btn" data-target-step="3">Back</button>
          <button id="btnCustomRetreatStep4Continue" ${this.loading ? 'disabled' : ''}>Continue</button>
        </div>
      </section>
    `;
  }

  renderCustomRetreatStep5(currentStep) {
    const hidden = currentStep !== 5 ? 'hidden' : '';
    const stepErr = this.errors.step5 || '';
    const submitted = this.state.submissionStatus === 'success';
    if (submitted) {
      return `
        <section class="step-card enquiry-step custom-retreat-step ${hidden}">
          <h3>Request received</h3>
          <div class="success-box">
            <p>Thank you, your custom retreat request has been received.</p>
            <p>We will review your application and follow up shortly with next steps and a payment link if your retreat is confirmed.</p>
          </div>
        </section>
      `;
    }
    const guests = Math.max(1, Number(this.state.guestCount || 1));
    const guestDetails = Array.from({ length: guests }).map((_, idx) => this.state.guestDetails?.[idx] || {});
    const country = String(this.state.guestCountry || '');
    const countries = this.getCountryOptions();
    const countryOptionsHtml = ['<option value="">Select your country</option>']
      .concat(countries.map((c) => `<option value="${c}" ${c === country ? 'selected' : ''}>${c}</option>`))
      .join('');
    const renderGuestCard = (idx) => {
      const guest = guestDetails[idx] || {};
      const isContact = idx === 0;
      const reqMark = '<span class="req">*</span>';
      return `<div class="guest-card ${isContact ? 'guest-card-contact' : ''}">
        <div class="guest-card-head">
          <div class="guest-card-title">${isContact ? 'Contact person' : `Guest ${idx + 1}`}</div>
          ${isContact ? '<span class="guest-badge">Primary</span>' : ''}
        </div>
        <div class="row">
          <div>
            <label>Full name ${reqMark}</label>
            <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="fullName" type="text" value="${(guest.fullName || '').replace(/"/g, '&quot;')}" />
          </div>
          <div>
            <label>Email ${isContact ? reqMark : '(optional)'}</label>
            <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="email" type="email" value="${(guest.email || '').replace(/"/g, '&quot;')}" />
          </div>
          <div>
            <label>Phone / WhatsApp ${isContact ? reqMark : '(optional)'}</label>
            <input class="guest-detail-input" data-guest-index="${idx}" data-guest-key="phone" type="text" value="${(guest.phone || '').replace(/"/g, '&quot;')}" />
          </div>
        </div>
      </div>`;
    };
    return `
      <section class="step-card enquiry-step custom-retreat-step ${hidden}">
        <h3>Your details</h3>
        <p class="meta">We will use these details to follow up about your retreat.</p>
        ${guestDetails.map((_, idx) => renderGuestCard(idx)).join('')}
        <div class="addon-block">
          <label>Country <span class="req">*</span></label>
          <select id="customRetreatCountry" class="contact-input">${countryOptionsHtml}</select>
        </div>
        <p class="error ${stepErr ? '' : 'hidden'}">${stepErr}</p>
        <div class="custom-retreat-step-actions">
          <button type="button" class="custom-retreat-back-btn" data-target-step="4">Back</button>
          <button id="btnCustomRetreatSubmit" ${this.isUiBusy() ? 'disabled' : ''}>Submit retreat request</button>
        </div>
      </section>
    `;
  }

  getFocusRestoreKey(element) {
    if (!element || !(element instanceof HTMLElement) || !this.shadowRoot?.contains(element)) return '';
    if (element.id) return `id|${element.id}`;
    const guestKey = element.getAttribute('data-guest-key');
    if (guestKey) {
      return `guest|${element.getAttribute('data-guest-index') || '0'}|${guestKey}`;
    }
    const intakeKey = element.getAttribute('data-intake-key');
    if (intakeKey) return `intake|${intakeKey}`;
    const fieldKey = element.getAttribute('data-field-key');
    if (fieldKey) return `field|${fieldKey}`;
    const activityKey = element.getAttribute('data-activity-key');
    if (activityKey) return `activity|${activityKey}`;
    const roomType = element.getAttribute('data-room-type');
    if (roomType) return `room|${roomType}`;
    return '';
  }

  findFocusRestoreTarget(key) {
    const token = String(key || '').trim();
    if (!token || !this.shadowRoot) return null;
    const parts = token.split('|');
    const kind = parts[0];
    if (kind === 'id') return this.shadowRoot.getElementById(parts.slice(1).join('|'));
    if (kind === 'guest') {
      const index = parts[1] || '0';
      const guestKey = parts.slice(2).join('|');
      return (
        this.shadowRoot.querySelector(
          `.guest-detail-input[data-guest-index="${index}"][data-guest-key="${guestKey}"]`
        ) ||
        this.shadowRoot.querySelector(
          `.enquiry-activity-select[data-guest-index="${index}"][data-activity-key="${guestKey}"]`
        )
      );
    }
    if (kind === 'intake') {
      return this.shadowRoot.querySelector(`.retreat-intake-input[data-intake-key="${parts.slice(1).join('|')}"]`);
    }
    if (kind === 'field') {
      return this.shadowRoot.querySelector(`.contact-input[data-field-key="${parts.slice(1).join('|')}"]`);
    }
    if (kind === 'activity') {
      return this.shadowRoot.querySelector(`.experience-toggle[data-activity-key="${parts.slice(1).join('|')}"]`);
    }
    if (kind === 'room') {
      return this.shadowRoot.querySelector(`.custom-retreat-room-qty[data-room-type="${parts.slice(1).join('|')}"]`);
    }
    return null;
  }

  captureScrollState() {
    if (!this.shadowRoot) return;
    const nodes = [...this.shadowRoot.querySelectorAll('[data-scroll-key]')];
    const next = {};
    nodes.forEach((node) => {
      const key = String(node.getAttribute('data-scroll-key') || '').trim();
      if (!key) return;
      next[key] = {
        top: Number(node.scrollTop || 0),
        left: Number(node.scrollLeft || 0),
      };
    });
    this.scrollStateByKey = next;
    const active = this.shadowRoot.activeElement;
    const canRestoreSelection =
      active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    this.renderViewportState = {
      windowScrollY: Number(window.scrollY || document.documentElement?.scrollTop || 0),
      windowScrollX: Number(window.scrollX || document.documentElement?.scrollLeft || 0),
      focusKey: this.getFocusRestoreKey(active),
      selectionStart: canRestoreSelection ? Number(active.selectionStart || 0) : null,
      selectionEnd: canRestoreSelection ? Number(active.selectionEnd || 0) : null,
    };
  }

  restoreScrollState() {
    if (!this.shadowRoot) return;
    const snapshot = this.scrollStateByKey || {};
    const nodes = [...this.shadowRoot.querySelectorAll('[data-scroll-key]')];
    nodes.forEach((node) => {
      const key = String(node.getAttribute('data-scroll-key') || '').trim();
      if (!key || !snapshot[key]) return;
      node.scrollTop = Number(snapshot[key].top || 0);
      node.scrollLeft = Number(snapshot[key].left || 0);
    });
    const viewport = this.renderViewportState || {};
    const restoreViewport = () => {
      const top = Number(viewport.windowScrollY || 0);
      const left = Number(viewport.windowScrollX || 0);
      if (top > 0 || left > 0) {
        try {
          window.scrollTo({ top, left, behavior: 'instant' });
        } catch (_e) {
          window.scrollTo(left, top);
        }
      }
      const focusTarget = this.findFocusRestoreTarget(viewport.focusKey);
      if (focusTarget && typeof focusTarget.focus === 'function') {
        try {
          focusTarget.focus({ preventScroll: true });
        } catch (_e) {
          focusTarget.focus();
        }
        if (
          viewport.selectionStart != null &&
          (focusTarget instanceof HTMLInputElement || focusTarget instanceof HTMLTextAreaElement)
        ) {
          try {
            focusTarget.setSelectionRange(
              Number(viewport.selectionStart || 0),
              Number(viewport.selectionEnd != null ? viewport.selectionEnd : viewport.selectionStart || 0)
            );
          } catch (_e) {
            // Ignore selection restore errors for unsupported input types.
          }
        }
      }
      this.reportLayoutHeight();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(restoreViewport));
    } else {
      setTimeout(restoreViewport, 0);
    }
  }

  reportLayoutHeight() {
    const height = Math.ceil(
      Math.max(
        Number(this.scrollHeight || 0),
        Number(this.offsetHeight || 0),
        Number(this.shadowRoot?.firstElementChild?.scrollHeight || 0)
      )
    );
    if (!(height > 0) || height === this.lastReportedHeight) return;
    this.lastReportedHeight = height;
    this.emit('layout-height', { height });
  }

  setupLayoutObserver() {
    if (this.layoutObserver || typeof ResizeObserver !== 'function') {
      queueMicrotask(() => this.reportLayoutHeight());
      return;
    }
    this.layoutObserver = new ResizeObserver(() => this.reportLayoutHeight());
    this.layoutObserver.observe(this);
    queueMicrotask(() => this.reportLayoutHeight());
  }

  hideSelectPlaceholdersOnOpen() {
    if (!this.shadowRoot) return;
    const selects = [...this.shadowRoot.querySelectorAll('select')];
    selects.forEach((select) => {
      const firstOption = select.options && select.options.length ? select.options[0] : null;
      if (!firstOption) return;
      const optionValue = String(firstOption.value || '').trim();
      const optionText = String(firstOption.textContent || '').trim().toLowerCase();
      const looksLikePlaceholder =
        optionValue === '' && (optionText.startsWith('select ') || optionText.startsWith('choose '));
      if (!looksLikePlaceholder) return;
      firstOption.disabled = true;
      firstOption.hidden = true;
    });
  }

  render() {
    if (!this.shadowRoot) return;
    this.captureScrollState();
    const variant = this.getVariant();
    const steps = this.getSteps();
    const currentStep = this.getCurrentStep();
    const accent = this.theme.accent || '#de7a45';
    const bg = this.theme.bg || '#f5f6f8';
    const surface = this.theme.surface || '#ffffff';
    const flowMeta = this.getFlowMeta();

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --accent: ${accent};
          --bg: ${bg};
          --surface: ${surface};
          --line: #e5e3dc;
          --text: #2d2820;
          --muted: #756c61;
          --error: #c64040;
          display: block;
          width: 100%;
          height: auto;
          position: relative;
          min-height: 0;
          overflow: visible;
          background: transparent;
          font-family: "Inter", Arial, sans-serif;
          color: var(--text);
          -webkit-font-smoothing: antialiased;
          line-height: 1.5;
        }
        * { box-sizing: border-box; }
        .grid {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
          gap: 24px;
          width: 100%;
          min-height: 0;
          height: auto;
          overflow: visible;
        }
        .panel {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.03);
          height: auto;
          overflow: visible;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        }
        .flow-head {
          border: 1px solid var(--line);
          background: #fffdfa;
          border-radius: 14px;
          padding: 16px 18px;
          margin-bottom: 20px;
        }
        .flow-title {
          margin: 0 0 6px;
          font-size: 24px;
          font-weight: 700;
          line-height: 1.2;
        }
        .flow-subtitle {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.45;
        }
        .chip {
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 7px 14px;
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
          font-weight: 500;
          transition: border-color 0.15s ease;
        }
        .dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #d5d8de;
          color: #fff;
          font-size: 11px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .chip.active { border-color: var(--accent); }
        .chip.active .dot { background: var(--accent); }
        .chip.done .dot { background: #2f9e69; }
        .chip-jump {
          cursor: pointer;
        }
        .chip-jump:hover {
          border-color: var(--accent);
          background: #fff7f2;
        }
        .step-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 18px;
          margin-bottom: 18px;
          background: #fffdfa;
        }
        .step-card > button {
          margin-top: 16px;
        }
        .enquiry-step .row {
          gap: 14px;
        }
        .enquiry-step .row + .row {
          margin-top: 14px;
        }
        .enquiry-step .addon-block {
          margin-top: 16px;
          margin-bottom: 18px;
          padding: 16px;
        }
        .enquiry-step .addon-block h4 {
          margin-bottom: 12px;
        }
        .enquiry-step .addon-block .meta {
          margin: 0 0 12px;
        }
        .enquiry-step .experience-list {
          margin-top: 10px;
          padding-top: 2px;
        }
        .retreat-selector-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          max-height: none;
          overflow: visible;
          padding-right: 0;
        }
        .retreat-selector-grid .exp-item-wrap {
          margin-bottom: 0;
        }
        .enquiry-step .terms-under-button {
          margin-top: 14px;
        }
        .hidden { display: none; }
        h3 { margin: 0 0 14px; font-size: 22px; line-height: 1.2; font-weight: 700; }
        .meta { color: var(--muted); font-size: 14px; line-height: 1.45; }
        .error-text { color: var(--error); font-weight: 600; }
        .error { color: var(--error); font-size: 13px; margin: 12px 0; font-weight: 500; white-space: pre-line; }
        .package-payment-note {
          margin: 10px 0 0;
          font-size: 13px;
          line-height: 1.45;
          color: #4338ca;
          font-weight: 500;
        }
        .field-hint {
          margin: 6px 0 0;
          font-size: 12px;
          color: var(--error);
          line-height: 1.3;
          font-weight: 500;
        }
        .input-missing {
          border-color: #c64040 !important;
          box-shadow: 0 0 0 2px rgba(198, 64, 64, 0.08);
        }
        .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .row + .row { margin-top: 14px; }
        .contact-intro {
          margin: -2px 0 14px;
        }
        .contact-group {
          margin-bottom: 10px;
        }
        .guest-card {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 16px;
          background: #fffdfa;
        }
        .guest-card .row + .row {
          margin-top: 12px;
        }
        .guest-card-contact {
          border-color: #f0c7ad;
          background: #fff7f2;
        }
        .guest-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .guest-card-title {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 8px;
          line-height: 1.3;
        }
        .guest-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 26px;
          border-radius: 999px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          color: #7f3a14;
          border: 1px solid #f0c7ad;
          background: #fff;
          white-space: nowrap;
        }
        .guest-card-note {
          margin: 0 0 12px;
          font-size: 13px;
          line-height: 1.45;
        }
        .participant-activity-box {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          padding: 12px 14px;
          margin: 4px 0 12px;
        }
        .participant-activity-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted);
          margin-bottom: 4px;
          font-weight: 500;
        }
        .participant-activity-value {
          font-size: 16px;
          font-weight: 700;
          line-height: 1.25;
        }
        .participant-activity-price {
          font-size: 13px;
          color: var(--muted);
          margin-top: 4px;
        }
        .contact-section {
          margin-top: 16px;
        }
        .contact-section-title {
          margin: 0 0 6px;
          font-size: 16px;
          font-weight: 700;
        }
        .contact-inline-note {
          margin: 0 0 12px;
        }
        .terms-check {
          margin-top: 12px;
          margin-bottom: 0;
          align-items: flex-start;
        }
        .terms-under-button {
          margin-top: 10px;
          margin-bottom: 0;
        }
        .terms-check input[type='checkbox'] {
          margin-top: 3px;
        }
        .success-box {
          border: 1px solid #c8e6c4;
          background: #f3fbf2;
          border-radius: 14px;
          padding: 16px 18px;
        }
        .success-box p {
          margin: 0 0 8px;
          line-height: 1.45;
        }
        .success-box p:last-child {
          margin-bottom: 0;
        }

        /* Custom Retreat — bespoke 5-step request flow */
        .custom-retreat-step .row {
          gap: 14px;
          margin-bottom: 16px;
        }
        .custom-retreat-step-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .custom-retreat-step-actions button {
          flex: 1 1 160px;
        }
        .custom-retreat-back-btn {
          background: #fff;
          color: var(--accent);
          border: 1px solid var(--accent);
        }
        .custom-retreat-back-btn:hover {
          background: rgba(222,122,69,0.08);
        }
        .custom-retreat-whole-house-toggle {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fafbfc;
          margin: 8px 0 16px;
          cursor: pointer;
        }
        .custom-retreat-whole-house-toggle input[type="checkbox"] {
          width: 18px;
          min-height: 18px;
          margin-top: 2px;
          flex: 0 0 18px;
        }
        .custom-retreat-whole-house-toggle span {
          font-size: 14px;
          line-height: 1.45;
          color: var(--text);
        }
        .custom-retreat-rooms {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .custom-retreat-rooms.rooms-disabled {
          opacity: 0.55;
          pointer-events: none;
        }
        .custom-retreat-room-card {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
          align-items: stretch;
          gap: 0;
          padding: 0;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .custom-retreat-room-card.is-selected {
          border-color: var(--accent);
          box-shadow: 0 0 0 1px var(--accent) inset;
        }
        .custom-retreat-room-image-wrap {
          width: 120px;
          min-height: 96px;
          background: #f3eee5;
          overflow: hidden;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
        }
        .custom-retreat-room-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .custom-retreat-room-image.placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: var(--muted);
          background: #f3eee5;
        }
        .custom-retreat-room-body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          min-width: 0;
        }
        .custom-retreat-room-head {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .custom-retreat-room-title {
          font-weight: 600;
          font-size: 14px;
          color: var(--text);
        }
        .custom-retreat-room-meta {
          font-size: 12px;
          color: var(--muted);
        }
        .custom-retreat-room-card .stepper-wrap {
          display: grid;
          grid-template-columns: 34px 48px 34px;
          align-items: center;
          gap: 6px;
        }
        .custom-retreat-room-card .stepper-wrap input {
          text-align: center;
          padding: 0 6px;
          min-height: 36px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          /* Hide native number-spinner UI just in case (defense-in-depth) */
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .custom-retreat-room-card .stepper-wrap input::-webkit-outer-spin-button,
        .custom-retreat-room-card .stepper-wrap input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .custom-retreat-room-card .stepper-wrap button {
          min-height: 36px;
          width: 34px;
          padding: 0;
          font-size: 16px;
        }
        @media (max-width: 480px) {
          .custom-retreat-room-card {
            grid-template-columns: 88px minmax(0, 1fr);
          }
          .custom-retreat-room-image-wrap {
            width: 88px;
            min-height: 88px;
          }
          .custom-retreat-room-body {
            padding: 10px 12px;
            gap: 10px;
          }
        }
        .custom-retreat-type-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }
        .custom-retreat-type-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          cursor: pointer;
          transition: border-color 0.12s ease, background 0.12s ease;
        }
        .custom-retreat-type-row:hover { border-color: var(--accent); background: #fffaf6; }
        .custom-retreat-type-row input[type="checkbox"] {
          width: 16px;
          min-height: 16px;
          margin-top: 0;
          flex: 0 0 16px;
        }
        .custom-retreat-type-row span {
          font-size: 12.5px;
          line-height: 1.35;
          color: var(--text);
        }
        .custom-retreat-type-other {
          margin-top: 6px;
          margin-bottom: 4px;
        }
        .custom-retreat-step .addon-block { margin-bottom: 14px; }
        label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
        .req {
          color: var(--accent);
          font-weight: 700;
        }
        input, select, textarea, button {
          width: 100%;
          min-height: 42px;
          border-radius: 10px;
          font-family: inherit;
        }
        input, select, textarea {
          border: 1px solid #d4d8e0;
          padding: 9px 12px;
          background: #fff;
          font-size: 14px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          line-height: 1.4;
        }
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px rgba(222,122,69,0.1);
        }
        input::placeholder, textarea::placeholder { color: #a09889; }
        select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding-right: 36px;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23756c61' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 14px 14px;
        }
        .date-picker-input {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23756c61' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          background-size: 14px 14px;
          padding-right: 36px;
        }
        textarea {
          min-height: 88px;
          resize: vertical;
          font-family: inherit;
          line-height: 1.45;
        }
        input[type='checkbox'],
        input[type='radio'] {
          width: 16px;
          min-height: 16px;
          height: 16px;
          padding: 0;
          border-radius: 50%;
          border: none;
          background: transparent;
          appearance: auto;
          vertical-align: middle;
        }
        button {
          border: none;
          background: var(--accent);
          color: #fff;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        button:hover:not(:disabled) { filter: brightness(0.93); }
        button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        button.secondary {
          background: #f4f0e8;
          color: #423a30;
        }
        button.secondary:hover:not(:disabled) { background: #ebe6db; }
        .continue { margin-top: 16px; }
        .step-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
          gap: 12px;
        }
        .room-step-head {
          margin-bottom: 4px;
        }
        .room-step-intro {
          margin: 0 0 10px;
        }
        .step-head button {
          width: auto;
          min-width: 100px;
          padding: 0 16px;
        }
        .room-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px 16px;
          margin-bottom: 14px;
          background: #fff;
          transition: box-shadow 0.15s ease;
        }
        .room-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
        .room-card:last-child { margin-bottom: 0; }
        .room-card-quick-select { cursor: pointer; }
        .room-card-quick-select:active { transform: translateY(1px); }
        .room-card-selected {
          border-color: #de7a45;
          box-shadow: 0 0 0 1px rgba(222, 122, 69, 0.22);
        }
        .room-card-unavailable {
          opacity: 0.72;
          background: #faf8f4;
        }
        .recommend-box {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 14px;
          background: #fffdfa;
        }
        .recommend-title {
          font-size: 14px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .recommend-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .room-main {
          display: grid;
          grid-template-columns: 130px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .room-image-wrap {
          width: 130px;
          height: 98px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--line);
          background: #f7f4ef;
        }
        .room-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .room-image.placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--muted);
          font-size: 12px;
        }
        .room-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 5px;
        }
        .room-card .title { font-weight: 700; margin-bottom: 0; font-size: 16px; line-height: 1.3; }
        .room-status-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .room-status-chip.included {
          background: #2f9e69;
          border: 1px solid #2f9e69;
        }
        .room-status-chip.included-option {
          background: #f2f4f8;
          border: 1px solid #d8dde7;
          color: #5d687c;
        }
        .room-status-chip.upgrade {
          background: var(--accent);
          border: 1px solid var(--accent);
        }
        .room-status-chip.upgraded {
          background: #2f9e69;
          border: 1px solid #2f9e69;
        }
        .room-status-chip.selected {
          background: #2f9e69;
          border: 1px solid #2f9e69;
        }
        .room-status-chip.choose {
          background: var(--accent);
          border: 1px solid var(--accent);
        }
        .room-status-chip.fully-booked {
          background: #8f8a82;
          border: 1px solid #8f8a82;
          color: #fff;
        }
        .room-card .meta { margin-bottom: 12px; }
        .room-unavailable-note {
          color: #6f6960;
          font-weight: 600;
        }
        .availability-alert {
          margin: 0 0 12px;
          padding: 10px 12px;
          border: 1px solid #d8d2c7;
          border-radius: 10px;
          background: #f7f4ef;
          color: #4a433a;
          font-size: 13px;
        }
        .qty-block { max-width: 190px; }
        .stepper-wrap {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr) 38px;
          gap: 8px;
          align-items: center;
        }
        .stepper-wrap button {
          min-height: 38px;
          border-radius: 10px;
          font-size: 18px;
          line-height: 1;
          padding: 0;
          background: #ece7de;
          color: #3d352b;
        }
        .stepper-wrap button:hover:not(:disabled) { background: #e2dbcf; }
        .stepper-wrap input {
          min-height: 38px;
          text-align: center;
          font-weight: 600;
        }
        .addon-block {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px 16px;
          background: #fff;
          margin-bottom: 16px;
        }
        .enquiry-activity-preview {
          margin-top: 14px;
        }
        .addon-block:last-child {
          margin-bottom: 0;
        }
        .addon-block h4 {
          margin: 0 0 10px;
          font-size: 18px;
          line-height: 1.3;
        }
        .included-list {
          margin: 10px 0 0;
          padding-left: 20px;
          display: grid;
          gap: 7px;
          font-size: 14px;
          line-height: 1.4;
        }
        .check-line {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          font-size: 14px;
        }
        .bnb-single-pref-line {
          margin: 0 0 12px;
        }
        .check-line input[type='checkbox'] {
          width: 16px;
          min-height: 16px;
          height: 16px;
          flex-shrink: 0;
        }
        .check-line input[type='radio'] {
          width: 16px;
          min-height: 16px;
          height: 16px;
          accent-color: var(--accent);
          flex-shrink: 0;
        }
        .lesson-addon-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          max-width: 100%;
          margin-top: 8px;
          margin-bottom: 0;
          border: 1px solid #dec4ab;
          border-radius: 999px;
          padding: 5px 10px;
          background: #fff9f3;
          font-size: 12px;
          line-height: 1.2;
          color: #5a4633;
          cursor: pointer;
        }
        .lesson-addon-row {
          margin: 0 0 10px;
        }
        .lesson-addon-desc {
          margin: 6px 0 0 26px;
          font-size: 12px;
          line-height: 1.4;
          color: var(--muted);
        }
        .lesson-addon-toggle input[type='checkbox'] {
          width: 14px;
          min-height: 14px;
          height: 14px;
          margin: 0;
          accent-color: var(--accent);
        }
        .lesson-addon-toggle.included-fixed {
          border-color: #83c59a;
          background: #edf8f1;
          color: #1f5f37;
          cursor: default;
        }
        .lesson-addon-toggle.included-fixed input[type='checkbox'] {
          accent-color: #2f8f58;
          cursor: default;
        }
        .lesson-addon-text {
          display: inline-block;
          font-weight: 600;
          line-height: 1.2;
        }
        .surf-qualification-card {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fff;
          padding: 12px;
          margin-top: 10px;
          display: grid;
          gap: 12px;
        }
        .surf-qual-block {
          display: grid;
          gap: 8px;
        }
        .surf-qual-label {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }
        .surf-qual-label .muted {
          color: var(--muted);
          font-weight: 500;
        }
        .surf-choice-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .surf-choice-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          border: 1px solid #ded8ce;
          border-radius: 10px;
          padding: 8px 10px;
          background: #fff;
          cursor: pointer;
          margin-bottom: 0;
          font-size: 13px;
          line-height: 1.35;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .surf-choice-item:hover {
          border-color: #d0bca8;
        }
        .surf-choice-item.active {
          border-color: var(--accent);
          background: #fff7f2;
        }
        .surf-choice-item input[type='checkbox'] {
          width: 15px;
          min-height: 15px;
          height: 15px;
          margin-top: 1px;
          flex-shrink: 0;
          accent-color: var(--accent);
        }
        .surf-choice-item span {
          display: block;
          line-height: 1.35;
        }
        .transfer-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: start;
        }
        .transfer-type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, max-content));
          gap: 10px;
        }
        .transfer-type-option {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 40px;
          padding: 0 14px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          font-size: 13px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .transfer-type-option:hover { border-color: #ccc8bf; }
        .transfer-type-option.active {
          border-color: var(--accent);
          background: #fff7f2;
        }
        .transfer-type-option span {
          line-height: 1.25;
        }
        .transfer-vehicles-block label {
          display: block;
          margin-bottom: 6px;
        }
        .transfer-stepper {
          max-width: 220px;
        }
        .transfer-vehicles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, max-content));
          gap: 14px 18px;
          align-items: end;
        }
        .transfer-vehicles-cell label {
          font-size: 13px;
          color: var(--muted);
        }
        .transfer-multi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, max-content));
          gap: 10px;
        }
        .exp-item {
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          margin-bottom: 12px;
          cursor: pointer;
        }
        .exp-item input[type='checkbox'] {
          width: 16px;
          min-height: 16px;
          margin-top: 10px;
        }
        .exp-card {
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fff;
          overflow: hidden;
          display: grid;
          grid-template-columns: 100px minmax(0, 1fr);
          align-items: stretch;
          min-height: 88px;
          transition: box-shadow 0.15s ease;
        }
        .exp-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.04); }
        .enquiry-selected-card {
          margin-top: 8px;
          margin-bottom: 14px;
          border-color: #f0c7ad;
          background: #fffdfa;
        }
        .selected-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          border: 1px solid #2f9e69;
          background: #2f9e69;
          white-space: nowrap;
        }
        .retreat-card-select {
          cursor: pointer;
        }
        .retreat-card-select:active {
          transform: translateY(1px);
        }
        .retreat-card-select .exp-card {
          grid-template-columns: 140px minmax(0, 1fr);
          column-gap: 20px;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .retreat-card-select .exp-image-wrap {
          width: 140px;
          min-width: 140px;
        }
        .retreat-card-content {
          position: relative;
          padding-right: 46px;
        }
        .retreat-corner-icon {
          position: absolute;
          right: 12px;
          bottom: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          min-height: 24px;
        }
        .retreat-corner-icon-img {
          width: 22px;
          height: 22px;
          object-fit: contain;
          display: block;
        }
        .retreat-corner-icon-text {
          font-size: 14px;
          line-height: 1;
          color: #6b6359;
          font-weight: 700;
        }
        .retreat-card-select:hover .exp-card {
          border-color: #d4b79f;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
        }
        .retreat-card-selected .exp-card {
          border-color: #de7a45;
          box-shadow: 0 0 0 1px rgba(222, 122, 69, 0.22);
        }
        .retreat-choice-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          color: var(--accent);
          border: 1px solid #e4d8cb;
          background: #fff7f2;
          white-space: nowrap;
        }
        .retreat-choice-pill.selected {
          color: #fff;
          border-color: #2f9e69;
          background: #2f9e69;
        }
        .enquiry-activity-switch-title {
          margin: 14px 0 10px;
          font-size: 12px;
          font-weight: 600;
          color: #6b6359;
        }
        .enquiry-switch-list {
          margin-top: 8px;
          max-height: none;
          overflow: visible;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .exp-item.enquiry-switch-item {
          position: relative;
          grid-template-columns: minmax(0, 1fr);
          margin-bottom: 0;
          contain-intrinsic-size: 110px;
        }
        .exp-item.enquiry-switch-item input[type='checkbox'] {
          position: absolute;
          opacity: 0;
          pointer-events: none;
          width: 1px;
          height: 1px;
          margin: 0;
        }
        .exp-item.enquiry-switch-item .exp-card {
          min-height: 88px;
          border-color: #e4d8cb;
        }
        .exp-item.enquiry-switch-item:hover .exp-card {
          border-color: #d4b79f;
          box-shadow: 0 3px 10px rgba(0, 0, 0, 0.05);
        }
        .enquiry-switch-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
          border-radius: 999px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 700;
          color: #fff;
          border: 1px solid var(--accent);
          background: var(--accent);
          white-space: nowrap;
        }
        .exp-image-wrap {
          position: relative;
          width: 100px;
          min-height: 0;
          background: transparent;
          border-radius: 0;
          align-self: stretch;
          overflow: hidden;
        }
        .exp-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .exp-content {
          padding: 12px;
          min-width: 0;
        }
        .exp-title-row {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: baseline;
          margin-bottom: 5px;
        }
        .exp-title {
          font-weight: 700;
          font-size: 16px;
          line-height: 1.3;
        }
        .exp-price {
          font-size: 12px;
          color: var(--muted);
          white-space: nowrap;
        }
        .exp-meta-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 5px;
        }
        .exp-desc,
        .exp-note {
          margin: 0;
          font-size: 13px;
          line-height: 1.4;
        }
        .exp-note {
          color: var(--muted);
          margin-top: 4px;
        }
        .enquiry-selected-card .exp-meta-row {
          font-size: 13px;
          font-weight: 600;
          color: #6b6359;
        }
        .enquiry-selected-card .exp-desc {
          color: #423a30;
          margin-top: 2px;
        }
        .enquiry-switch-item .exp-meta-row {
          font-size: 12px;
          margin-bottom: 3px;
        }
        .experience-list {
          max-height: none;
          height: auto;
          overflow: visible;
          padding-right: 0;
        }
        .experience-list.retreat-selector-grid {
          max-height: none !important;
          overflow: visible !important;
          padding-right: 0;
        }
        .experience-list.enquiry-switch-list {
          max-height: none;
          height: auto;
          overflow: visible;
          padding-right: 0;
        }
        .transfer-yesno-grid {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .transfer-yesno-grid label {
          margin-bottom: 0;
        }
        .transfer-yesno-grid span {
          line-height: 1;
        }
        .transfer-yesno-option input[type='radio'] {
          margin: 0;
          min-height: 14px;
          width: 14px;
          height: 14px;
        }
        .transfer-yesno-option {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 36px;
          min-width: max-content;
          padding: 0 16px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #fff;
          font-size: 13px;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .transfer-yesno-option:hover { border-color: #ccc8bf; }
        .transfer-yesno-option.active {
          border-color: var(--accent);
          background: #fff7f2;
        }
        .transfer-group-line {
          margin-top: 12px;
        }
        .meta-icon-img {
          width: 14px;
          height: 14px;
          object-fit: contain;
          margin-right: 6px;
          vertical-align: -2px;
        }
        aside.panel {
          align-self: start;
          min-height: 220px;
          position: sticky;
          top: 20px;
        }
        .cart-empty {
          border: 1px dashed var(--line);
          border-radius: 14px;
          padding: 28px 18px;
          text-align: center;
          background: #fffdfa;
        }
        .cart-icon {
          font-size: 28px;
          margin-bottom: 10px;
        }
        .cart-title {
          font-weight: 700;
          margin-bottom: 6px;
          font-size: 15px;
        }
        .cart-list {
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
        }
        .surf-cart-list {
          border-radius: 14px;
          overflow: hidden;
        }
        .cart-meta-block {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          margin-bottom: 14px;
          background: #fff;
        }
        .cart-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          margin-bottom: 8px;
          gap: 12px;
        }
        .cart-meta-row:last-child { margin-bottom: 0; }
        .cart-meta-label {
          color: var(--muted);
          flex: 0 0 auto;
        }
        /* Multi-value rows in the Custom Retreat summary: label on the left,
           selected values stacked vertically on the right. */
        .cart-meta-row-multi {
          align-items: flex-start;
        }
        .cart-meta-list {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 4px;
          flex: 1 1 auto;
          min-width: 0;
          text-align: right;
        }
        .cart-meta-list-item {
          font-size: 13px;
          line-height: 1.35;
          color: var(--text);
          word-break: break-word;
        }
        .custom-retreat-enquiry-note {
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px dashed var(--line);
          border-radius: 12px;
          background: #fffdfa;
          text-align: left;
        }
        .custom-retreat-enquiry-note span {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.4;
          display: block;
        }
        .cart-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 14px;
          border-bottom: 1px solid var(--line);
          font-size: 14px;
          align-items: center;
          gap: 10px;
        }
        .cart-left { display: flex; align-items: center; gap: 10px; }
        .surf-cart-left {
          align-items: flex-start;
          width: 100%;
        }
        .surf-cart-content {
          min-width: 0;
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cart-item-title { font-weight: 700; font-size: 14px; line-height: 1.3; }
        .cart-row-price {
          font-weight: 600;
          color: #3d352b;
          white-space: normal;
          text-align: left;
          line-height: 1.3;
          max-width: none;
          font-size: 13px;
        }
        .cart-thumb-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--line);
          background: #f5f1e8;
          flex-shrink: 0;
        }
        .cart-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cart-thumb.placeholder { width: 100%; height: 100%; }
        .cart-row:last-child { border-bottom: none; }
        .cart-pricing-list {
          margin-top: 12px;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          background: #fff;
        }
        .cart-addon-block {
          margin-top: 12px;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          background: #fff;
        }
        .cart-section-title {
          margin-top: 14px;
          margin-bottom: 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted);
          font-weight: 600;
        }
        .cart-addon-title {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted);
          margin-bottom: 8px;
          font-weight: 600;
        }
        .cart-price-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin-bottom: 8px;
        }
        .cart-price-row:last-child { margin-bottom: 0; }
        .cart-total {
          margin-top: 12px;
          font-weight: 700;
          color: #3d352b;
          display: flex;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid var(--line);
          font-size: 15px;
        }
        .cart-total.muted {
          font-weight: 500;
          color: var(--muted);
          font-size: 13px;
          border-top: none;
          padding-top: 0;
        }
        .stay-flow-offer {
          border: 1px solid var(--line);
          background: #fff7ef;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 14px;
        }
        .stay-flow-offer-title {
          font-size: 17px;
          font-weight: 700;
          color: #3d352b;
          margin-bottom: 6px;
        }
        .stay-flow-offer-copy {
          margin: 0;
          color: #6b6359;
          font-size: 13px;
          line-height: 1.45;
        }
        .stay-flow-offer-actions {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          flex-wrap: nowrap;
          align-items: center;
        }
        .stay-flow-offer-actions .offer-primary {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
        }
        .stay-flow-offer-actions .offer-secondary {
          background: #fff;
          border-color: var(--line);
          color: #3d352b;
        }
        .stay-flow-offer-actions button {
          width: auto;
          min-width: 0;
          min-height: 36px;
          padding: 0 12px;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          flex: 0 0 auto;
        }
        .loading-overlay {
          position: absolute;
          inset: 0;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(3px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 20;
          border-radius: 16px;
          pointer-events: all;
        }
        .loading-overlay.hidden {
          display: none;
        }
        .loading-spinner {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px solid #eadfce;
          border-top-color: var(--accent);
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 920px) {
          .grid { grid-template-columns: 1fr; }
          .row { grid-template-columns: 1fr; }
          .room-main { grid-template-columns: 1fr; }
          .room-image-wrap { width: 100%; height: 180px; }
          .transfer-layout { grid-template-columns: 1fr; }
          .transfer-type-grid,
          .transfer-multi-grid,
          .transfer-vehicles-grid { grid-template-columns: 1fr; }
          .exp-card {
            grid-template-columns: 1fr;
            min-height: 0;
          }
          .retreat-card-select .exp-card {
            grid-template-columns: 1fr;
            column-gap: 0;
          }
          .exp-image-wrap {
            width: 100%;
            height: 180px;
            min-height: 180px;
            border-right: none;
            border-bottom: 1px solid #efe6d8;
          }
          .retreat-card-select .exp-image-wrap {
            width: 100%;
            min-width: 0;
            height: 180px;
            min-height: 180px;
          }
          .exp-content { padding: 12px; }
          .retreat-card-content { padding-right: 44px; }
          .guest-card-head { flex-wrap: wrap; }
          aside.panel { position: static; }
          .panel { padding: 16px; }
          .step-card { padding: 14px; }
          .flow-head { padding: 14px; }
        }
        @media (max-width: 480px) {
          .chips { gap: 6px; }
          .chip { padding: 6px 10px; font-size: 12px; }
          .flow-title { font-size: 20px; }
          h3 { font-size: 18px; }
          .grid { gap: 16px; }
          .panel { padding: 14px; }
          .step-card { padding: 12px; margin-bottom: 14px; }
          .room-card { padding: 12px; }
          .addon-block { padding: 12px; }
          .guest-card { padding: 12px; }
          .stepper-wrap { grid-template-columns: 34px minmax(0, 1fr) 34px; }
          .stepper-wrap button { min-height: 34px; }
          .stepper-wrap input { min-height: 34px; }
        }
      </style>

      <div class="grid">
        <section class="panel">
          <section class="flow-head">
            <h2 class="flow-title">${flowMeta.title}</h2>
            ${flowMeta.subtitle ? `<p class="flow-subtitle">${flowMeta.subtitle}</p>` : ''}
          </section>
          <div class="chips">${this.renderStepChips(steps, currentStep)}</div>
          ${variant === 'stay' ? this.renderStayStep1(currentStep) : ''}
          ${variant === 'package' ? this.renderPackageStep1(currentStep) : ''}
          ${variant === 'stay' || variant === 'package' ? this.renderStayStep2(currentStep) : ''}
          ${this.renderOtherSteps(currentStep, variant)}
        </section>
        <aside class="panel">
          <h3>Cart</h3>
          ${this.renderCartSummary()}
        </aside>
      </div>
      <div class="loading-overlay ${this.isUiBusy() ? '' : 'hidden'}">
        <div class="loading-spinner" aria-label="Loading"></div>
      </div>
    `;
    this.hideSelectPlaceholdersOnOpen();
    this.bindDatePickerInstances();
    this.hydrateLazyExperienceImages();
    this.restoreScrollState();
  }
}

// Post-class static assignment instead of in-class public field syntax
// (the latter is valid ES2022 but not understood by the Velo editor's parser).
BookingWizardElement.SURF_ACTIVITY_KEYS = new Set([
  'surf-lesson-beginner',
  'surf-lesson-intermediate',
  'surf-guiding',
  'surf-extended-experience',
]);

if (!customElements.get('booking-wizard-ce')) {
  customElements.define('booking-wizard-ce', BookingWizardElement);
}
