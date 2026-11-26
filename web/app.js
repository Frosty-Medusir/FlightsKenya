const airportNames = {
  NBO: "Nairobi · JKIA", WIL: "Nairobi · Wilson", MBA: "Mombasa",
  UKA: "Ukunda", MYD: "Malindi", KIS: "Kisumu", EDL: "Eldoret",
};
const originSelect = document.querySelector("#origin");
const destinationSelect = document.querySelector("#destination");
const fareList = document.querySelector("#fare-list");
const statusMessage = document.querySelector("#status");

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
  destinationSelect.innerHTML = routes.filter((route) => route.origin === originSelect.value)
    .map((route) => option(route.destination)).join("");
}
function money(amount) {
  return new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(amount);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
async function showFares() {
  fareList.replaceChildren();
  statusMessage.textContent = "Looking for available fares…";
  const origin = originSelect.value;
  const destination = destinationSelect.value;
  document.querySelector("#route-title").textContent = `${origin} → ${destination}`;
  const params = new URLSearchParams({ origin, destination });
  try {
    const response = await fetch(`/api/fares?${params}`);
    if (!response.ok) throw new Error("Fare data is temporarily unavailable.");
    const fares = await response.json();
    if (!fares.length) {
      statusMessage.textContent = "No fares yet. Add a configured feed to start comparing this route.";
      document.querySelector("#median-label").textContent = "";
      return;
    }
    statusMessage.textContent = `${fares.length} available fare${fares.length === 1 ? "" : "s"}`;
    const median = fares.find((fare) => fare.median_60d_kes !== null)?.median_60d_kes;
    document.querySelector("#median-label").textContent = median
      ? `60-day median · KES ${money(median)}` : "Collecting history for route median";
    fareList.innerHTML = fares.map((fare) => {
      const when = new Date(fare.departure).toLocaleString("en-KE", {
        weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });
      return `<article class="fare-card">
        <span class="carrier">${escapeHtml(fare.carrier)}${fare.below_median ? '<small class="deal"> · Below median</small>' : ""}</span>
        <span class="departure">${when}</span>
        <span class="price">KES ${money(fare.price_kes)}<small>one way</small></span>
      </article>`;
    }).join("");
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
    const response = await fetch("/vapid-public-key");
    if (!response.ok) throw new Error("Push alerts are not configured on this server.");
    const key = await response.text();
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("Push alerts are not supported in this browser.");
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
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
document.querySelector("#search").addEventListener("click", showFares);
document.querySelector("#enable-alerts").addEventListener("click", enableAlerts);
loadRoutes().then(showFares).catch((error) => { statusMessage.textContent = error.message; });
