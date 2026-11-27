export interface LiveFareInput {
  origin: string;
  destination: string;
  departure: string;
  carrier: string;
  price_kes: number;
  stops: number;
  duration_minutes: number;
  booking_url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseApifyFlights(payload: unknown, origin: string, destination: string): LiveFareInput[] {
  if (!Array.isArray(payload)) return [];
  const fares: LiveFareInput[] = [];
  const seen = new Set<string>();

  for (const item of payload) {
    if (!isRecord(item) || !Array.isArray(item.best_flights)) continue;
    for (const flight of item.best_flights) {
      if (!isRecord(flight) || !Array.isArray(flight.flights)) continue;
      const segments = flight.flights.filter(isRecord);
      const first = segments[0];
      if (!first || typeof first.departure_airport !== "object") continue;
      const departureAirport = first.departure_airport as Record<string, unknown>;
      const departure = typeof departureAirport.time === "string"
        ? departureAirport.time.replace(" ", "T") + ":00"
        : "";
      const carrier = typeof first.airline === "string" ? first.airline.trim() : "";
      const price = flight.price;
      if (!departure || !carrier || !Number.isSafeInteger(price) || (price as number) <= 0) continue;

      const departureAt = new Date(departure + "+03:00");
      const dateParts = departureAt.getTime() ? departure : "";
      if (!dateParts) continue;
      const normalizedDeparture = departureAt.toISOString();
      const key = `${normalizedDeparture}:${carrier}:${price}`;
      if (seen.has(key)) continue;
      seen.add(key);

      fares.push({
        origin,
        destination,
        departure: normalizedDeparture,
        carrier,
        price_kes: price as number,
        stops: Array.isArray(flight.layovers) ? flight.layovers.length : 0,
        duration_minutes: typeof flight.total_duration === "number" ? flight.total_duration : 0,
        booking_url: "",
      });
    }
  }

  return fares.sort((a, b) => a.price_kes - b.price_kes).slice(0, 10);
}
