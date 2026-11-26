export const AIRPORTS = ["NBO", "WIL", "MBA", "UKA", "MYD", "KIS", "EDL"] as const;
export type Airport = (typeof AIRPORTS)[number];

export const ROUTES = (["NBO", "WIL"] as const).flatMap((origin) =>
  (["MBA", "UKA", "MYD", "KIS", "EDL"] as const).map((destination) => ({
    origin,
    destination,
  })),
);

export function isAirport(value: unknown): value is Airport {
  return typeof value === "string" && AIRPORTS.includes(value.toUpperCase() as Airport);
}
