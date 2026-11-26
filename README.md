# Kenya Flight Watch

A Vercel-hosted fare tracker for Kenyan domestic routes. The static PWA is
served from `public/`; TypeScript Vercel Functions provide the API; Neon
Postgres stores fares and push subscriptions.

## Fare feeds

No airline endpoints are assumed. Add feed URLs you are authorized to use to
the Vercel `FEED_URLS` environment variable (comma-separated). Each endpoint
must return:

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

Items are validated and deduplicated. Route medians use fares recorded in the
last 60 days. Newly collected fares below the route median can trigger Web
Push notifications.

## Deploy

1. Import this repository into Vercel. The frontend is served from `public/`;
   API handlers are in `api/`.
2. Create a Neon Postgres database and add its connection string as
   `DATABASE_URL` in Vercel.
3. Configure these Vercel environment variables:

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | Neon Postgres connection string |
   | `FEED_URLS` | Comma-separated authorized JSON fare feed URLs |
   | `COLLECTOR_SECRET` | Random secret used by the scheduled collector |
   | `VAPID_PUBLIC_KEY` | Base64url VAPID public key |
   | `VAPID_PRIVATE_KEY` | Base64url VAPID private key |
   | `VAPID_SUBJECT` | Contact URL, e.g. `mailto:you@example.com` |

   Generate `COLLECTOR_SECRET` with `openssl rand -hex 32`. Generate the VAPID
   keys as described below.
4. On your computer, run `npm install`, link the project with `npx vercel link`,
   pull the Vercel environment with `npx vercel env pull .env.local`, then run
   `npm run db:migrate` to create the database tables.
5. Add repository secrets `VERCEL_APP_URL` (the deployed origin, without a
   trailing slash) and `COLLECTOR_SECRET` in GitHub **Settings → Secrets and
   variables → Actions**. The workflow at `.github/workflows/collect.yml`
   calls the collector every six hours and can also be started manually.
6. Redeploy from Vercel after configuring the environment variables and
   applying the database migration.

The GitHub Actions schedule is best-effort and may be delayed. Vercel Hobby
Cron is once per day, so the repository workflow is used for the requested
six-hour cadence.

Generate VAPID keys with the `web-push` CLI and set both printed values in
Vercel's environment settings:

```sh
npx web-push generate-vapid-keys
```

Keep the private key in Vercel environment variables only. Push requires
HTTPS, which Vercel provides on deployed domains.

## Local development

```sh
npm install
npx vercel dev
```

Pull the environment variables locally with `npx vercel env pull .env.local`.
The route list covers NBO/WIL to MBA, UKA, MYD, KIS, and EDL.

## API

- `GET /api/health`
- `GET /api/routes`
- `GET /api/fares?origin=NBO&destination=MBA`
- `GET /api/vapid-public-key`
- `POST /api/subscriptions`
- `DELETE /api/subscriptions`
- `POST /api/collect` (requires `Authorization: Bearer $COLLECTOR_SECRET`)

GitHub Actions scheduled jobs are not exact timers. If collection must run
reliably every 4–6 hours, use a paid scheduler or always-on worker. Database
and Vercel free-tier quotas/terms can change; check them before relying on
continuous public service. Configure rate limits and access controls before
opening subscription endpoints to substantial public traffic.
