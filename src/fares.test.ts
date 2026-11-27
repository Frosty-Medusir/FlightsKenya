import test from "node:test";
import assert from "node:assert/strict";
import { AIRPORTS, ROUTES } from "./airports.ts";
import { isValidDepartureDate, median, normalizeFare, parseFeed } from "./fares.ts";

test("every available airport can be selected as an origin and destination", () => {
  assert.deepEqual([...new Set(ROUTES.map((route) => route.origin))], AIRPORTS);
  assert.equal(ROUTES.length, AIRPORTS.length * (AIRPORTS.length - 1));
  assert.equal(ROUTES.some(({ origin, destination }) => origin === destination), false);
  assert.equal(ROUTES.some(({ origin, destination }) => origin === "NBO" && destination === "KTL"), true);
});

test("departure dates require a valid YYYY-MM-DD calendar date", () => {
  assert.equal(isValidDepartureDate("2028-02-29"), true);
  assert.equal(isValidDepartureDate("2027-02-29"), false);
  assert.equal(isValidDepartureDate("2027-2-09"), false);
});

test("median handles empty, odd, and even sample sets", () => {
  assert.equal(median([]), null);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([8, 2, 4, 6]), 5);
});

test("fare normalization accepts supported routes and rejects malformed fares", () => {
  assert.deepEqual(
    normalizeFare({
      origin: "nbo",
      destination: "mba",
      carrier: " Example Air ",
      departure: "2026-12-01T09:30:00+03:00",
      price_kes: 8500,
      booking_url: "https://air.example/book?flight=123",
    }),
    {
      origin: "NBO",
      destination: "MBA",
      carrier: "Example Air",
      departure: "2026-12-01T06:30:00.000Z",
      price_kes: 8500,
      booking_url: "https://air.example/book?flight=123",
    },
  );
  assert.equal(normalizeFare({ origin: "NBO", destination: "XXX" }), null);
  assert.equal(
    normalizeFare({
      origin: "NBO",
      destination: "MBA",
      carrier: "Air",
      departure: "not-a-date",
      price_kes: 100,
      booking_url: "https://air.example/book",
    }),
    null,
  );
  assert.equal(
    normalizeFare({
      origin: "NBO",
      destination: "MBA",
      carrier: "Air",
      departure: "2026-12-01T06:30:00Z",
      price_kes: 100,
      booking_url: "javascript:alert(1)",
    }),
    null,
  );
  assert.equal(
    normalizeFare({
      origin: "NBO",
      destination: "MBA",
      carrier: "Air",
      departure: "2026-12-01T06:30:00Z",
      price_kes: 100,
    }),
    null,
  );
});

test("feed parser keeps valid fares and counts rejected entries", () => {
  const parsed = parseFeed({
    fares: [
      {
        origin: "NBO",
        destination: "MBA",
        carrier: "Air",
        departure: "2026-12-01T06:30:00Z",
        price_kes: 9000,
        booking_url: "https://air.example/book?flight=123",
      },
      { origin: "NBO", destination: "XXX" },
    ],
  });
  assert.equal(parsed.fares.length, 1);
  assert.equal(parsed.rejected, 1);
});
