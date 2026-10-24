/* Service worker de SimpleGym: la app funciona sin conexión.
   En cada release sube APP_VERSION aquí y el "?v=" de index.html (deben coincidir;
   lo comprueba tests/run.js). El "?v=" evita que el navegador mezcle archivos
   de dos versiones (p. ej. un engine.js nuevo con un core.js viejo en caché). */
var APP_VERSION = "1.4.1";
var CACHE_VERSION = "simplegym-v" + APP_VERSION;
var ASSETS = ["./", "index.html", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"].concat(
  ["styles.css", "js/store.js", "js/core.js", "js/timer.js", "js/library.js", "js/builders.js", "js/data-nava.js", "js/data-cristian.js", "js/profiles.js", "js/engine.js", "js/app.js"]
    .map(function (f) { return f + "?v=" + APP_VERSION; })
);

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
    fetch(req, { cache: "no-cache" }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match(req, { ignoreSearch: true }); })
        .then(function (hit) { return hit || caches.match("index.html"); });
    })
  );
});
