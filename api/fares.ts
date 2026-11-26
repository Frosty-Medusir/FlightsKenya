import { isAirport } from "../src/airports.ts";
import { listFares } from "../src/db.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }
  const rawOrigin = request.query.origin;
  const rawDestination = request.query.destination;
  if ((rawOrigin !== undefined && typeof rawOrigin !== "string") ||
      (rawDestination !== undefined && typeof rawDestination !== "string")) {
    return response.status(400).json({ error: "Airport filters must be single airport codes." });
  }
  const origin = typeof rawOrigin === "string" ? rawOrigin.toUpperCase() : null;
  const destination = typeof rawDestination === "string" ? rawDestination.toUpperCase() : null;
  if ((origin && !isAirport(origin)) || (destination && !isAirport(destination))) {
    return response.status(400).json({ error: "Unsupported airport code." });
  }

  try {
    const fares = await listFares(origin, destination);
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json(fares);
  } catch (error) {
    console.error("Fare query failed:", error);
    return response.status(500).json({ error: "Fare data is temporarily unavailable." });
  }
}
