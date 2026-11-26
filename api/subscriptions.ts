import { createHash } from "node:crypto";
import type { VercelRequest, VercelResponse } from "../src/vercel.ts";
import { enforceSubscriptionRateLimit, removeSubscription, saveSubscription } from "../src/db.ts";
import { isAllowedPushEndpoint, parseSubscription } from "../src/push-subscription.ts";

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method === "POST") return subscribe(request, response);
  if (request.method === "DELETE") return unsubscribe(request, response);
  response.setHeader("Allow", "POST, DELETE");
  return response.status(405).json({ error: "Method not allowed." });
}

async function subscribe(request: VercelRequest, response: VercelResponse) {
  const subscription = parseSubscription(request.body);
  if (!subscription) return response.status(400).json({ error: "Invalid push subscription." });

  const forwardedFor = request.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const ip = forwarded?.split(",").at(-1)?.trim();
  if (!ip) return response.status(400).json({ error: "Could not determine request address." });
  const ipHash = createHash("sha256").update(ip).digest("hex");

  try {
    if (!(await enforceSubscriptionRateLimit(ipHash))) {
      return response.status(429).json({ error: "Too many subscription requests. Try again later." });
    }
    const saved = await saveSubscription({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    });
    if (!saved) return response.status(503).json({ error: "This app has reached its subscription limit." });
    return response.status(204).end();
  } catch (error) {
    console.error("Subscription save failed:", error);
    return response.status(500).json({ error: "Could not save this device for alerts." });
  }
}

async function unsubscribe(request: VercelRequest, response: VercelResponse) {
  const endpoint =
    request.body && typeof request.body === "object" && "endpoint" in request.body
      ? request.body.endpoint
      : null;
  if (typeof endpoint !== "string" || !isAllowedPushEndpoint(endpoint)) {
    return response.status(400).json({ error: "Invalid push endpoint." });
  }
  try {
    await removeSubscription(endpoint);
    return response.status(204).end();
  } catch (error) {
    console.error("Subscription delete failed:", error);
    return response.status(500).json({ error: "Could not remove this subscription." });
  }
}
