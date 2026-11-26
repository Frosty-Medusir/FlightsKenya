import webpush from "web-push";
import type { PushSubscription } from "web-push";
import { listSubscriptions, removeSubscription } from "./db.ts";
import type { FareInput } from "./fares.ts";
import type { SubscriptionRow } from "./db.ts";

function vapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export async function sendDealAlerts(deals: Array<{ fare: FareInput; median: number }>): Promise<void> {
  if (deals.length === 0) return;
  const config = vapidConfig();
  if (!config) {
    console.warn("Skipping Web Push: VAPID environment variables are not configured.");
    return;
  }

  let subscriptions: SubscriptionRow[];
  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    subscriptions = await listSubscriptions();
  } catch (error) {
    console.error("Could not initialize Web Push for this collection run:", error);
    return;
  }
  const details = deals.slice(0, 3).map(({ fare, median }) =>
    `${fare.origin}–${fare.destination}: KES ${fare.price_kes} (median ${median})`,
  );
  const payload = JSON.stringify({
    title: deals.length === 1 ? "A new fare deal is available" : `${deals.length} new fare deals`,
    body: details.join(" · "),
    url: "/",
  });

  const results = await Promise.allSettled(subscriptions.map((sub) => deliver(sub, payload)));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Could not send a push notification:", result.reason);
    }
  }
}

async function deliver(subscription: SubscriptionRow, payload: string): Promise<void> {
  const pushSubscription: PushSubscription = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  try {
    await webpush.sendNotification(pushSubscription, payload, { TTL: 60 });
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number(error.statusCode)
        : null;
    if (statusCode === 404 || statusCode === 410) {
      await removeSubscription(subscription.endpoint);
      return;
    }
    throw error;
  }
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "fcm.googleapis.com" ||
      host === "web.push.apple.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".notify.windows.com")
    );
  } catch {
    return false;
  }
}
