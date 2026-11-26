from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

AIRPORTS = frozenset({"NBO", "WIL", "MBA", "UKA", "MYD", "KIS", "EDL"})
MAX_FEED_RESPONSE_BYTES = 5_000_000
MAX_FARES_PER_FEED = 2_000
MAX_BATCH_SIZE = 200
REQUEST_TIMEOUT_SECONDS = 20


def is_https_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
        parts.port
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and bool(parts.hostname)
        and not parts.username
        and not parts.password
    )


def parse_feed_urls(raw_urls: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for raw_url in raw_urls.split(","):
        url = raw_url.strip()
        if not url:
            continue
        if not is_https_url(url):
            raise ValueError("Every FEED_URLS entry must be an HTTPS URL without embedded credentials.")
        if url not in seen:
            urls.append(url)
            seen.add(url)
    if not urls:
        raise ValueError("FEED_URLS is empty.")
    if len(urls) > 20:
        raise ValueError("FEED_URLS cannot contain more than 20 endpoints.")
    return urls


def validate_app_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if (
        not is_https_url(value.strip())
        or parts.path not in ("", "/")
        or parts.query
        or parts.fragment
    ):
        raise ValueError("VERCEL_APP_URL must be an HTTPS site origin without a path or credentials.")
    return f"https://{parts.netloc}"


def normalize_fare(value: Any) -> dict[str, str | int] | None:
    if not isinstance(value, dict):
        return None

    origin = value.get("origin", "")
    destination = value.get("destination", "")
    carrier = value.get("carrier", "")
    departure = value.get("departure", "")
    price = value.get("price_kes")
    booking_url = value.get("booking_url", "")

    if not all(isinstance(item, str) for item in (origin, destination, carrier, departure, booking_url)):
        return None
    origin = origin.strip().upper()
    destination = destination.strip().upper()
    carrier = carrier.strip()
    booking_url = booking_url.strip()
    if (
        origin not in AIRPORTS
        or destination not in AIRPORTS
        or origin == destination
        or not carrier
        or len(carrier) > 120
        or type(price) is not int
        or price <= 0
        or price > 2_000_000
        or len(booking_url) > 2048
    ):
        return None

    try:
        if not is_https_url(booking_url):
            return None
        parsed_departure = datetime.fromisoformat(departure.replace("Z", "+00:00"))
        if parsed_departure.tzinfo is None or parsed_departure.utcoffset() is None:
            return None
    except ValueError:
        return None

    departure_utc = parsed_departure.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "origin": origin,
        "destination": destination,
        "carrier": carrier,
        "departure": departure_utc,
        "price_kes": price,
        "booking_url": booking_url,
    }


def parse_feed(payload: Any) -> tuple[list[dict[str, str | int]], int]:
    if not isinstance(payload, dict) or not isinstance(payload.get("fares"), list):
        raise ValueError("Feed JSON must contain a fares array.")
    if len(payload["fares"]) > MAX_FARES_PER_FEED:
        raise ValueError(f"Feed contains more than {MAX_FARES_PER_FEED} fares.")

    fares: list[dict[str, str | int]] = []
    seen: set[tuple[str, str, str, str, int]] = set()
    rejected = 0
    for raw_fare in payload["fares"]:
        fare = normalize_fare(raw_fare)
        if fare is None:
            rejected += 1
            continue
        key = (
            str(fare["origin"]),
            str(fare["destination"]),
            str(fare["carrier"]),
            str(fare["departure"]),
            int(fare["price_kes"]),
        )
        if key in seen:
            rejected += 1
            continue
        seen.add(key)
        fares.append(fare)
    return fares, rejected


def fetch_feed(url: str) -> Any:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "FlightsKenyaFareCollector/1.0",
        },
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            if urlsplit(response.geturl()).scheme != "https":
                raise RuntimeError("Feed redirected to a non-HTTPS URL.")
            content_length = int(response.headers.get("Content-Length", "0"))
            if content_length > MAX_FEED_RESPONSE_BYTES:
                raise RuntimeError("Feed response exceeds 5 MB.")
            body = response.read(MAX_FEED_RESPONSE_BYTES + 1)
    except HTTPError as error:
        raise RuntimeError(f"Feed returned HTTP {error.code}.") from None
    except URLError as error:
        raise RuntimeError(f"Feed request failed: {error.reason}.") from None

    if len(body) > MAX_FEED_RESPONSE_BYTES:
        raise RuntimeError("Feed response exceeds 5 MB.")
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("Feed response is not valid JSON.") from None


def load_batch(
    app_url: str,
    secret: str,
    source: str,
    fares: list[dict[str, str | int]],
    prune_old: bool,
) -> dict[str, int | bool]:
    payload = json.dumps(
        {"source": source, "fares": fares, "prune_old": prune_old}
    ).encode("utf-8")
    request = Request(
        f"{app_url}/api/collect",
        data=payload,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read(1_000_001))
    except HTTPError as error:
        try:
            message = json.loads(error.read(4096)).get("error", "Request failed.")
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            message = "Request failed."
        raise RuntimeError(f"Fare API returned HTTP {error.code}: {message}") from None
    except URLError as error:
        raise RuntimeError(f"Could not load fare batch: {error.reason}.") from None
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("Fare API returned invalid JSON.") from None

    if not isinstance(result, dict):
        raise RuntimeError("Fare API returned an invalid response.")
    return result


def collect_feed(url: str, app_url: str, secret: str, index: int, total: int) -> tuple[int, int, int]:
    payload = fetch_feed(url)
    fares, rejected = parse_feed(payload)
    source = urlsplit(url).hostname or "configured-feed"
    batches = [
        fares[offset : offset + MAX_BATCH_SIZE]
        for offset in range(0, len(fares), MAX_BATCH_SIZE)
    ] or [[]]

    inserted = 0
    deals = 0
    for batch_index, batch in enumerate(batches):
        result = load_batch(
            app_url,
            secret,
            source,
            batch,
            prune_old=batch_index == len(batches) - 1,
        )
        inserted += int(result.get("inserted", 0))
        deals += int(result.get("deals", 0))
    print(
        f"Feed {index}/{total}: accepted {len(fares)}, rejected {rejected}, "
        f"inserted {inserted}, new deals {deals}."
    )
    return len(fares), rejected, inserted


def main() -> int:
    try:
        feeds = parse_feed_urls(os.environ.get("FEED_URLS", ""))
        app_url = validate_app_url(os.environ.get("VERCEL_APP_URL", ""))
        secret = os.environ.get("COLLECTOR_SECRET", "")
        if not secret:
            raise ValueError("COLLECTOR_SECRET is not configured.")
    except ValueError as error:
        print(error, file=sys.stderr)
        return 2

    failures = 0
    totals = {"accepted": 0, "rejected": 0, "inserted": 0}
    for index, url in enumerate(feeds, start=1):
        try:
            accepted, rejected, inserted = collect_feed(url, app_url, secret, index, len(feeds))
            totals["accepted"] += accepted
            totals["rejected"] += rejected
            totals["inserted"] += inserted
        except (OSError, RuntimeError, ValueError) as error:
            failures += 1
            print(f"Feed {index}/{len(feeds)} failed: {error}", file=sys.stderr)

    print(
        f"Collection complete: {totals['accepted']} accepted, "
        f"{totals['rejected']} rejected, {totals['inserted']} inserted."
    )
    if failures == len(feeds):
        return 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
