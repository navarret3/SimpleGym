/* ============================================================
   PERSISTENCIA COMPARTIDA — Supabase (con caché local offline-first)
   Rellena estas dos constantes con los datos de tu proyecto Supabase
   (Project Settings > API). Mientras no las rellenes, la app sigue
   funcionando solo con localStorage, como antes.
   ============================================================ */
var STORE_CONFIG = {
  url: "https://crnwaixkmduxnxgqpimb.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNybndhaXhrbWR1eG54Z3FwaW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MTM2MTQsImV4cCI6MjA5ODk4OTYxNH0.SNSfEWX5G0gIDNBV_Qofxy7fXy05Csa_EKMLP7mohi0",
};

var SimpleGymStore = (function () {
  var status = { lastSync: 0, error: false, unsynced: {} };

  function isConfigured() {
    return STORE_CONFIG.url.indexOf("YOUR_SUPABASE_URL") === -1 &&
      STORE_CONFIG.anonKey.indexOf("YOUR_SUPABASE_ANON_KEY") === -1;
  }
  function localKey(userId) { return "simplegym_cache_" + userId; }
  function readLocalCache(userId) {
    try {
      var raw = localStorage.getItem(localKey(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeLocalCache(userId, data) {
    try { localStorage.setItem(localKey(userId), JSON.stringify(data)); } catch (e) {}
  }
  /* Clave antigua de la app de Nava (antes de unificar perfiles). Solo existe para él. */
  function readLegacy(userId) {
    if (userId !== "nava") return null;
    try {
      var raw = localStorage.getItem("planAnualProgresoV1");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function statusText() {
    if (!isConfigured()) return "Datos solo en este dispositivo";
    if (status.error || Object.keys(status.unsynced).length) return "☁ Sin sincronizar · guardado en este dispositivo";
    return status.lastSync ? "☁ Sincronizado" : "☁ Sincronización activa";
  }
  function paintStatus() {
    var el = typeof document !== "undefined" && document.getElementById ? document.getElementById("sync-status") : null;
    if (el) el.textContent = statusText();
  }

  /* Combina lo guardado en dos dispositivos: gana lo más reciente, pero no se
     pierden los registros (historial por fecha) ni los ejercicios creados en el otro. */
  function mergeProgress(older, newer) {
    if (!older || !newer || !older.exercises || !newer.exercises) return newer || older;
    var out = JSON.parse(JSON.stringify(newer));
    Object.keys(older.exercises).forEach(function (key) {
      var o = older.exercises[key], n = out.exercises[key];
      if (!n) { out.exercises[key] = o; if (older.schemes && older.schemes[key]) { out.schemes = out.schemes || {}; out.schemes[key] = older.schemes[key]; } if (older.overrides && older.overrides[key]) { out.overrides = out.overrides || {}; out.overrides[key] = older.overrides[key]; } return; }
      var byDate = {};
      (o.history || []).forEach(function (h) { byDate[h.date] = h; });
      (n.history || []).forEach(function (h) { byDate[h.date] = h; });
      n.history = Object.keys(byDate).sort().map(function (d) { return byDate[d]; }).slice(-40);
    });
    Object.keys(older.custom || {}).forEach(function (day) {
      out.custom = out.custom || {};
      var list = out.custom[day] || [];
      (older.custom[day] || []).forEach(function (id) { if (list.indexOf(id) === -1 && out.exercises[id]) list.push(id); });
      out.custom[day] = list;
    });
    return out;
  }

  async function load(userId) {
    var cached = readLocalCache(userId) || readLegacy(userId);
    if (!isConfigured()) return cached;
    try {
      var res = await fetch(
        STORE_CONFIG.url + "/rest/v1/progress?id=eq." + encodeURIComponent(userId) + "&select=data",
        { headers: { apikey: STORE_CONFIG.anonKey, Authorization: "Bearer " + STORE_CONFIG.anonKey } }
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      var rows = await res.json();
      status.error = false;
      if (rows && rows.length && rows[0].data) {
        var remote = rows[0].data;
        if (cached && cached._ts && remote._ts && cached._ts !== remote._ts) {
          var merged = cached._ts > remote._ts ? mergeProgress(remote, cached) : mergeProgress(cached, remote);
          save(userId, merged);
          return merged;
        }
        if (cached && cached._ts && !remote._ts) { save(userId, cached); return cached; }
        writeLocalCache(userId, remote);
        status.lastSync = Date.now();
        return remote;
      }
      if (cached && cached._ts) save(userId, cached);
      return cached;
    } catch (e) {
      console.warn("SimpleGymStore: sin conexión con Supabase, uso caché local.", e);
      status.error = true;
      return cached;
    }
  }

  var pending = {};
  function push(userId, data) {
    return fetch(STORE_CONFIG.url + "/rest/v1/progress", {
      method: "POST",
      headers: {
        apikey: STORE_CONFIG.anonKey,
        Authorization: "Bearer " + STORE_CONFIG.anonKey,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify([{ id: userId, data: data, updated_at: new Date().toISOString() }]),
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      delete status.unsynced[userId];
      status.error = false;
      status.lastSync = Date.now();
      paintStatus();
    }).catch(function (e) {
      status.unsynced[userId] = true;
      console.warn("SimpleGymStore: no se pudo sincronizar con Supabase.", e);
      paintStatus();
    });
  }

  function save(userId, data) {
    data._ts = Date.now();
    writeLocalCache(userId, data);
    if (!isConfigured()) return;
    clearTimeout(pending[userId]);
    pending[userId] = setTimeout(function () { push(userId, data); }, 600);
  }

  /* Al recuperar la conexión, reenvía lo que se quedó sin subir. */
  function flushUnsynced() {
    Object.keys(status.unsynced).forEach(function (userId) {
      var data = readLocalCache(userId);
      if (data) push(userId, data);
    });
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("online", flushUnsynced);
  }

  return { load: load, save: save, isConfigured: isConfigured, statusText: statusText, mergeProgress: mergeProgress };
})();
