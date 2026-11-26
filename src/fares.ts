import { isAirport } from "./airports.ts";

export interface FareInput {
  origin: string;
  destination: string;
  carrier: string;
  departure: string;
  price_kes: number;
  booking_url: string;
}

export interface ParsedFeed {
  fares: FareInput[];
  rejected: number;
}

export function isValidDepartureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseFeed(value: unknown): ParsedFeed {
  if (!value || typeof value !== "object" || !("fares" in value) || !Array.isArray(value.fares)) {
    throw new Error("Feed JSON must contain a fares array.");
  }

  const fares: FareInput[] = [];
  let rejected = 0;
  for (const item of value.fares) {
    const fare = normalizeFare(item);
    if (fare) fares.push(fare);
    else rejected += 1;
  }
  return { fares, rejected };
}

export function normalizeFare(value: unknown): FareInput | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const origin = typeof item.origin === "string" ? item.origin.toUpperCase() : "";
  const destination = typeof item.destination === "string" ? item.destination.toUpperCase() : "";
  const carrier = typeof item.carrier === "string" ? item.carrier.trim() : "";
  const departure = typeof item.departure === "string" ? item.departure : "";
  const bookingUrl = typeof item.booking_url === "string" ? item.booking_url.trim() : "";
  const price = item.price_kes;
  const parsedDate = Date.parse(departure);
  let normalizedBookingUrl: string;
  try {
    const url = new URL(bookingUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    normalizedBookingUrl = url.toString();
  } catch {
    return null;
  }

  if (
    !isAirport(origin) ||
    !isAirport(destination) ||
    origin === destination ||
    !carrier ||
    carrier.length > 120 ||
    bookingUrl.length > 2048 ||
    !Number.isFinite(parsedDate) ||
    !Number.isSafeInteger(price) ||
    (price as number) <= 0 ||
    (price as number) > 2_000_000
  ) {
    return null;
  }

  return {
    origin,
    destination,
    carrier,
    departure: new Date(parsedDate).toISOString(),
    price_kes: price as number,
    booking_url: normalizedBookingUrl,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return sorted[middle - 1] + Math.floor((sorted[middle] - sorted[middle - 1]) / 2);
}
