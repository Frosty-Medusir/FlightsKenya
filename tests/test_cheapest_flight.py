import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.cheapest_flight import load_csv, transform_flights


class CheapestFlightTests(unittest.TestCase):
    def test_transform_sorts_priced_route_flights_and_discards_invalid_rows(self) -> None:
        payload = [
            {
                "best_flights": [
                    {
                        "airline": "Kenya Airways",
                        "flights": [
                            {
                                "departure_airport": {
                                    "id": "NBO",
                                    "time": "2026-11-29 07:40",
                                },
                                "arrival_airport": {
                                    "id": "MBA",
                                    "time": "2026-11-29 08:40",
                                },
                                "flight_number": "KQ 602",
                                "airline": "Kenya Airways",
                            }
                        ],
                        "layovers": [],
                        "total_duration": 60,
                        "price": 202,
                    },
                    {
                        "airline": "Wrong route",
                        "flights": [
                            {
                                "departure_airport": {
                                    "id": "NBO",
                                    "time": "2026-11-29 07:00",
                                },
                                "arrival_airport": {
                                    "id": "KIS",
                                    "time": "2026-11-29 08:00",
                                },
                                "airline": "Wrong route",
                            }
                        ],
                        "price": 50,
                    },
                    {
                        "airline": "Unpriced airline",
                        "flights": [
                            {
                                "departure_airport": {
                                    "id": "NBO",
                                    "time": "2026-11-29 09:00",
                                },
                                "arrival_airport": {
                                    "id": "MBA",
                                    "time": "2026-11-29 10:00",
                                },
                                "airline": "Unpriced airline",
                            }
                        ],
                    },
                ],
                "other_flights": [
                    {
                        "airline": "Jambojet",
                        "flights": [
                            {
                                "departure_airport": {
                                    "id": "NBO",
                                    "time": "2026-11-29 06:00",
                                },
                                "arrival_airport": {
                                    "id": "MBA",
                                    "time": "2026-11-29 07:15",
                                },
                                "flight_number": "JM 8600",
                                "airline": "Jambojet",
                            }
                        ],
                        "layovers": [],
                        "total_duration": 75,
                        "price": 180,
                    },
                    {
                        "airline": "Different date",
                        "flights": [
                            {
                                "departure_airport": {
                                    "id": "NBO",
                                    "time": "2026-11-30 06:00",
                                },
                                "arrival_airport": {
                                    "id": "MBA",
                                    "time": "2026-11-30 07:15",
                                },
                                "airline": "Different date",
                            }
                        ],
                        "price": 100,
                    },
                ],
            }
        ]

        flights = transform_flights(payload, "NBO", "MBA", "2026-11-29")

        self.assertEqual(len(flights), 2)
        self.assertEqual(flights.iloc[0]["carrier"], "Jambojet")
        self.assertEqual(flights.iloc[0]["price_usd"], 180)
        self.assertEqual(str(flights.iloc[0]["departure"]), "2026-11-29 06:00:00+03:00")
        self.assertEqual(flights.iloc[1]["price_usd"], 202)

    def test_load_writes_sorted_dataframe_to_csv(self) -> None:
        flights = pd.DataFrame(
            [{"carrier": "Kenya Airways", "price_usd": 202}],
        )
        with tempfile.TemporaryDirectory() as directory:
            output_path = Path(directory) / "cheapest.csv"

            load_csv(flights, output_path)

            loaded = pd.read_csv(output_path)
        self.assertEqual(loaded.iloc[0]["carrier"], "Kenya Airways")
        self.assertEqual(loaded.iloc[0]["price_usd"], 202)


if __name__ == "__main__":
    unittest.main()
