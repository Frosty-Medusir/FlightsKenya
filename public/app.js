import { buildSkyscannerSearchUrl } from "./skyscanner.js";

const airportNames = {
  NBO: "Nairobi · JKIA", WIL: "Nairobi · Wilson", MBA: "Mombasa",
  UKA: "Ukunda", MYD: "Malindi", KIS: "Kisumu", EDL: "Eldoret", KTL: "Kitale",
};
const originSelect = document.querySelector("#origin");
const destinationSelect = document.querySelector("#destination");
const departureDateInput = document.querySelector("#departure-date");
const fareList = document.querySelector("#fare-list");
const offerList = document.querySelector("#offer-list");
const statusMessage = document.querySelector("#status");
const externalSearch = document.querySelector("#external-search");

const introVideo = document.querySelector("#intro-video");
if (
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  navigator.connection?.saveData !== true
) {
  introVideo.play().catch((error) => console.info("Hero video playback unavailable:", error));
}

function currentKenyanDate() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
departureDateInput.min = currentKenyanDate();

function option(code) {
  return `<option value="${code}">${airportNames[code]} (${code})</option>`;
}
async function loadRoutes() {
  const response = await fetch("/api/routes");
  if (!response.ok) throw new Error("Could not load supported routes.");
  const routes = await response.json();
  originSelect.innerHTML = [...new Set(routes.map((route) => route.origin))].map(option).join("");
  updateDestinations(routes);
  originSelect.addEventListener("change", () => updateDestinations(routes));
}
function updateDestinations(routes) {
  const availableRoutes = routes.filter((route) => route.origin === originSelect.value);
  destinationSelect.innerHTML = availableRoutes
    .map((route) => option(route.destination)).join("");
  const preferredDestination = ["NBO", "WIL"].includes(originSelect.value) ? "MBA" : "NBO";
  destinationSelect.value = availableRoutes.some((route) => route.destination === preferredDestination)
    ? preferredDestination
    : availableRoutes[0]?.destination || "";
}
function money(amount) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount);
}
function formatDepartureDate(value) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
function safeBookingUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
async function showFares() {
  fareList.replaceChildren();
  statusMessage.textContent = "Looking for available fares…";
  const origin = originSelect.value;
  const destination = destinationSelect.value;
  document.querySelector("#route-title").textContent = `${origin} → ${destination}`;
  const params = new URLSearchParams({ origin, destination });
  const selectedDate = departureDateInput.value;
  if (selectedDate) params.set("date", selectedDate);
  const searchLink = document.createElement("a");
  searchLink.className = "book-link";
  searchLink.href = buildSkyscannerSearchUrl(origin, destination, selectedDate || null);
  searchLink.target = "_blank";
  searchLink.rel = "noopener noreferrer";
  searchLink.textContent = selectedDate
    ? "Check this date on Skyscanner ↗"
    : "Search this route on Skyscanner ↗";
  const searchNote = document.createElement("span");
  searchNote.textContent = "Opens Skyscanner; route coverage, prices, and currency may differ.";
  externalSearch.replaceChildren(searchLink, searchNote);
  try {
    const [fareResponse, offerResponse, liveResponse] = await Promise.all([
      fetch(`/api/fares?${params}`),
      fetch(`/api/offers?${params}`),
      selectedDate
        ? fetch(`/api/live-fares?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(selectedDate)}`)
        : Promise.resolve(null),
    ]);
    if (!fareResponse.ok || !offerResponse.ok) {
      throw new Error("Fare data is temporarily unavailable.");
    }
    const [fares, offers, livePayload] = await Promise.all([
      fareResponse.json(),
      offerResponse.json(),
      liveResponse ? liveResponse.json() : Promise.resolve(null),
    ]);
    const liveFares = liveResponse?.ok && Array.isArray(livePayload) ? livePayload : [];
    const liveError = liveResponse && !liveResponse.ok
      ? livePayload?.error || "Live Google Flights search is unavailable."
      : null;
    const noFaresMessage = selectedDate
      ? `No date-specific fares were found for ${formatDepartureDate(selectedDate)}.`
      : "No date-specific fares are available.";
    const fareStatus = fares.length
      ? `${fares.length} date-specific fare${fares.length === 1 ? "" : "s"}${selectedDate ? ` for ${formatDepartureDate(selectedDate)}` : ""}, sorted from cheapest`
      : offers.length
        ? `${noFaresMessage} Check the indicative public offers below.`
        : noFaresMessage;
    const liveStatus = !selectedDate
      ? "Choose a departure date to search Google Flights live."
      : liveError
        ? `Live search error: ${liveError}`
        : liveFares.length && liveFares.every((fare) => fare.price_usd === null)
          ? `${liveFares.length} flight schedule${liveFares.length === 1 ? "" : "s"} found; prices unavailable from Google Flights.`
          : liveFares.length
            ? `${liveFares.length} live Google Flights option${liveFares.length === 1 ? "" : "s"} found.`
            : "Google Flights returned no results for this route and date.";
    statusMessage.textContent = `${fareStatus} ${liveStatus}`;
    const median = fares.find((fare) => fare.median_60d_kes !== null)?.median_60d_kes;
    document.querySelector("#median-label").textContent = median
      ? `60-day median · KES ${money(median)}` : "Collecting history for route median";
    const storedFareCards = fares.map((fare, index) => {
      const when = new Date(fare.departure).toLocaleString("en-KE", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      const tags = [
        ...(index === 0 ? ["Cheapest"] : []),
        ...(fare.below_median ? ["Below median"] : []),
      ].map((tag) => `<small class="deal">${tag}</small>`).join("");
      const bookingUrl = safeBookingUrl(fare.booking_url);
      const bookingAction = bookingUrl
        ? `<a class="book-link" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer">Book flight ↗</a>`
        : '<span class="booking-unavailable">Booking link unavailable</span>';
      return `<article class="fare-card${index === 0 ? " cheapest" : ""}">
        <span class="carrier">${escapeHtml(fare.carrier)}${tags}</span>
        <span class="departure">${when}</span>
        <span class="price">KES ${money(fare.price_kes)}<small>one way</small></span>
        ${bookingAction}
      </article>`;
    });
    const liveFareCards = liveFares.map((fare) => {
      const when = new Date(fare.departure).toLocaleString("en-KE", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      const stops = fare.stops === 0 ? "Nonstop" : `${fare.stops} stop${fare.stops === 1 ? "" : "s"}`;
      const liveSearchUrl = buildSkyscannerSearchUrl(origin, destination, selectedDate);
      const price = fare.price_usd === null
        ? '<span class="price">Price unavailable<small>schedule only · confirm with airline</small></span>'
        : `<span class="price">USD ${money(fare.price_usd)}<small>live result · confirm final fare</small></span>`;
      return `<article class="fare-card live-fare">
        <span class="carrier">${escapeHtml(fare.carrier)}${fare.flight_number ? ` · ${escapeHtml(fare.flight_number)}` : ""}<small class="deal"> · Live Google Flights</small></span>
        <span class="departure">${when} · ${stops}</span>
        ${price}
        <a class="book-link" href="${escapeHtml(liveSearchUrl)}" target="_blank" rel="noopener noreferrer">Check live price ↗</a>
      </article>`;
    });
    fareList.innerHTML = [...storedFareCards, ...liveFareCards].join("");
    offerList.innerHTML = offers.length ? offers.map((offer) => {
      const bookingUrl = safeBookingUrl(offer.booking_url);
      const sourceUrl = safeBookingUrl(offer.source_url);
      const bookingAction = bookingUrl
        ? `<a class="book-link" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer">Check availability ↗</a>`
        : '<span class="booking-unavailable">Booking link unavailable</span>';
      const sourceAction = sourceUrl
        ? `<a class="offer-source" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Offer source</a>`
        : "";
      return `<article class="fare-card offer-card">
        <span class="carrier">${escapeHtml(offer.carrier)}<small class="deal"> · ${escapeHtml(offer.offer_title)}</small></span>
        <span class="departure">${escapeHtml(offer.origin_label)} → ${airportNames[offer.destination] || escapeHtml(offer.destination)} · no travel date specified</span>
        <span class="price">From KES ${money(offer.price_kes)}<small>published starting price</small></span>
        <span class="offer-actions">${bookingAction}${sourceAction}</span>
      </article>`;
    }).join("") : '<p class="empty-offers">No recent public offers are listed for this route.</p>';
  } catch (error) {
    statusMessage.textContent = error.message;
  }
}
function decodeKey(value) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function enableAlerts() {
  const button = document.querySelector("#enable-alerts");
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Push alerts are not supported in this browser.");
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const removed = await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: existing.endpoint }),
      });
      if (!removed.ok) throw new Error("Could not disable alerts on this device.");
      await existing.unsubscribe();
      button.textContent = "Enable alerts";
      return;
    }

    const response = await fetch("/api/vapid-public-key");
    if (!response.ok) throw new Error("Push alerts are not configured on this server.");
    const key = await response.text();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: decodeKey(key.trim()),
    });
    const saved = await fetch("/api/subscriptions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    if (!saved.ok) throw new Error("Could not save this device for alerts.");
    button.textContent = "Alerts enabled";
  } catch (error) {
    button.textContent = error.message;
    window.setTimeout(() => { button.textContent = "Enable alerts"; }, 3500);
  }
}

async function updateAlertButton() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) document.querySelector("#enable-alerts").textContent = "Disable alerts";
}

document.querySelector("#search").addEventListener("click", showFares);
document.querySelector("#enable-alerts").addEventListener("click", enableAlerts);
updateAlertButton().catch((error) => console.error("Could not check alert subscription:", error));
loadRoutes().then(showFares).catch((error) => { statusMessage.textContent = error.message; });
