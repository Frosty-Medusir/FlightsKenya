const CACHE = "flights-kenya-v2";
const APP_SHELL = [
  "/", "/styles.css", "/app.js", "/manifest.json", "/logo.png",
  "/favicon.png", "/privacy.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
self.addEventListener("push", (event) => {
  let message = { title: "Flight fare update", body: "A new fare deal is available.", url: "/" };
  if (event.data) {
    try { message = { ...message, ...event.data.json() }; } catch { /* use the default message */ }
  }
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body, icon: "/favicon.png", data: { url: message.url },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
