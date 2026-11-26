# Flights Kenya

**Affordable flights for every Kenyan.**

Flights Kenya compares fares on domestic routes from Nairobi's JKIA and
Wilson airports. The project is operated by Kodovozlabs.

## How it works

- The static PWA is served from `public/`.
- TypeScript Vercel Functions serve the API and write fare batches to Neon
  Postgres.
- A Python ETL job runs from GitHub Actions every six hours. It fetches
  configured JSON feeds, validates and normalizes fares, then securely sends
  future-dated fares to the API without an upper date limit. It also reads
  publicly listed offers from Skyward Airlines' special-offers page and
  displays them separately from date-specific fares.
- Search can optionally filter date-specific fares to a departure date in
  Kenya time. Leaving the date blank shows all upcoming fares.
- Fare comparisons are sorted by price, with the cheapest result highlighted.
  Each bookable fare includes a direct provider link from its feed.
- Public airline starting prices are indicative, not date-specific quotes.
  They are labeled separately, link to the original offer and booking page,
  and require confirmation with the airline. A promotion is only displayed
  when it is listed by the airline; Flights Kenya does not invent discount
  percentages.
- Browser push alerts are optional and require user consent.
- The homepage uses Pixabay's "Airplane, flying, holiday" stock video by
  Matthias_Groeneveld under the
  [Pixabay Content License](https://pixabay.com/service/license-summary/).

## Fare feeds

Optionally add authorized HTTPS JSON feed URLs to the GitHub Actions
`FEED_URLS` secret as a comma-separated list. Each endpoint must return a
`fares` array with a valid HTTPS `booking_url` for every date-specific fare:

```json
{
  "fares": [
    {
      "origin": "NBO",
      "destination": "MBA",
      "carrier": "Example Air",
      "departure": "2026-12-01T09:30:00+03:00",
      "price_kes": 8500,
      "booking_url": "https://airline.example/book?flight=123"
    }
  ]
}
```

The example URL is a placeholder, not a real booking page. Available
locations are NBO, WIL, MBA, UKA, MYD, KIS, and EDL; fares appear only for
routes included in configured feeds. No airline sources are preconfigured.
The collector reads JSON endpoints; it does not bypass login, CAPTCHA, or
anti-bot controls. Provider-specific HTML scraping requires an approved
source and a site-specific adapter. The collector can only process the dates
supplied by each configured feed; it filters out fares whose departure time
has passed and does not impose a maximum advance-booking date.

## Deploy to Vercel

1. Create a Neon Postgres database and copy its connection string.
2. Import this repository into Vercel. Use the repository root and `main` as
   the production branch. Static files are in `public/`; API handlers are in
   `api/`.
3. Configure these Vercel environment variables:

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Neon Postgres connection string |
   | `COLLECTOR_SECRET` | Long random secret for authenticated fare ingestion |
   | `VAPID_PUBLIC_KEY` | Base64url Web Push public key |
   | `VAPID_PRIVATE_KEY` | Base64url Web Push private key |
   | `VAPID_SUBJECT` | Contact URL, e.g. `mailto:info@kodovozlabs.co.ke` |

   Generate the collector secret with `openssl rand -hex 32`. Generate VAPID
   keys with:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Keep the VAPID private key and collector secret out of source control.
4. Install dependencies, link the project, pull local environment variables,
   and apply every SQL migration:

   ```sh
   npm ci
   npx vercel login
   npx vercel link
   npx vercel env pull .env.local
   npm run db:migrate
   ```

5. Add these repository secrets in GitHub **Settings → Secrets and variables
   → Actions**:

   | Secret | Value |
   | --- | --- |
   | `VERCEL_APP_URL` | Deployed site origin, without a trailing slash |
   | `COLLECTOR_SECRET` | Same value configured in Vercel |
   | `FEED_URLS` | Optional comma-separated authorized HTTPS JSON feed URLs |

   The workflow at `.github/workflows/collect.yml` runs every six hours and
   can also be started manually. GitHub Actions schedules are best-effort and
   may be delayed.
6. Deploy from Vercel. Web Push requires HTTPS, which Vercel provides on
   deployed domains.

Vercel and Neon free-plan quotas and terms can change. Check their current
limits before relying on continuous public service.

## Local development

Use Node.js 22.18 or later:

```sh
npm ci
npx vercel dev
```

Pull local environment variables with `npx vercel env pull .env.local`. Run
`npm run db:migrate` after setting up the database.

The Python collector requires Python 3.12+ and `certifi` for verified HTTPS.
Install its dependency and run it manually with `VERCEL_APP_URL`,
`COLLECTOR_SECRET`, and optional `FEED_URLS` set in the environment:

```sh
python3 -m pip install -r scripts/requirements.txt
python3 scripts/collect.py
```

## API

- `GET /api/health`
- `GET /api/routes`
- `GET /api/fares?origin=NBO&destination=MBA` (sorted cheapest first)
- `GET /api/offers?origin=NBO&destination=MBA` (recent public offers; Nairobi
  offers without a specified airport can appear for NBO and WIL)
- `GET /api/vapid-public-key`
- `POST /api/subscriptions`
- `DELETE /api/subscriptions`
- `POST /api/collect` (authenticated Python fare-batch ingestion)
- `POST /api/offers` (authenticated public-offer ingestion)

## Privacy and support

Read the [Flights Kenya Privacy Policy](./public/privacy.html). It describes
the service's data handling with reference to Kenya's Data Protection Act,
2019 (No. 24 of 2019), and applicable regulations. For support or privacy
requests, email [info@kodovozlabs.co.ke](mailto:info@kodovozlabs.co.ke).

© 2026 Kodovozlabs. All rights reserved.
