import { isAirport } from "../src/airports.ts";
import { isCollectorAuthorized } from "../src/collector-auth.ts";
import { listPublicOffers, savePublicOffers } from "../src/db.ts";
import { parsePublicOffers } from "../src/offers.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "GET") {
    const origin = request.query.origin;
    const destination = request.query.destination;
    if (
      typeof origin !== "string" ||
      typeof destination !== "string" ||
      !isAirport(origin) ||
      !isAirport(destination)
    ) {
      return response.status(400).json({ error: "Valid origin and destination codes are required." });
    }
    try {
      const offers = await listPublicOffers(origin.toUpperCase(), destination.toUpperCase());
      response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
      return response.status(200).json(offers);
    } catch (error) {
      console.error("Public offer query failed:", error);
      return response.status(500).json({ error: "Public offers are temporarily unavailable." });
    }
  }

  if (request.method === "POST") {
    if (!process.env.COLLECTOR_SECRET) {
      return response.status(503).json({ error: "Offer collector is not configured." });
    }
    if (!isCollectorAuthorized(request.headers.authorization, process.env.COLLECTOR_SECRET)) {
      return response.status(401).json({ error: "Unauthorized." });
    }
    try {
      if (!isRecord(request.body)) {
        return response.status(400).json({ error: "Expected an offers array." });
      }
      const offers = parsePublicOffers(request.body);
      const saved = await savePublicOffers(offers);
      return response.status(200).json({ saved });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Offer payload")) {
        return response.status(400).json({ error: error.message });
      }
      console.error("Public offers could not be saved:", error);
      return response.status(500).json({ error: "Public offers could not be saved." });
    }
  }

  response.setHeader("Allow", "GET, POST");
  return response.status(405).json({ error: "Method not allowed." });
}
