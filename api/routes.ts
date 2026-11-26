import { ROUTES } from "../src/airports.ts";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "public, max-age=3600");
  return response.status(200).json(ROUTES);
}
