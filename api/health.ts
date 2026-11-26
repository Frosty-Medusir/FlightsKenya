import { sql } from "../src/db.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

export default async function handler(_request: VercelRequest, response: VercelResponse) {
  try {
    await sql`SELECT 1`;
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("Health check failed:", error);
    return response.status(503).json({ ok: false });
  }
}
