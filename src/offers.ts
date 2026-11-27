import { isAirport } from "./airports.ts";

export interface PublicOffer {
  origin_code: string | null;
  origin_label: string;
  destination: string;
  carrier: string;
  price_kes: number;
  offer_title: string;
  booking_url: string;
  source_url: string;
}

const BOOKING_HOSTS = new Set(["fo-emea.ttinteractive.com", "skywardairlines.com"]);

function isHttpsUrl(value: string, hosts: Set<string>): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      hosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function normalizePublicOffer(value: unknown): PublicOffer | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const originCode = item.origin_code;
  const originLabel = typeof item.origin_label === "string" ? item.origin_label.trim() : "";
  const destination = typeof item.destination === "string" ? item.destination.toUpperCase() : "";
  const carrier = typeof item.carrier === "string" ? item.carrier.trim() : "";
  const price = item.price_kes;
  const offerTitle = typeof item.offer_title === "string" ? item.offer_title.trim() : "";
  const bookingUrl = typeof item.booking_url === "string" ? item.booking_url.trim() : "";
  const sourceUrl = typeof item.source_url === "string" ? item.source_url.trim() : "";
  const originIsValid =
    originCode === null ||
    (typeof originCode === "string" &&
      ["NBO", "WIL"].includes(originCode) &&
      isAirport(originCode));
  const originLabelIsValid =
    (originCode === null && originLabel === "Nairobi (airport not specified)") ||
    (originCode === "NBO" && originLabel === "JKIA") ||
    (originCode === "WIL" && originLabel === "Wilson Airport");

  if (
    !originIsValid ||
    !originLabelIsValid ||
    !["MBA", "UKA", "MYD", "KIS", "EDL", "KTL"].includes(destination) ||
    !isAirport(destination) ||
    !carrier ||
    carrier.length > 120 ||
    !Number.isSafeInteger(price) ||
    (price as number) <= 0 ||
    (price as number) > 2_000_000 ||
    offerTitle !== "Special offer" ||
    !isHttpsUrl(bookingUrl, BOOKING_HOSTS) ||
    !isHttpsUrl(sourceUrl, new Set(["skywardairlines.com"]))
  ) {
    return null;
  }

  return {
    origin_code: originCode as string | null,
    origin_label: originLabel,
    destination,
    carrier,
    price_kes: price as number,
    offer_title: offerTitle,
    booking_url: bookingUrl,
    source_url: sourceUrl,
  };
}

export function parsePublicOffers(value: unknown): PublicOffer[] {
  if (!value || typeof value !== "object" || !("offers" in value) || !Array.isArray(value.offers)) {
    throw new Error("Offer payload must contain an offers array.");
  }
  if (value.offers.length > 100) throw new Error("Offer payload cannot contain more than 100 offers.");

  const offers: PublicOffer[] = [];
  for (const item of value.offers) {
    const offer = normalizePublicOffer(item);
    if (!offer) throw new Error("Offer payload contains an invalid offer.");
    offers.push(offer);
  }
  return offers;
}
