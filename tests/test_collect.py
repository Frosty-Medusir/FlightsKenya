import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from scripts.collect import (
    collect_feed,
    normalize_fare,
    parse_feed,
    parse_feed_urls,
    validate_app_url,
)


class CollectTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fare = {
            "origin": "nbo",
            "destination": "mba",
            "carrier": " Example Air ",
            "departure": "2026-12-01T09:30:00+03:00",
            "price_kes": 8500,
            "booking_url": "https://air.example/book?flight=123",
        }

    def test_normalizes_route_text_and_departure_to_utc(self) -> None:
        self.assertEqual(
            normalize_fare(self.fare),
            {
                "origin": "NBO",
                "destination": "MBA",
                "carrier": "Example Air",
                "departure": "2026-12-01T06:30:00Z",
                "price_kes": 8500,
                "booking_url": "https://air.example/book?flight=123",
            },
        )

    def test_rejects_fares_without_safe_booking_links_or_timezone(self) -> None:
        self.assertIsNone(normalize_fare({**self.fare, "booking_url": "javascript:alert(1)"}))
        self.assertIsNone(normalize_fare({**self.fare, "departure": "2026-12-01T09:30:00"}))
        self.assertIsNone(normalize_fare({**self.fare, "booking_url": ""}))

    def test_feed_parser_rejects_bad_rows_and_deduplicates(self) -> None:
        fares, rejected = parse_feed(
            {"fares": [self.fare, self.fare, {"origin": "NBO", "destination": "XXX"}]}
        )
        self.assertEqual(len(fares), 1)
        self.assertEqual(rejected, 2)

    def test_feed_urls_must_be_https(self) -> None:
        with self.assertRaises(ValueError):
            parse_feed_urls("http://not-secure.example/fares.json")
        self.assertEqual(
            parse_feed_urls("https://air.example/fares.json, https://air.example/fares.json"),
            ["https://air.example/fares.json"],
        )

    def test_vercel_app_url_must_be_a_secure_origin(self) -> None:
        self.assertEqual(validate_app_url("https://flights.example/"), "https://flights.example")
        with self.assertRaises(ValueError):
            validate_app_url("http://localhost:3000")

    @patch("scripts.collect.load_batch")
    @patch("scripts.collect.fetch_feed")
    def test_collection_batches_fares_and_prunes_after_the_last_batch(
        self, fetch_feed_mock, load_batch_mock
    ) -> None:
        start = datetime(2026, 12, 1, 9, tzinfo=timezone.utc)
        feed_fares = [
            {
                **self.fare,
                "departure": (start + timedelta(minutes=index)).isoformat(),
                "price_kes": 8000 + index,
            }
            for index in range(201)
        ]
        fetch_feed_mock.return_value = {"fares": feed_fares}
        load_batch_mock.side_effect = lambda _app, _secret, _source, fares, **_kwargs: {
            "inserted": len(fares),
            "deals": 0,
        }

        result = collect_feed("https://air.example/fares.json", "https://app.example", "secret", 1, 1)

        self.assertEqual(result, (201, 0, 201))
        self.assertEqual(load_batch_mock.call_count, 2)
        self.assertEqual(len(load_batch_mock.call_args_list[0].args[3]), 200)
        self.assertFalse(load_batch_mock.call_args_list[0].kwargs["prune_old"])
        self.assertTrue(load_batch_mock.call_args_list[1].kwargs["prune_old"])


if __name__ == "__main__":
    unittest.main()
