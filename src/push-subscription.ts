export function parseSubscription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const keys = item.keys;
  if (!keys || typeof keys !== "object") return null;
  const keyValues = keys as Record<string, unknown>;
  if (
    typeof item.endpoint !== "string" ||
    !isAllowedPushEndpoint(item.endpoint) ||
    typeof keyValues.p256dh !== "string" ||
    keyValues.p256dh.length < 20 ||
    keyValues.p256dh.length > 200 ||
    typeof keyValues.auth !== "string" ||
    keyValues.auth.length < 8 ||
    keyValues.auth.length > 100
  ) {
    return null;
  }
  return {
    endpoint: item.endpoint,
    keys: { p256dh: keyValues.p256dh, auth: keyValues.auth },
  };
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
