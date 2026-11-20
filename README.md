# The Fertility House + The Wellness House

Demo site for The Fertility House, its Wellness House peptide shop, the practice CRM and the Stackr dose-tracker app. Hosted on Netlify; every push to `main` deploys.

| Path | What it is |
|---|---|
| `public/` | Static site (published directory) |
| `public/wellness/` | Wellness House shop, cart (`cart.js`) and checkout |
| `public/admin/` | Practice CRM: orders, members, products and pricing |
| `public/stackr/` | Stackr PWA (installable on iPhone) |
| `netlify/functions/` | API: storefront + checkout, admin, Stackr |
| `netlify/lib/` | Shared pricing, auth and Stackr demo data |
| `netlify/database/migrations/` | Netlify Database schema and sample data |

## Settings (Netlify environment variables)

- `ADMIN_LOGIN=on` turns on the admin password (`ADMIN_PASSWORD`, `ADMIN_SECRET`). Off by default for the demo.
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` switch checkout from test mode to real payments. Webhook URL: `/api/stripe/webhook`.

## Pricing rule

Stacking discount: each item in a plan takes 10% off for every additional item, capped at 30% (`netlify/lib/shared.mjs`).

All members, orders and the Stackr user Will Hainlen are fictional sample data.
