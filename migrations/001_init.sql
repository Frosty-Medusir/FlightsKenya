CREATE TABLE IF NOT EXISTS fares (
    id BIGSERIAL PRIMARY KEY,
    origin CHAR(3) NOT NULL,
    destination CHAR(3) NOT NULL,
    carrier TEXT NOT NULL,
    departure TIMESTAMPTZ NOT NULL,
    price_kes INTEGER NOT NULL CHECK (price_kes > 0),
    source TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (origin, destination, carrier, departure, price_kes)
);

CREATE INDEX IF NOT EXISTS fares_route_observed
    ON fares (origin, destination, observed_at DESC);
CREATE INDEX IF NOT EXISTS fares_departure
    ON fares (departure);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_requests (
    id BIGSERIAL PRIMARY KEY,
    ip_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscription_requests_ip_created
    ON subscription_requests (ip_hash, created_at DESC);
