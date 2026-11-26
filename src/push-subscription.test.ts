import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedPushEndpoint, parseSubscription } from "./push-subscription.ts";

test("push subscription validation allows browser push services only", () => {
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/token"), true);
  assert.equal(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/token"), false);
  assert.equal(isAllowedPushEndpoint("https://127.0.0.1/admin"), false);
  assert.equal(isAllowedPushEndpoint("https://example.com/push"), false);
});

test("subscription validation rejects malformed keys and endpoints", () => {
  assert.equal(
    parseSubscription({
      endpoint: "https://fcm.googleapis.com/fcm/send/token",
      keys: { p256dh: "p".repeat(65), auth: "a".repeat(16) },
    })?.endpoint,
    "https://fcm.googleapis.com/fcm/send/token",
  );
  assert.equal(
    parseSubscription({
      endpoint: "https://example.com/attacker",
      keys: { p256dh: "p".repeat(65), auth: "a".repeat(16) },
    }),
    null,
  );
});
