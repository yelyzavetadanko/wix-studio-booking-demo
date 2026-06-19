# Implementation milestones

## Done (M0–M1)
- [x] Repo scaffold `wix-studio-booking-demo/`
- [x] Public GitHub repo + Pages workflow
- [x] Landing + flow links
- [x] Custom elements copied (booking + 4 admin CEs)
- [x] `csv-to-fixtures.mjs` + baseline JSON from seed CSV
- [x] `demoStore` (fixtures + sessionStorage mutations)
- [x] Wix shims: `$w`, `wixLocation`, `wixData`, `webMethod`, meta pixel no-op
- [x] Ported core backend modules + `bookingAvailability` / `bookingAddons` API
- [x] Demo checkout (`bookingCheckout.demo.js`) — local save only
- [x] Booking page bridge (`bookingPage.js` ported from production)
- [x] `booking.html` bootstrap

## In progress (M2)
- [x] `wixData` shim: pagination + `gt`/`lt` filters for availability module
- [ ] Browser QA each flow; fix runtime/import issues
- [ ] Port remaining checkout logic if demo responses miss fields CE expects
- [ ] Theme/assets polish

## Next (M3) — admin dashboards
- [ ] Port `page-admin-stays.js` → `adminStayHost.js`
- [ ] Port `page-admin-sessions.js`, retreats, availability hosts
- [ ] Wire admin API to demoStore

## Next (M4) — portfolio polish
- [ ] README screenshots/GIF
- [ ] Client name in copy (when confirmed)
- [ ] Prod CMS CSV merge into fixtures

## Local test

```bash
cd wix-studio-booking-demo
npm run fixtures
npx serve demo
```

Open `http://localhost:3000/booking.html?flow=bnb`

Reset session data: add `&reset=1` to URL.
