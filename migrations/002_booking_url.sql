ALTER TABLE fares ADD COLUMN IF NOT EXISTS booking_url TEXT;

CREATE TABLE IF NOT EXISTS public_offers (
    id BIGSERIAL PRIMARY KEY,
    origin_code CHAR(3),
    origin_label TEXT NOT NULL,
    destination CHAR(3) NOT NULL,
    carrier TEXT NOT NULL,
    price_kes INTEGER NOT NULL CHECK (price_kes > 0),
    offer_title TEXT NOT NULL,
    booking_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_url, origin_label, destination, price_kes, offer_title)
);

CREATE INDEX IF NOT EXISTS public_offers_route_observed
    ON public_offers (destination, origin_code, observed_at DESC);
