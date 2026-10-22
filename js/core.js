/* ============================================================
   UTILIDADES COMPARTIDAS — usadas por todas las rutinas.
   ============================================================ */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function round(n) { return Math.round(n * 100) / 100; }
function dateISO(d) {
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function todayISO() { return dateISO(new Date()); }
function formatDateEs(iso) {
  var d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

var CHECK_SVG = '<svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4.5L4 7.5L10 1" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5L6 8L10 4.5" stroke="rgba(255,255,255,0.5)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ============================================================
   MOTOR DE PERIODIZACIÓN COMPARTIDO
   Cualquier rutina define sus propias "phases" (con fecha de
   inicio/fin y un "tag" de esta lista) y el motor adapta solo
   series/reps/peso — no hace falta escribir el año entero a
   mano, ni tocar este motor al crear una rutina nueva.
   ============================================================ */
var PHASE_PROFILES = {
  "Progresión":       { key: "fuerza",        label: "Fuerza",        repsMult: 1,   weightMult: 1,    setsDelta: 0 },
  "Volumen":          { key: "hipertrofia",   label: "Hipertrofia",   repsMult: 1.6, weightMult: 0.8,  setsDelta: 1 },
  "Recuperación":     { key: "descarga",      label: "Descarga",      repsMult: 1,   weightMult: 0.88, setsDelta: -1 },
  "Mantenimiento":    { key: "mantenimiento", label: "Mantenimiento", repsMult: 1,   weightMult: 1,    setsDelta: 0 },
  "Test de progreso": { key: "test",          label: "Test",          repsMult: 0.7, weightMult: 1.05, setsDelta: -1 },
};
function getPhaseProfile(tag) { return PHASE_PROFILES[tag] || PHASE_PROFILES["Progresión"]; }
function getPhase(phases, dateISO) {
  var t = new Date(dateISO + "T00:00:00").getTime();
  var first = new Date(phases[0].start + "T00:00:00").getTime();
  if (t < first) return phases[0];
  for (var i = 0; i < phases.length; i++) {
    var p = phases[i];
    var s = new Date(p.start + "T00:00:00").getTime();
    var e = new Date(p.end + "T23:59:59").getTime();
    if (t >= s && t <= e) return p;
  }
  return phases[phases.length - 1];
}
function getWeekNumber(phases, dateISO) {
  var start = new Date(phases[0].start + "T00:00:00").getTime();
  var t = new Date(dateISO + "T00:00:00").getTime();
  var diff = Math.floor((t - start) / 86400000);
  return Math.min(52, Math.max(1, Math.floor(diff / 7) + 1));
}
function trainingDayForToday(dayIdsByWeekday) {
  return dayIdsByWeekday[new Date().getDay()] || null;
}
function nextTrainingDay(dayIdsByWeekday, fromJsDay) {
  for (var add = 1; add <= 7; add++) {
    var d = (fromJsDay + add) % 7;
    if (dayIdsByWeekday[d]) return dayIdsByWeekday[d];
  }
  var firstKey = Object.keys(dayIdsByWeekday)[0];
  return dayIdsByWeekday[firstKey];
}
