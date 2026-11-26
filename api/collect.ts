import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";
import { collectConfiguredFeeds } from "../src/collector.ts";

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

  try {
    const result = await collectConfiguredFeeds();
    return response.status(200).json(result);
  } catch (error) {
    console.error("Collection run failed:", error);
    return response.status(502).json({ error: "All configured fare feeds failed." });
  }
}
