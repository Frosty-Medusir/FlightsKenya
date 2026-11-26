import { neon } from "@neondatabase/serverless";
import type { FareInput } from "./fares.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

export const sql = neon(databaseUrl);

export interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function getRouteMedians(): Promise<Map<string, number>> {
  const rows = await sql.query(
    `SELECT BTRIM(origin) AS origin, BTRIM(destination) AS destination,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY price_kes) AS median
     FROM fares
     WHERE observed_at >= NOW() - INTERVAL '60 days'
     GROUP BY origin, destination`,
  );
  return new Map(
    rows.map((row) => [
      `${String(row.origin)}:${String(row.destination)}`,
      Number(row.median),
    ]),
  );
}

export async function insertFares(fares: FareInput[], source: string): Promise<FareInput[]> {
  if (fares.length === 0) return [];
  const parameters: unknown[] = [];
  const values = fares.map((fare, index) => {
    const offset = index * 7;
    parameters.push(
      fare.origin,
      fare.destination,
      fare.carrier,
      fare.departure,
      fare.price_kes,
      fare.booking_url,
      source,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });
  const rows = await sql.query(
    `INSERT INTO fares (origin, destination, carrier, departure, price_kes, booking_url, source)
     VALUES ${values.join(",")}
     ON CONFLICT (origin, destination, carrier, departure, price_kes) DO NOTHING
     RETURNING BTRIM(origin) AS origin, BTRIM(destination) AS destination,
               carrier, departure, price_kes, booking_url`,
    parameters,
  );

  const updateParameters: unknown[] = [];
  const updateValues = fares.map((fare, index) => {
    const offset = index * 6;
    updateParameters.push(
      fare.origin,
      fare.destination,
      fare.carrier,
      fare.departure,
      fare.price_kes,
      fare.booking_url,
    );
    return `($${offset + 1}::char(3), $${offset + 2}::char(3), $${offset + 3}::text, $${offset + 4}::timestamptz, $${offset + 5}::integer, $${offset + 6}::text)`;
  });
  await sql.query(
    `UPDATE fares AS saved
     SET booking_url = incoming.booking_url
     FROM (VALUES ${updateValues.join(",")}) AS incoming(origin, destination, carrier, departure, price_kes, booking_url)
     WHERE saved.origin = incoming.origin
       AND saved.destination = incoming.destination
       AND saved.carrier = incoming.carrier
       AND saved.departure = incoming.departure
       AND saved.price_kes = incoming.price_kes
       AND saved.booking_url IS DISTINCT FROM incoming.booking_url`,
    updateParameters,
  );

  return rows.map((row) => ({
    origin: String(row.origin),
    destination: String(row.destination),
    carrier: String(row.carrier),
    departure: new Date(String(row.departure)).toISOString(),
    price_kes: Number(row.price_kes),
    booking_url: String(row.booking_url),
  }));
}

export async function pruneOldFares(): Promise<void> {
  await sql.query("DELETE FROM fares WHERE observed_at < NOW() - INTERVAL '180 days'");
}

export async function listFares(origin: string | null, destination: string | null) {
  const rows = await sql.query(
    `SELECT origin, destination, carrier, departure, price_kes, booking_url
     FROM fares
     WHERE departure > NOW()
       AND observed_at >= NOW() - INTERVAL '60 days'
       AND ($1::text IS NULL OR origin = $1)
       AND ($2::text IS NULL OR destination = $2)
     ORDER BY price_kes, departure`,
    [origin, destination],
  );

  const medians = await getRouteMedians();

  return rows.map((row) => {
    const fareOrigin = String(row.origin).trim();
    const fareDestination = String(row.destination).trim();
    const routeKey = `${fareOrigin}:${fareDestination}`;
    const median = medians.get(routeKey) ?? null;
    return {
      origin: fareOrigin,
      destination: fareDestination,
      carrier: String(row.carrier),
      departure: new Date(String(row.departure)).toISOString(),
      price_kes: Number(row.price_kes),
      booking_url: typeof row.booking_url === "string" ? row.booking_url : null,
      median_60d_kes: median,
      below_median: median !== null && Number(row.price_kes) < median,
    };
  });
}

export async function saveSubscription(subscription: SubscriptionRow): Promise<boolean> {
  const existing = await sql.query(
    "SELECT 1 FROM push_subscriptions WHERE endpoint = $1",
    [subscription.endpoint],
  );
  if (existing.length === 0) {
    const count = await sql.query("SELECT COUNT(*)::int AS count FROM push_subscriptions");
    if (Number(count[0]?.count ?? 0) >= 100) return false;
  }
  await sql.query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
     VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE
     SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [subscription.endpoint, subscription.p256dh, subscription.auth],
  );
  return true;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await sql.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const rows = await sql.query("SELECT endpoint, p256dh, auth FROM push_subscriptions");
  return rows.map((row) => ({
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
  }));
}

export async function enforceSubscriptionRateLimit(ipHash: string): Promise<boolean> {
  await sql.query("DELETE FROM subscription_requests WHERE created_at < NOW() - INTERVAL '1 hour'");
  const rows = await sql.query(
    `SELECT COUNT(*)::int AS count FROM subscription_requests
     WHERE ip_hash = $1 AND created_at >= NOW() - INTERVAL '1 hour'`,
    [ipHash],
  );
  if (Number(rows[0]?.count ?? 0) >= 10) return false;
  await sql.query("INSERT INTO subscription_requests (ip_hash) VALUES ($1)", [ipHash]);
  return true;
}
