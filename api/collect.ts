import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";
import { pruneOldFares } from "../src/db.ts";
import { parseFeed } from "../src/fares.ts";
import type { ParsedFeed } from "../src/fares.ts";
import { ingestParsedFeed } from "../src/ingest.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  const secret = process.env.COLLECTOR_SECRET;
  if (!secret) return response.status(503).json({ error: "Collector is not configured." });
  const authorization = request.headers.authorization ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  const valid =
    suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
  if (!valid) return response.status(401).json({ error: "Unauthorized." });

  const body = request.body;
  if (!isRecord(body) || !("source" in body) || !("fares" in body)) {
    return response.status(400).json({ error: "Expected a source and fares array." });
  }
  const source = body.source;
  const pruneOld = body.prune_old;
  if (
    typeof source !== "string" ||
    !/^[a-zA-Z0-9.-]{1,253}$/.test(source) ||
    !Array.isArray(body.fares) ||
    body.fares.length > 200 ||
    (pruneOld !== undefined && typeof pruneOld !== "boolean")
  ) {
    return response.status(400).json({ error: "Invalid fare batch." });
  }

  let parsed: ParsedFeed;
  try {
    parsed = parseFeed({ fares: body.fares });
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Invalid fare batch.",
    });
  }

  try {
    const result = await ingestParsedFeed(parsed, source);
    if (pruneOld === true) await pruneOldFares();
    return response.status(200).json({ ...result, pruned: pruneOld === true });
  } catch (error) {
    console.error("Fare ingestion failed:", error);
    return response.status(500).json({ error: "Could not save this fare batch." });
  }
}
