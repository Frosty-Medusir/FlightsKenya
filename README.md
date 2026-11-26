# Flights Kenya

**Affordable flights for every Kenyan.**

Flights Kenya compares fares on domestic routes from Nairobi's JKIA and
Wilson airports. The project is operated by Kodovozlabs.

## How it works

- The static PWA is served from `public/`.
- TypeScript Vercel Functions provide the API and collector.
- Neon Postgres stores fare observations and opted-in push subscriptions.
- GitHub Actions triggers fare collection every six hours.

Fare observations are validated and deduplicated. Route comparisons use a
rolling 60-day median. Browser push alerts are optional and require user
consent.

## Fare feeds

Add authorized JSON feed URLs to the Vercel `FEED_URLS` environment variable
as a comma-separated list. Each endpoint must return a `fares` array:

```json
{
  "fares": [
    {
      "origin": "NBO",
      "destination": "MBA",
      "carrier": "Example Air",
      "departure": "2026-12-01T09:30:00+03:00",
      "price_kes": 8500
    }
  ]
}
```

Supported routes are NBO/WIL to MBA, UKA, MYD, KIS, and EDL. Configure only
feed endpoints you are authorized to access.

## Deploy to Vercel

1. Import this repository into Vercel. The frontend is served from `public/`;
   API handlers are in `api/`.
2. Create a Neon Postgres database.
3. Configure these Vercel environment variables:

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Neon Postgres connection string |
   | `FEED_URLS` | Comma-separated authorized JSON fare feed URLs |
   | `COLLECTOR_SECRET` | Long random secret for the scheduled collector |
   | `VAPID_PUBLIC_KEY` | Base64url Web Push public key |
   | `VAPID_PRIVATE_KEY` | Base64url Web Push private key |
   | `VAPID_SUBJECT` | Contact URL, e.g. `mailto:info@kodovozlabs.co.ke` |

   Generate the collector secret with `openssl rand -hex 32`. Generate VAPID
   keys with:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Keep the VAPID private key and collector secret out of source control.
4. On your computer, install dependencies and link the Vercel project:

   ```sh
   npm install
   npx vercel link
   npx vercel env pull .env.local
   npm run db:migrate
   ```

5. Add these repository secrets in GitHub **Settings → Secrets and variables
   → Actions**:

   | Secret | Value |
   | --- | --- |
   | `VERCEL_APP_URL` | Deployed site origin, without a trailing slash |
   | `COLLECTOR_SECRET` | The same value configured in Vercel |

   The workflow at `.github/workflows/collect.yml` runs every six hours and
   can also be started manually. GitHub Actions schedules are best-effort and
   may be delayed.
6. Redeploy after configuring environment variables and applying the
   migration. Web Push requires HTTPS; Vercel provides it on deployed
   domains.

Vercel and Neon free-plan quotas and terms can change. Check their current
limits before relying on continuous public service.

## Local development

Use Node.js 22.18 or later:

```sh
npm install
npx vercel dev
```

Pull local environment variables with `npx vercel env pull .env.local`. Run
`npm run db:migrate` after setting up the database.

## API

- `GET /api/health`
- `GET /api/routes`
- `GET /api/fares?origin=NBO&destination=MBA`
- `GET /api/vapid-public-key`
- `POST /api/subscriptions`
- `DELETE /api/subscriptions`
- `POST /api/collect` (requires `Authorization: Bearer $COLLECTOR_SECRET`)

## Privacy and support

Read the [Flights Kenya Privacy Policy](./public/privacy.html). It describes
the service's data handling with reference to Kenya's Data Protection Act,
2019 (No. 24 of 2019), and applicable regulations. For support or privacy
requests, email [info@kodovozlabs.co.ke](mailto:info@kodovozlabs.co.ke).

© 2026 Kodovozlabs. All rights reserved.
