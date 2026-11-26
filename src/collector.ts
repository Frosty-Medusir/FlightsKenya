import { getRouteMedians, insertFares, pruneOldFares } from "./db.ts";
import { parseFeed } from "./fares.ts";
import { sendDealAlerts } from "./push.ts";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FEED_FARES = 2_000;

export interface CollectionSummary {
  feeds: Array<{ url: string; inserted: number; rejected: number; error?: string }>;
  inserted: number;
  deals: number;
}

interface FeedResult {
  url: string;
  inserted: number;
  rejected: number;
  error?: string;
}

export async function collectConfiguredFeeds(): Promise<CollectionSummary> {
  const urls = (process.env.FEED_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) throw new Error("FEED_URLS is empty.");

  const summary: CollectionSummary = { feeds: [], inserted: 0, deals: 0 };
  await pruneOldFares();
  for (const url of urls) {
    const source: FeedResult = { url, inserted: 0, rejected: 0 };
    summary.feeds.push(source);
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "https:") throw new Error("Feed URLs must use HTTPS.");
      const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > 5_000_000) throw new Error("Feed response exceeds 5 MB.");
      const payload: unknown = await response.json();
      const parsed = parseFeed(payload);
      if (parsed.fares.length > MAX_FEED_FARES) {
        throw new Error(`Feed contains more than ${MAX_FEED_FARES} fares.`);
      }
      source.rejected = parsed.rejected;
      const baselines = await getRouteMedians();
      const inserted = await insertFares(parsed.fares, url);
      source.inserted = inserted.length;
      summary.inserted += inserted.length;
      const dealsByRoute = new Map<string, { fare: (typeof inserted)[number]; median: number }>();
      for (const fare of inserted) {
        const baseline = baselines.get(`${fare.origin}:${fare.destination}`);
        if (baseline === undefined || fare.price_kes >= baseline) continue;
        const key = `${fare.origin}:${fare.destination}`;
        const current = dealsByRoute.get(key);
        if (!current || fare.price_kes < current.fare.price_kes) {
          dealsByRoute.set(key, { fare, median: baseline });
        }
      }
      const deals = [...dealsByRoute.values()];
      await sendDealAlerts(deals);
      summary.deals += deals.length;
    } catch (error) {
      source.error = error instanceof Error ? error.message : "Unknown feed error.";
      console.error(`Feed collection failed for ${url}:`, error);
    }
  }

  if (summary.feeds.every((feed) => feed.error)) {
    throw new Error(`All configured feeds failed: ${summary.feeds.map((feed) => feed.error).join("; ")}`);
  }
  return summary;
}
