import { isAirport } from "../src/airports.ts";
import { isValidDepartureDate } from "../src/fares.ts";
import { createApifyFlightSearchInput, parseApifyFlights } from "../src/live-fares.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

const ACTOR = "johnvc~Google-Flights-Data-Scraper-Flight-and-Price-Search";
const APIFY_API = "https://api.apify.com/v2";

export const config = { maxDuration: 90 };

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
        body: JSON.stringify(createApifyFlightSearchInput(origin, destination, date)),
        signal: AbortSignal.timeout(70_000),
      },
    );
    if (!runResponse.ok) {
      console.error("Apify run request was rejected:", runResponse.status, await runResponse.text());
      const message = runResponse.status === 401 || runResponse.status === 403
        ? "Apify token is invalid or cannot run this Actor."
        : runResponse.status === 400
          ? "Apify rejected the search parameters."
          : `Apify run request failed (HTTP ${runResponse.status}).`;
      return response.status(502).json({ error: message });
    }
    const runPayload = await runResponse.json() as {
      data?: { status?: string; defaultDatasetId?: string; id?: string };
    };
    if (runPayload.data?.status !== "SUCCEEDED" || !runPayload.data.defaultDatasetId) {
      const status = runPayload.data?.status ?? "unknown";
      console.error("Apify live search did not complete:", status, runPayload.data?.id);
      return response.status(502).json({
        error: `Apify live search did not complete (status: ${status}).`,
      });
    }

    const datasetResponse = await fetch(
      `${APIFY_API}/datasets/${runPayload.data.defaultDatasetId}/items?clean=true`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!datasetResponse.ok) {
      console.error("Apify dataset request failed:", datasetResponse.status, await datasetResponse.text());
      return response.status(502).json({
        error: `Could not read Apify flight results (HTTP ${datasetResponse.status}).`,
      });
    }
    const dataset = await datasetResponse.json();
    const fares = parseApifyFlights(dataset, origin, destination);
    response.setHeader("Cache-Control", "private, max-age=120");
    return response.status(200).json(fares);
  } catch (error) {
    console.error("Live fare search failed:", error);
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Live search timed out. Please try again."
      : "Live fare search is temporarily unavailable. Check the deployment logs.";
    return response.status(502).json({ error: message });
  }
}
