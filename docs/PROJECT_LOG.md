# Project progress log

## 2026-06-19

### M0–M1 — Scaffold & data layer ✅
- Created `wix-studio-booking-demo/` with GitHub Pages deploy from `/demo`
- Copied production custom elements (booking + 4 admin CEs)
- Built fixture pipeline: `seed-csv/` → `npm run fixtures` → `demo/fixtures/*.json`
- Implemented `demoStore` (fixtures + sessionStorage for demo mutations)
- Wix shims: `$w`, `wixLocationFrontend`, `wixData`, `webMethod`, Meta pixel no-op
- Ported core backend modules + `bookingAvailability` / `bookingAddons` API
- Demo checkout (`bookingCheckout.demo.js`) — local session save only
- Ported full booking host bridge from `page-booking-packages.js`
- Landing page with links to all 9 guest flows

### M2 — Runtime hardening (in progress)
- Fixed `wixData` query shim: `gt`/`lt` filters + pagination shape (`hasNext`/`next`) for ported `availability.js`
- Next: browser QA per flow, fix response-shape gaps, theme polish

### M3 — Admin dashboards (pending)
- Admin HTML stubs created; host bridges not wired yet
- Planned: `adminStayHost`, `adminSessionsHost`, `adminRetreatsHost`, `adminAvailabilityHost`

### M4 — Portfolio polish (pending)
- README live URL after Pages deploy
- Screenshots / GIF for Upwork

---

## Repository

- **GitHub:** https://github.com/yelyzavetadanko/wix-studio-booking-demo
- **Pages URL (after first deploy):** https://yelyzavetadanko.github.io/wix-studio-booking-demo/

## Blockers / needs from client

- [ ] Confirm client name for public README (or keep generic “surf hospitality client”)
- [ ] Optional: fresh Wix CMS CSV exports → `seed-csv/` → `npm run fixtures`

## Commands

```bash
cd wix-studio-booking-demo
npm run fixtures
npx serve demo
```
