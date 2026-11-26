import type { VercelRequest, VercelResponse } from "../src/vercel.ts";

export default function handler(_request: VercelRequest, response: VercelResponse) {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return response.status(404).send("Push alerts are not configured.");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=3600");
  return response.status(200).send(key);
}
