/* ============================================================
   TEMPORIZADOR DE DESCANSO ("modo gimnasio")
   Vive fuera de #app para que sobreviva a los re-renders. Se arranca al
   marcar un ejercicio como hecho o al registrar lo que has hecho.
   ============================================================ */
var RestTimer = (function () {
  var endAt = 0;
  var interval = null;
  var finished = false;

  function el() { return document.getElementById("rest-timer"); }
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
  function left() { return Math.max(0, Math.round((endAt - Date.now()) / 1000)); }

  function paint() {
    var e = el();
    if (!e) return;
    if (!endAt) { e.style.display = "none"; return; }
    e.style.display = "flex";
    var t = e.querySelector ? e.querySelector(".rt-time") : null;
    var l = left();
    if (t) t.textContent = l > 0 ? fmt(l) : "¡A por la siguiente!";
    if (l === 0 && !finished) {
      finished = true;
      try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([200, 100, 200]); } catch (err) {}
    }
  }

  function start(seconds) {
    var e = el();
    if (!e) return;
    endAt = Date.now() + seconds * 1000;
    finished = false;
    e.innerHTML = '<div class="rt-label">DESCANSO</div><div class="rt-time"></div>' +
      '<div class="rt-btn" onclick="RestTimer.add(-15)">−15</div>' +
      '<div class="rt-btn" onclick="RestTimer.add(30)">+30</div>' +
      '<div class="rt-btn rt-stop" onclick="RestTimer.stop()">✕</div>';
    clearInterval(interval);
    interval = setInterval(paint, 500);
    paint();
  }

  function add(delta) {
    if (!endAt) return;
    endAt += delta * 1000;
    finished = false;
    paint();
  }

  function stop() {
    endAt = 0;
    clearInterval(interval);
    paint();
  }

  return { start: start, add: add, stop: stop };
})();
