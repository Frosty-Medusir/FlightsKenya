from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import pandas as pd

APIFY_API = "https://api.apify.com/v2"
ACTOR = "johnvc~Google-Flights-Data-Scraper-Flight-and-Price-Search"
AIRPORTS = frozenset({"NBO", "WIL", "MBA", "UKA", "MYD", "KIS", "EDL", "KTL"})
REQUEST_TIMEOUT_SECONDS = 75
MAX_RESPONSE_BYTES = 5_000_000
OUTPUT_COLUMNS = [
    "origin",
    "destination",
    "departure",
    "arrival",
    "carrier",
    "flight_numbers",
    "stops",
    "duration_minutes",
    "price_usd",
    "category",
]


def _read_json(request: Request) -> Any:
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except HTTPError as error:
        raise RuntimeError(f"Apify API returned HTTP {error.code}.") from None
    except URLError as error:
        raise RuntimeError(f"Apify API request failed: {error.reason}.") from None

    if len(body) > MAX_RESPONSE_BYTES:
        raise RuntimeError("Apify API response exceeds 5 MB.")
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("Apify API returned invalid JSON.") from None


def extract_dataset(dataset_id: str, token: str) -> list[dict[str, Any]]:
    request = Request(
        f"{APIFY_API}/datasets/{quote(dataset_id, safe='')}/items?clean=true",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    payload = _read_json(request)
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise RuntimeError("Apify dataset did not contain a list of flight records.")
    return payload


def extract_live_search(
    origin: str,
    destination: str,
    departure_date: str,
    token: str,
) -> list[dict[str, Any]]:
    search_input = {
        "departure_id": origin,
        "arrival_id": destination,
        "outbound_date": departure_date,
        "adults": 1,
        "children": 0,
        "infants": 0,
        "currency": "USD",
        "hl": "en",
        "gl": "us",
        "exclude_basic": False,
        "fetch_booking_options": False,
        "max_pages": 1,
    }
    request = Request(
        f"{APIFY_API}/acts/{ACTOR}/runs?waitForFinish=60",
        data=json.dumps(search_input).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    result = _read_json(request)
    run = result.get("data") if isinstance(result, dict) else None
    if not isinstance(run, dict) or run.get("status") != "SUCCEEDED":
        status = run.get("status", "unknown") if isinstance(run, dict) else "unknown"
        raise RuntimeError(f"Apify flight search did not succeed (status: {status}).")
    dataset_id = run.get("defaultDatasetId")
    if not isinstance(dataset_id, str) or not dataset_id:
        raise RuntimeError("Apify flight search did not return a dataset ID.")
    return extract_dataset(dataset_id, token)


def transform_flights(
    items: list[dict[str, Any]],
    origin: str,
    destination: str,
    departure_date: str,
) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    for item in items:
        for category in ("best_flights", "other_flights"):
            flights = item.get(category)
            if not isinstance(flights, list):
                continue
            for itinerary in flights:
                if not isinstance(itinerary, dict):
                    continue
                segments = itinerary.get("flights")
                if not isinstance(segments, list) or not segments:
                    continue
                valid_segments = [segment for segment in segments if isinstance(segment, dict)]
                if len(valid_segments) != len(segments):
                    continue

                first, last = valid_segments[0], valid_segments[-1]
                departure_airport = first.get("departure_airport")
                arrival_airport = last.get("arrival_airport")
                if not isinstance(departure_airport, dict) or not isinstance(arrival_airport, dict):
                    continue
                if (
                    departure_airport.get("id") != origin
                    or arrival_airport.get("id") != destination
                ):
                    continue

                carrier = itinerary.get("airline") or first.get("airline")
                if not isinstance(carrier, str) or not carrier.strip():
                    continue
                flight_numbers = [
                    segment["flight_number"]
                    for segment in valid_segments
                    if isinstance(segment.get("flight_number"), str)
                ]
                rows.append(
                    {
                        "origin": origin,
                        "destination": destination,
                        "departure_local": departure_airport.get("time"),
                        "arrival_local": arrival_airport.get("time"),
                        "carrier": carrier.strip(),
                        "flight_numbers": " / ".join(flight_numbers),
                        "stops": len(itinerary.get("layovers", []))
                        if isinstance(itinerary.get("layovers"), list)
                        else len(valid_segments) - 1,
                        "duration_minutes": itinerary.get("total_duration"),
                        "price_usd": itinerary.get("price"),
                        "category": category,
                    }
                )

    frame = pd.DataFrame(rows)
    if frame.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    departure = pd.to_datetime(
        frame["departure_local"], format="%Y-%m-%d %H:%M", errors="coerce"
    )
    arrival = pd.to_datetime(
        frame["arrival_local"], format="%Y-%m-%d %H:%M", errors="coerce"
    )
    frame["price_usd"] = pd.to_numeric(frame["price_usd"], errors="coerce")
    frame["duration_minutes"] = pd.to_numeric(frame["duration_minutes"], errors="coerce")
    valid = (
        frame["price_usd"].notna()
        & frame["price_usd"].gt(0)
        & departure.notna()
        & arrival.notna()
        & departure.dt.strftime("%Y-%m-%d").eq(departure_date)
    )
    frame = frame.loc[valid].copy()
    if frame.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    frame["departure"] = departure.loc[frame.index].dt.tz_localize("Africa/Nairobi")
    frame["arrival"] = arrival.loc[frame.index].dt.tz_localize("Africa/Nairobi")
    frame = frame.drop_duplicates(
        subset=["origin", "destination", "departure", "carrier", "flight_numbers", "price_usd"]
    )
    return (
        frame.sort_values(["price_usd", "departure"])
        .loc[:, OUTPUT_COLUMNS]
        .reset_index(drop=True)
    )


def load_csv(flights: pd.DataFrame, output_path: Path) -> None:
    flights.to_csv(output_path, index=False)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Find and save the cheapest priced flight from an Apify dataset or live search."
    )
    parser.add_argument("--origin", required=True, help="Departure airport code, e.g. NBO")
    parser.add_argument("--destination", required=True, help="Arrival airport code, e.g. MBA")
    parser.add_argument("--date", required=True, help="Departure date in YYYY-MM-DD format")
    parser.add_argument(
        "--dataset-id",
        help="Use an existing Apify dataset instead of starting a paid Actor search.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="CSV path (default: cheapest_<origin>_<destination>_<date>.csv).",
    )
    args = parser.parse_args(argv)
    args.origin = args.origin.strip().upper()
    args.destination = args.destination.strip().upper()
    if args.origin not in AIRPORTS or args.destination not in AIRPORTS:
        parser.error(f"Origin and destination must be supported airport codes: {', '.join(sorted(AIRPORTS))}.")
    if args.origin == args.destination:
        parser.error("Origin and destination must be different.")
    try:
        if date.fromisoformat(args.date).isoformat() != args.date:
            raise ValueError
    except ValueError:
        parser.error("--date must be a valid YYYY-MM-DD date.")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    token = os.environ.get("APIFY_TOKEN", "").strip()
    if not token:
        print("APIFY_TOKEN is required to read Apify flight data.", file=sys.stderr)
        return 2

    try:
        items = (
            extract_dataset(args.dataset_id, token)
            if args.dataset_id
            else extract_live_search(args.origin, args.destination, args.date, token)
        )
        flights = transform_flights(items, args.origin, args.destination, args.date)
        if flights.empty:
            raise RuntimeError("No priced flights matched the requested route and date.")

        output_path = args.output or Path(
            f"cheapest_{args.origin}_{args.destination}_{args.date}.csv"
        )
        load_csv(flights, output_path)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"Flight ETL failed: {error}", file=sys.stderr)
        return 1

    cheapest = flights.iloc[0]
    print(f"Priced options: {len(flights)}")
    print(
        f"Cheapest: {cheapest['carrier']} {cheapest['flight_numbers']} "
        f"at USD {cheapest['price_usd']:.0f}, departing {cheapest['departure']}."
    )
    print(f"Saved sorted results to {output_path}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
