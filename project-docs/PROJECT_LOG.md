# Project progress log

## 2026-06-19 (session 2) — Unblock guest flows + admin demo data

### Fixed — guest wizard step 1 blocker ✅
- **Root cause:** broken ESM imports in `docs/js/runtime/core/*.js` (missing `.js` extension) — browser could not load `bookingPage.js` host
- Patched imports in: `availability.js`, `stayAllocations.js`, `roomCombinations.js`, `packageValidation.js`, `packageRules.js`, `lineItems.js`, `inventoryHelpers.js`, `bookingCheckout.js`
- Added **demo availability fallback** in `bookingAvailability.js` when real calc returns 0 slots (portfolio safety net)
- **URL prefill:** `checkIn`, `checkOut`, `guests`, `sessionId`, `retreatSessionId` via `readContext()` + initial `state-json`
- Landing + `booking.html` hint banner with sample-date links

### Fixed — fixtures & seed data ✅
- `package-sessions.json` — future sessions (Jul–Aug 2026) with stable IDs for deep links
- `bookings.json` — 9 demo stay/package/retreat bookings (mixed statuses)
- `enquiries.json` — 5 demo enquiries (activity, surf, custom retreat, package)
- `demoStore` — empty sessionStorage arrays no longer wipe fixture seed
- `scripts/seed-demo-data.mjs` + `npm run seed`

### Admin dashboards ✅
- `adminSessions.demo.js` + `adminSessionsHost.js` + `bootstrapAdminSessions.js` + `admin/sessions.html`
- `adminRetreats.demo.js` + `adminRetreatsHost.js` + `bootstrapAdminRetreats.js` + `admin/retreats.html`
- `adminAvailability.demo.js` + `inventoryUnitRegistry.js` + `adminAvailabilityHost.js` + `admin/availability.html`
- Stays admin was already wired; now shows seed bookings/enquiries

### QA checklist (manual — live Pages after push)
- [ ] All 9 guest flows: step 1 → success screen
- [ ] Admin stays / sessions / retreats / availability render with seed data
- [ ] `?reset=1` clears session mutations

---

## 2026-06-19 (session 1)

### M0–M1 — Scaffold & data layer ✅
- Created `wix-studio-booking-demo/` with GitHub Pages deploy from `/docs`
- Copied production custom elements (booking + 4 admin CEs)
- Built fixture pipeline: `seed-csv/` → `npm run fixtures` → `docs/fixtures/*.json`
- Implemented `demoStore` (fixtures + sessionStorage for demo mutations)
- Wix shims: `$w`, `wixLocationFrontend`, `wixData`, `webMethod`, Meta pixel no-op
- Ported core backend modules + `bookingAvailability` / `bookingAddons` API
- Demo checkout (`bookingCheckout.demo.js`) — local session save only
- Ported full booking host bridge from `page-booking-packages.js`
- Landing page with links to all 9 guest flows

### M2 — Runtime hardening ✅
- Fixed `wixData` query shim: `gt`/`lt` filters + pagination shape
- Restructured publish folder: site in `/docs` for GitHub Pages legacy deploy
- **Fixed ESM imports** (see session 2 above)

### GitHub
- Public repo: https://github.com/yelyzavetadanko/wix-studio-booking-demo
- Live URL: https://yelyzavetadanko.github.io/wix-studio-booking-demo/

### M4 — Portfolio polish (pending)
- README screenshots/GIF
- Client name in copy (when confirmed)

---

## Commands

```bash
cd wix-studio-booking-demo
npm run fixtures
npm run seed
npx serve docs
```

Open `http://localhost:3000/booking.html?flow=bnb&checkIn=2026-07-01&checkOut=2026-07-05&guests=2`

Reset browser session: append `&reset=1` to any booking URL.
