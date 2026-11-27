import test from "node:test";
import assert from "node:assert/strict";
import { buildSkyscannerSearchUrl } from "../public/skyscanner.js";

test("Skyscanner links preserve route and optional departure date", () => {
  assert.equal(
    buildSkyscannerSearchUrl("NBO", "MBA", "2026-12-01"),
    "https://www.skyscanner.net/transport/flights/nbo/mba/261201/",
  );
  assert.equal(
    buildSkyscannerSearchUrl("WIL", "UKA"),
    "https://www.skyscanner.net/transport/flights/wil/uka/",
  );
});

test("Skyscanner links reject invalid routes and dates", () => {
  assert.throws(() => buildSkyscannerSearchUrl("NBO", "NBO"));
  assert.throws(() => buildSkyscannerSearchUrl("NBO", "MBA", "2026-02-30"));
});
