import { isAirport } from "../src/airports.ts";
import { isValidDepartureDate } from "../src/fares.ts";
import { parseApifyFlights } from "../src/live-fares.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

const ACTOR = "johnvc~Google-Flights-Data-Scraper-Flight-and-Price-Search";
const APIFY_API = "https://api.apify.com/v2";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const origin = typeof request.query.origin === "string" ? request.query.origin.toUpperCase() : "";
  const destination = typeof request.query.destination === "string"
    ? request.query.destination.toUpperCase()
    : "";
  const date = typeof request.query.date === "string" ? request.query.date : "";

  if (!isAirport(origin) || !isAirport(destination) || origin === destination) {
    return response.status(400).json({ error: "Valid origin and destination codes are required." });
  }
  if (!isValidDepartureDate(date)) {
    return response.status(400).json({ error: "A valid departure date is required." });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return response.status(503).json({ error: "Live Google Flights search is not configured." });
  }

  try {
    const runResponse = await fetch(
      `${APIFY_API}/acts/${ACTOR}/runs?waitForFinish=60`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          departure_id: origin,
          arrival_id: destination,
          outbound_date: date,
          adults: 1,
          children: 0,
          infants: 0,
          currency: "KES",
          hl: "en",
          gl: "ke",
          exclude_basic: false,
          fetch_booking_options: false,
          max_pages: 1,
        }),
        signal: AbortSignal.timeout(70_000),
      },
    );
    if (!runResponse.ok) {
      throw new Error(`Apify run returned HTTP ${runResponse.status}.`);
    }
    const runPayload = await runResponse.json() as {
      data?: { status?: string; defaultDatasetId?: string };
    };
    if (runPayload.data?.status !== "SUCCEEDED" || !runPayload.data.defaultDatasetId) {
      throw new Error("Apify live search did not complete.");
    }

    const datasetResponse = await fetch(
      `${APIFY_API}/datasets/${runPayload.data.defaultDatasetId}/items?clean=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!datasetResponse.ok) {
      throw new Error(`Apify dataset returned HTTP ${datasetResponse.status}.`);
    }
    const dataset = await datasetResponse.json();
    const fares = parseApifyFlights(dataset, origin, destination);
    response.setHeader("Cache-Control", "private, max-age=120");
    return response.status(200).json(fares);
  } catch (error) {
    console.error("Live fare search failed:", error);
    return response.status(502).json({ error: "Live fare search is temporarily unavailable." });
  }
}
