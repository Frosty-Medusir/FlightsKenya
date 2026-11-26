<<<<<<< HEAD
# Kenya Flight Watch

A Vercel-hosted fare tracker for Kenyan domestic routes. The static PWA is
served from `public/`; TypeScript Vercel Functions provide the API; Neon
Postgres stores fares and push subscriptions.

## Fare feeds

No airline endpoints are assumed. Add feed URLs you are authorized to use to
the Vercel `FEED_URLS` environment variable (comma-separated). Each endpoint
must return:
=======
# Flights Kenya

**Affordable flights for every Kenyan.**

Flights Kenya compares fares on domestic routes from Nairobi's JKIA and
Wilson airports. The project is operated by Kodovozlabs.

## Data feeds

Configure authorized JSON feed URLs with `FEED_URLS`. Each feed returns:
>>>>>>> a578bee (Added privacy Policy and branding)

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

<<<<<<< HEAD
Items are validated and deduplicated. Route medians use fares recorded in the
last 60 days. Newly collected fares below the route median can trigger Web
Push notifications.
=======
Fare entries are validated and deduplicated. Route comparisons use a rolling
60-day median. The application stores browser push subscriptions only when a
visitor opts in to alerts.
>>>>>>> a578bee (Added privacy Policy and branding)

## Deploy

<<<<<<< HEAD
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
=======
Install stable Rust and run:
>>>>>>> a578bee (Added privacy Policy and branding)

```sh
npx web-push generate-vapid-keys
```

<<<<<<< HEAD
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
=======
The server creates `flights.db`, serves the PWA at
<http://127.0.0.1:8080>, and runs the collector on startup and every six hours.
Set `FEED_URLS` to start collecting fare data.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://flights.db?mode=rwc` | SQLite database location |
| `BIND_ADDR` | `127.0.0.1:8080` | HTTP listen address |
| `FEED_URLS` | empty | Comma-separated JSON feed endpoints |
| `COLLECT_INTERVAL_HOURS` | `6` | Collector interval |
| `VAPID_PUBLIC_KEY` | unset | Public VAPID key used by the PWA |
| `VAPID_PRIVATE_KEY_FILE` | unset | Path to the PEM VAPID private key |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact subject in VAPID claims |

Web Push requires HTTPS in production; localhost is allowed for development.
The private VAPID key must never be committed to the repository.

## Privacy and support

Read the [Flights Kenya Privacy Policy](./web/privacy.html). The policy is
designed with Kenya's Data Protection Act, 2019 (No. 24 of 2019) and applicable
regulations in mind. For support or privacy requests, email
[info@kodovozlabs.co.ke](mailto:info@kodovozlabs.co.ke).

© 2026 Kodovozlabs. All rights reserved.
>>>>>>> a578bee (Added privacy Policy and branding)
