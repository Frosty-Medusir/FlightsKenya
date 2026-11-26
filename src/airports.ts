export const AIRPORTS = ["NBO", "WIL", "MBA", "UKA", "MYD", "KIS", "EDL"] as const;
export type Airport = (typeof AIRPORTS)[number];

export const ROUTES = AIRPORTS.flatMap((origin) =>
  AIRPORTS.filter((destination) => destination !== origin).map((destination) => ({
    origin,
    destination,
  })),
);

export function isAirport(value: unknown): value is Airport {
  return typeof value === "string" && AIRPORTS.includes(value.toUpperCase() as Airport);
}
