import { getRouteMedians, insertFares } from "./db.ts";
import type { ParsedFeed } from "./fares.ts";
import { sendDealAlerts } from "./push.ts";

export interface IngestionSummary {
  inserted: number;
  rejected: number;
  deals: number;
}

export async function ingestParsedFeed(
  parsed: ParsedFeed,
  source: string,
): Promise<IngestionSummary> {
  const baselines = await getRouteMedians();
  const inserted = await insertFares(parsed.fares, source);
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

  return {
    inserted: inserted.length,
    rejected: parsed.rejected,
    deals: deals.length,
  };
}
