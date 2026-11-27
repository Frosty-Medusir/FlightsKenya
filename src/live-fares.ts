export interface LiveFareInput {
  origin: string;
  destination: string;
  departure: string;
  carrier: string;
  flight_number: string;
  price_usd: number | null;
  stops: number;
  duration_minutes: number;
  booking_url: string;
}

export interface ApifyFlightSearchInput {
  departure_id: string;
  arrival_id: string;
  outbound_date: string;
  adults: number;
  children: number;
  infants: number;
  currency: string;
  hl: string;
  gl: string;
  exclude_basic: boolean;
  fetch_booking_options: boolean;
  max_pages: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function createApifyFlightSearchInput(
  origin: string,
  destination: string,
  date: string,
): ApifyFlightSearchInput {
  return {
    departure_id: origin,
    arrival_id: destination,
    outbound_date: date,
    adults: 1,
    children: 0,
    infants: 0,
    currency: "USD",
    hl: "en",
    gl: "us",
    exclude_basic: false,
    fetch_booking_options: false,
    max_pages: 1,
  };
}

export function parseApifyFlights(payload: unknown, origin: string, destination: string): LiveFareInput[] {
  if (!Array.isArray(payload)) return [];
  const fares: LiveFareInput[] = [];
  const seen = new Set<string>();

  for (const item of payload) {
    if (!isRecord(item)) continue;
    for (const category of ["best_flights", "other_flights"]) {
      const flights = item[category];
      if (!Array.isArray(flights)) continue;
      for (const flight of flights) {
        if (!isRecord(flight) || !Array.isArray(flight.flights)) continue;
        const segments = flight.flights.filter(isRecord);
        const first = segments[0];
        if (!first || !isRecord(first.departure_airport)) continue;
        const departureAirport = first.departure_airport;
        const departure = typeof departureAirport.time === "string"
          ? departureAirport.time.replace(" ", "T") + ":00"
          : "";
        const carrier = typeof first.airline === "string" ? first.airline.trim() : "";
        if (!departure || !carrier || segments.length !== flight.flights.length) continue;

        const departureAt = new Date(departure + "+03:00");
        if (!Number.isFinite(departureAt.getTime())) continue;
        const normalizedDeparture = departureAt.toISOString();
        const flightNumber = typeof first.flight_number === "string" ? first.flight_number : "";
        const rawPrice = flight.price;
        const price = Number.isSafeInteger(rawPrice) && (rawPrice as number) > 0
          ? rawPrice as number
          : null;
        const key = `${normalizedDeparture}:${carrier}:${flightNumber}:${price ?? "unknown"}`;
        if (seen.has(key)) continue;
        seen.add(key);

        fares.push({
          origin,
          destination,
          departure: normalizedDeparture,
          carrier,
          flight_number: flightNumber,
          price_usd: price,
          stops: Array.isArray(flight.layovers) ? flight.layovers.length : 0,
          duration_minutes: typeof flight.total_duration === "number" ? flight.total_duration : 0,
          booking_url: "",
        });
      }
    }
  }

  return fares
    .sort((a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
      a.departure.localeCompare(b.departure))
    .slice(0, 10);
}
