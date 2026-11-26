<<<<<<< HEAD
# FlightsKenya 
### Making Local flights affordable for Kenyans.
=======
# Kenya Flight Watch

A local-first fare tracker for Kenyan domestic routes. The Rust service stores
fares and Web Push subscriptions in SQLite; the installable PWA shows route
comparisons and deal alerts.

## Data sources

No carrier endpoints are guessed or bundled. Configure feed URLs you are
authorized to use with `FEED_URLS`. Each URL must return this JSON shape:

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

Feed items are validated and deduplicated. Comparisons use a rolling 60-day
median for the route. A fare below that median can trigger a push notification.

## Run locally

Install stable Rust, then run:

```sh
cargo run
```

By default, the server listens on `127.0.0.1:8080`, creates `flights.db`, and
serves both the API and PWA at <http://127.0.0.1:8080>. `FEED_URLS` accepts
comma-separated JSON feed URLs; collection runs on startup and every six
hours by default.

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite://flights.db?mode=rwc` | SQLite database location |
| `BIND_ADDR` | `127.0.0.1:8080` | HTTP listen address |
| `FEED_URLS` | empty | Comma-separated JSON feed endpoints |
| `COLLECT_INTERVAL_HOURS` | `6` | Collector interval |
| `VAPID_PUBLIC_KEY` | unset | Public VAPID key used by the PWA |
| `VAPID_PRIVATE_KEY_FILE` | unset | Path to PEM VAPID private key |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact subject in VAPID claims |

Generate a VAPID key pair with OpenSSL:

```sh
openssl ecparam -name prime256v1 -genkey -noout -out vapid_private.pem
openssl ec -in vapid_private.pem -pubout -out vapid_public.pem
openssl ec -in vapid_private.pem -pubout -outform DER | tail -c 65 | base64 | tr '/+' '_-' | tr -d '='
```

Set `VAPID_PUBLIC_KEY` to the final command's output and
`VAPID_PRIVATE_KEY_FILE` to the private PEM path. Never commit the private
key. Web Push requires HTTPS in production; localhost is permitted for
development.

The route list covers NBO/WIL to MBA, UKA, MYD, KIS, and EDL. API routes:

- `GET /api/fares?origin=NBO&destination=MBA` — fare comparisons and median.
- `GET /api/routes` — supported route pairs.
- `POST /api/subscriptions` and `DELETE /api/subscriptions` — manage push.
- `GET /api/health` — service status.

The server binds to loopback by default. Before public deployment, add
authentication and rate limiting and serve it only over HTTPS. The backend,
database, and push sender must remain reachable by the PWA.
>>>>>>> 759c4fe (First commit)
