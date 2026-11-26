CREATE TABLE fares (
    id INTEGER PRIMARY KEY,
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    carrier TEXT NOT NULL,
    departure TEXT NOT NULL,
    price_kes INTEGER NOT NULL CHECK (price_kes > 0),
    source TEXT NOT NULL,
    collected_at TEXT NOT NULL,
    UNIQUE (origin, destination, carrier, departure, price_kes)
);

CREATE INDEX fares_route_departure ON fares (origin, destination, departure);
CREATE INDEX fares_collected_at ON fares (collected_at);

CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
