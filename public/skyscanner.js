function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function buildSkyscannerSearchUrl(origin, destination, departureDate = null) {
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || origin === destination) {
    throw new Error("Skyscanner search requires two different airport codes.");
  }
  if (departureDate !== null && !isValidDate(departureDate)) {
    throw new Error("Skyscanner departure date must be a valid YYYY-MM-DD date.");
  }

  const dateSegment = departureDate
    ? `/${departureDate.slice(2).replaceAll("-", "")}`
    : "";
  const path = `/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}${dateSegment}/`;
  return new URL(path, "https://www.skyscanner.net").href;
}
