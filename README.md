# Wix Studio Booking Platform — Interactive Portfolio Demo

Live demo: **[yelyzavetadanko.github.io/wix-studio-booking-demo](https://yelyzavetadanko.github.io/wix-studio-booking-demo/)** (GitHub Pages, deploys from `/demo` on push to `main`)

Repository: **[github.com/yelyzavetadanko/wix-studio-booking-demo](https://github.com/yelyzavetadanko/wix-studio-booking-demo)**

Custom booking system built for a **surf hospitality client on Wix Studio**: multi-flow guest wizard, pricing/availability rules, and internal admin dashboards. This repository showcases the **same Custom Element UI** used in production, running in the browser with a **mock runtime** instead of Wix Velo/CMS.

> **Demo disclaimer:** No production data is written. Submissions persist in `sessionStorage` for the current browser session only.

## What's included

### Guest booking (`booking-wizard-ce`)
- Flows: `bnb`, `surf_stay`, package flows, `enquiry`, `retreats`, retreat variants
- Shadow DOM UI, design tokens, multi-step wizard + cart
- Availability & pricing driven by fixture data (CMS export)

### Admin dashboards (in progress)
- `stay-manager-ce` — stay bookings & enquiries
- `session-manager-ce` — package sessions
- `retreat-session-manager-ce` — retreat sessions
- `availability-manager-ce` — inventory calendar

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
npm run fixtures          # regenerate demo/fixtures from seed-csv/
npx serve demo            # open http://localhost:3000
```

Open:
- Landing: `/`
- Booking: `/booking.html?flow=bnb`
- Reset demo data: `/booking.html?flow=bnb&reset=1`

## Regenerating fixtures

1. Export Wix CMS collections to CSV
2. Place files in `seed-csv/` (see `docs/data-sources.md`)
3. Run `npm run fixtures`

## Deploy to GitHub Pages

1. Create public repo and push this folder
2. **Settings → Pages → Build and deployment → Deploy from branch**
3. Branch: `main`, folder: `/demo`
4. Site URL: `https://<user>.github.io/<repo>/`

## Author

**Yelyzaveta Danko** — Wix Studio & Velo developer  
Custom apps, integrations, booking systems, admin tools.

## License

Portfolio demonstration code. Client-specific branding/data used with permission.
