import test from "node:test";
import assert from "node:assert/strict";
import { normalizePublicOffer, parsePublicOffers } from "./offers.ts";

const offer = {
  origin_code: null,
  origin_label: "Nairobi (airport not specified)",
  destination: "MBA",
  carrier: "Skyward Airlines",
  price_kes: 7000,
  offer_title: "Special offer",
  booking_url: "https://fo-emea.ttinteractive.com/booking",
  source_url: "https://skywardairlines.com/skyward-special-offers/",
};

test("public offers normalize accepted Nairobi routes and official links", () => {
  assert.deepEqual(normalizePublicOffer(offer), offer);
  assert.equal(
    normalizePublicOffer({
      ...offer,
      origin_code: "WIL",
      origin_label: "Wilson Airport",
      destination: "UKA",
    })?.origin_code,
    "WIL",
  );
});

test("public offers reject unapproved domains and unsupported promotion values", () => {
  assert.equal(
    normalizePublicOffer({ ...offer, booking_url: "https://example.net/book" }),
    null,
  );
  assert.equal(
    normalizePublicOffer({ ...offer, source_url: "https://example.net/offers" }),
    null,
  );
  assert.equal(normalizePublicOffer({ ...offer, origin_code: "NBO" }), null);
});

test("public offer payload rejects malformed rows instead of partially saving", () => {
  assert.deepEqual(parsePublicOffers({ offers: [offer] }), [offer]);
  assert.throws(
    () => parsePublicOffers({ offers: [offer, { ...offer, price_kes: -1 }] }),
    /invalid offer/i,
  );
});
