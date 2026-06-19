# Implementation milestones

## Done (M0–M2)
- [x] Repo scaffold, GitHub Pages from `/docs`
- [x] Custom elements (booking + 4 admin CEs)
- [x] Fixture pipeline + `demoStore`
- [x] Wix shims + ported availability/addons APIs
- [x] Demo checkout + booking host bridge
- [x] **ESM import fix** — guest host loads in browser
- [x] **Demo fixtures** — future package sessions, seed bookings/enquiries
- [x] **Sample URL links** on landing + booking hint banner
- [x] **Availability fallback** for portfolio walkthroughs

## Done (M3) — admin dashboards
- [x] Stay bookings — `adminStayHost.js` + seed data
- [x] Package sessions — `adminSessionsHost.js`
- [x] Retreat sessions — `adminRetreatsHost.js`
- [x] Availability grid — `adminAvailabilityHost.js`

## Next (M4) — portfolio polish
- [ ] Browser QA all 9 flows on live Pages (post-push)
- [ ] README screenshots/GIF
- [ ] Client name in copy (when confirmed)
- [ ] Prod CMS CSV merge into fixtures

## Local test

```bash
cd wix-studio-booking-demo
npm run fixtures
npx serve docs
```

| Flow | Sample URL |
|------|------------|
| B&B | `booking.html?flow=bnb&checkIn=2026-07-01&checkOut=2026-07-05&guests=2` |
| Beach Reset | `booking.html?flow=package_beach_reset&sessionId=sess_BeachReset_jul` |
| Activity enquiry | `booking.html?flow=enquiry&activityKey=sandboarding` |
| Dihya retreat | `booking.html?flow=retreat_dihya&retreatSessionId=rt_sess_2026_09_20_dihya` |

Reset session: `&reset=1`
