# Handoff: The Fertility House demo

Status as of Nov 20, 2026. Read this before continuing the project.

## Who and what

- **Owner:** Joe, building this as a demo for his sister **Jamie Hainlen, MSN, FNP-C**. She runs The Fertility House (surrogate medical-record reviews) and wants a peptide / GLP-1 wellness business under it.
- **Goal:** show Jamie what's possible: a modern site, shop, CRM and phone app. It's a **demo with fake data**. No real payments, no real patients.
- **Joe's preferences:** short, direct answers. He reviews visually, so send screenshots or links. He's not technical; give click-by-click or copy-paste steps.

## Live links

| What | URL |
|---|---|
| The Fertility House (rebuild of her Wix site) | https://fertility-house-demo.netlify.app/ |
| The Wellness House shop | https://fertility-house-demo.netlify.app/wellness/ |
| Checkout | https://fertility-house-demo.netlify.app/wellness/checkout.html |
| Admin CRM (no login in demo mode) | https://fertility-house-demo.netlify.app/admin/ |
| Stackr app (phone-first, installable) | https://fertility-house-demo.netlify.app/stackr/ |
| Original Wix site | https://www.thefertilityhouse.com/ |

## Accounts and hosting

- **GitHub:** `joeyride61/thefertilityhouse` (private), branch `main`.
- **Netlify:** project `fertility-house-demo`, site ID `aa5db061-0fe9-48c5-92ac-dbaf64b50a23`, team "Doug Wetton Properties".
- **GitHub → Netlify auto-deploy is linked.** Every push to `main` deploys to production.
- **Netlify Database** (Postgres) is provisioned automatically from `netlify/database/migrations/` on deploy.
- **Environment variables** (Netlify, production context, functions scope): `ADMIN_PASSWORD`, `ADMIN_SECRET`. The admin password was given to Joe in chat; don't commit it. `ADMIN_LOGIN=on` re-enables the admin login (off = open demo). Stripe keys are not set, so checkout runs in **test/demo mode**.

## Repo layout

```
public/                      static site (Netlify publish dir)
  index.html, styles.css     The Fertility House rebuild (Wix copy, same look)
  disclaimer.html            her legal disclaimer
  images/                    original photos from her Wix site
  wellness/index.html        Wellness House shop (scroll-pinned story + science, tabs, product drawer,
                             pens, mixing guide + dose calculator, bundles, Stackr promo, FAQ, contact modal)
  wellness/cart.js           cart + stacking discount UI (localStorage)
  wellness/checkout.html     checkout; Stripe Payment Element when keys exist, demo mode otherwise
  wellness/img/              3D-rendered vials, pens, bundles, hero (webp)
  admin/index.html           CRM: dashboard, orders (approve/ship/cancel), members, products & pricing
  stackr/                    Stackr PWA (index.html, manifest, sw.js, icons)
netlify/functions/
  storefront.mjs             /api/catalog, /api/checkout, /api/stripe/webhook
  admin.mjs                  /api/admin/*
  stackr.mjs                 /api/stackr/*
netlify/lib/
  shared.mjs                 DB client, stacking-discount pricing, admin session, Stripe keys
  stackr.mjs                 product defaults + Will Hainlen demo seed (relative to today)
netlify/database/migrations/ schema, 26 sample members / 93 sample orders, Stackr tables
tools/vial-renders/          three.js scene that renders the vial/pen product photos (see below)
tools/seed_sample_data.py    generator for the sample-data migration
```

## Business rules built in

- **Stacking discount:** every item takes 10% off per additional item, capped at 30% (2 items = 10% each, 3 = 20%, 4+ = 30%). Server recomputes on every order (`priceCart` in `netlify/lib/shared.mjs`).
- **Payment flow:** card is authorized at checkout (Stripe `capture_method: manual`), charged when Jamie clicks **Approve** in the CRM, voided/refunded on decline/cancel.
- **Order statuses:** pending_review → approved → shipped → delivered (or cancelled).
- **Products and prices** live in the `products` table, editable in the CRM. Costs and market ranges are **estimates**; replace with real pharmacy quotes.
- Catalog: semaglutide, tirzepatide, sema/tirz pens, Lipo-MIC + B12, NAD+, glutathione, sermorelin, tesamorelin, PT-141. **BPC-157 and TB-500 are intentionally not sold** (not FDA-approved). Users can still track them in Stackr.
- Regulatory note already flagged to Joe: compounded GLP-1 copies are restricted since the shortages ended; confirm with a pharmacy before selling for real.

## Stackr (dose tracker app)

- Free with any purchase. Demo user is **Will Hainlen** (fictional): tirzepatide linked to two Wellness House orders, plus BPC-157 he added himself on Mon/Wed/Fri.
- Key features: pick **exact injection weekdays** (Joe's main complaint about other apps is that they guess the days), units to draw on a U-100 syringe, injection-site rotation, 28-day mixed-vial warning, run-out forecast, "reorder by" date (6-day lead time), one-tap reorder of the next batch with the stacking discount, order tracking, "Add to my stack" after delivery, add any peptide.
- **Demo helpers:** "Reset" (top right) rebuilds Will's data relative to today; "Demo: approve / ship / deliver" links skip the shipping wait. Will's orders also show in the CRM.
- Sized for iPhone (17pt body, 44pt+ tap targets, system font, safe areas). On desktop it shows inside a phone frame with an explainer.

## Product photo renders

The vial and pen images are 3D renders, not stock photos. To regenerate (e.g. new product or label change):

```bash
cd tools/vial-renders
npm init -y && npm i three@0.169.0
node run.js jobs.json      # product shots, hero, bundles
node run.js jobs2.json     # pens + hero
```

Product names, doses and label colors are in `PRODUCTS` / `PENS` in `render.html`. Outputs go to `out/` as PNG; convert to webp into `public/wellness/img/`. Requires Playwright with Chromium.

## Still to do (Joe's queue)

1. **Fertility House redesign:** modern, clean version with the same vibe and content (current page is a faithful Wix copy). Joe wants it "very cool," not a template.
2. **Grip socks product:** pink, light compression, rubber grip dots shaped like sperm and eggs on the sole. Joe has AI images of them (shared in chat only; ask him to upload the files). Needs a product page and research into custom grip-sock manufacturers.
3. **Pricing summary:** a one-page market-rate vs. pharmacy-cost table (estimates are already in the CRM products page).
4. **Later:** real logins (admin + per-user Stackr accounts), real Stripe keys, HIPAA review before any real patient data.

## Known leftovers

- One test order, **WH-10094 "Test Checkout,"** from the end-to-end test is in the CRM as "Needs review." Cancel or leave it.
- The admin is open to anyone with the link while in demo mode. It holds only sample data.
