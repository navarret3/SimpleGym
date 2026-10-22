/* Service worker de SimpleGym: la app funciona sin conexión.
   Sube CACHE_VERSION en cada release para que los móviles recojan los cambios. */
var CACHE_VERSION = "simplegym-v1.1.0";
var ASSETS = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "js/store.js", "js/core.js", "js/timer.js", "js/library.js", "js/builders.js", "js/data-nava.js", "js/profiles.js", "js/engine.js", "js/app.js",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE_VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Solo archivos propios: lo de Supabase (otro origen) va siempre a la red. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || caches.match("index.html"); }); })
  );
});
