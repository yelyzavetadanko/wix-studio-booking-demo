# Wix Studio Booking Platform — Interactive Portfolio Demo

**Live demo:** [yelyzavetadanko.github.io/wix-studio-booking-demo](https://yelyzavetadanko.github.io/wix-studio-booking-demo/)  
**Repository:** [github.com/yelyzavetadanko/wix-studio-booking-demo](https://github.com/yelyzavetadanko/wix-studio-booking-demo)  
**Progress log:** [`project-docs/PROJECT_LOG.md`](project-docs/PROJECT_LOG.md)

Custom booking system built for a **surf hospitality client on Wix Studio**: multi-flow guest wizard, pricing/availability rules, and internal admin dashboards. This repository showcases the **same Custom Element UI** used in production, running in the browser with a **mock runtime** instead of Wix Velo/CMS.

> **Demo disclaimer:** No production data is written. Submissions persist in `sessionStorage` for the current browser session only.

## Quick links

| Demo | URL |
|------|-----|
| Landing | [/](https://yelyzavetadanko.github.io/wix-studio-booking-demo/) |
| B&B (sample dates) | [/booking.html?flow=bnb&checkIn=2026-07-01&checkOut=2026-07-05&guests=2](https://yelyzavetadanko.github.io/wix-studio-booking-demo/booking.html?flow=bnb&checkIn=2026-07-01&checkOut=2026-07-05&guests=2) |
| Admin stays | [/admin/stays.html?reset=1](https://yelyzavetadanko.github.io/wix-studio-booking-demo/admin/stays.html?reset=1) |
| Admin availability | [/admin/availability.html?month=2026-07&reset=1](https://yelyzavetadanko.github.io/wix-studio-booking-demo/admin/availability.html?month=2026-07&reset=1) |

Append `&reset=1` to clear browser session mutations and reload seed data.

## What's included

### Guest booking (`booking-wizard-ce`)
- Flows: `bnb`, `surf_stay`, package flows, `enquiry`, `retreats`, retreat variants
- Shadow DOM UI, design tokens, multi-step wizard + cart
- Availability & pricing driven by fixture data (CMS-shaped JSON)

### Admin dashboards
- `stay-manager-ce` — stay bookings & enquiries
- `session-manager-ce` — package sessions
- `retreat-session-manager-ce` — retreat sessions
- `availability-manager-ce` — inventory calendar (open / closed / hold modals)

## Architecture

```
Custom Element (UI)
    ↕ attributes + CustomEvents
Demo host bridge (ported from page-booking-packages.js)
    ↕ async API calls
Browser runtime (wixData shim + ported backend logic)
    ↕ read/write
Fixtures JSON (+ sessionStorage mutations)
```

## Local development

```bash
npm run fixtures          # regenerate docs/fixtures from seed-csv/
npx serve docs            # open http://localhost:3000
```

## Deploy to GitHub Pages

1. Push to `main`
2. **Settings → Pages → Deploy from branch**
3. Branch: `main`, folder: **`/docs`**

## Author

**Yelyzaveta Danko** — Wix Studio & Velo developer  
Custom apps, integrations, booking systems, admin tools.

## License

Portfolio demonstration code. Client-specific branding/data used with permission.
