import test from "node:test";
import assert from "node:assert/strict";
import { parseApifyFlights } from "./live-fares.ts";

test("Apify live-flight payloads become normalized route results", () => {
  const fares = parseApifyFlights(
    [{
      best_flights: [{
        flights: [{
          departure_airport: { id: "NBO", time: "2026-12-22 12:05" },
          arrival_airport: { id: "MBA", time: "2026-12-22 13:25" },
          airline: "Kenya Airways",
        }],
        layovers: [],
        total_duration: 80,
        price: 8500,
        type: "One way",
      }],
    }],
    "NBO",
    "MBA",
  );

  assert.equal(fares.length, 1);
  assert.equal(fares[0].origin, "NBO");
  assert.equal(fares[0].destination, "MBA");
  assert.equal(fares[0].carrier, "Kenya Airways");
  assert.equal(fares[0].price_kes, 8500);
  assert.equal(fares[0].departure, "2026-12-22T09:05:00.000Z");
  assert.equal(fares[0].stops, 0);
});

test("Apify live-flight payloads reject malformed or duplicate rows", () => {
  const payload = [{
    best_flights: [{
      flights: [{ departure_airport: { time: "bad" }, airline: "Air" }],
      price: 500,
    }],
  }];
  assert.deepEqual(parseApifyFlights(payload, "NBO", "MBA"), []);
});
