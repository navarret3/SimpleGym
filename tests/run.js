/* Tests de la lógica de SimpleGym sin navegador ni dependencias:
   node tests/run.js
   Carga los mismos archivos de js/ en un contexto con un DOM de mentira,
   una fecha fija y un fetch que nunca sale a la red. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var ROOT = path.join(__dirname, "..");
var FILES = ["store", "core", "timer", "library", "builders", "data-nava", "profiles", "engine", "app"];

function makeContext(nowISO) {
  var storage = {};
  var els = {};
  var FixedNow = new Date(nowISO).getTime();
  function FakeDate() {
    var a = arguments;
    if (a.length === 0) return new Date(FixedNow);
    return new (Function.prototype.bind.apply(Date, [null].concat(Array.prototype.slice.call(a))))();
  }
  FakeDate.prototype = Date.prototype;
  FakeDate.now = function () { return FixedNow; };
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  var ctx = {
    console: console,
    Date: FakeDate,
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    fetch: function () { return Promise.reject(new Error("sin red en tests")); },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
      setItem: function (k, v) { storage[k] = String(v); },
      removeItem: function (k) { delete storage[k]; },
    },
    location: { search: "" },
    document: {
      body: { style: {} },
      getElementById: function (id) {
        return els[id] || (els[id] = { value: "", innerHTML: "", style: {}, focus: function () {}, addEventListener: function () {} });
      },
    },
    navigator: {},
  };
  ctx.window = ctx;
  ctx.__els = els;
  ctx.__storage = storage;
  vm.createContext(ctx);
  return ctx;
}

function load(ctx, files) {
  files.forEach(function (f) {
    var file = path.join(ROOT, "js", f + ".js");
    if (!fs.existsSync(file)) return;
    var code = fs.readFileSync(file, "utf8");
    // boot() arranca la app; en tests se llama a mano
    if (f === "app") code = code.replace(/\nboot\(\);\s*$/, "\n");
    vm.runInContext(code, ctx, { filename: file });
  });
}

var tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

function freshApp(initial, nowISO) {
  var ctx = makeContext(nowISO || "2026-10-21T12:00:00");
  load(ctx, FILES);
  ctx.__initial = initial || null;
  vm.runInContext('initProfileApp(PROFILES.nava.config, __initial)', ctx);
  return ctx;
}
function saved(ctx, id) { return JSON.parse(ctx.__storage["simplegym_cache_" + (id || "nava")]); }
function setLog(ctx, w, r) { ctx.__els["inp-weight"] = { value: String(w) }; ctx.__els["inp-reps"] = { value: String(r) }; }

/* ---------- utilidades y fases ---------- */
test("dateISO usa la fecha local, no UTC", function () {
  var ctx = makeContext("2026-10-21T12:00:00");
  load(ctx, ["core"]);
  assert.strictEqual(vm.runInContext('dateISO(new Date(2026, 9, 21, 0, 30))', ctx), "2026-10-21");
});

test("getPhase detecta la fase de Nava por fecha", function () {
  var ctx = freshApp();
  assert.strictEqual(vm.runInContext('getPhase(NAVA_CONFIG.phases, "2026-10-21").tag', ctx), "Volumen");
  assert.strictEqual(vm.runInContext('getPhase(NAVA_CONFIG.phases, "2026-10-15").tag', ctx), "Recuperación");
});

test("buildCyclePhases: 52 semanas contiguas, descarga cada 6ª", function () {
  var ctx = freshApp();
  var phases = vm.runInContext('buildCyclePhases("#C8FF00")', ctx);
  var days = 0;
  phases.forEach(function (p, i) {
    var d = (new Date(p.end + "T00:00:00") - new Date(p.start + "T00:00:00")) / 86400000 + 1;
    days += d;
    if (i > 0) {
      var gap = (new Date(p.start + "T00:00:00") - new Date(phases[i - 1].end + "T00:00:00")) / 86400000;
      assert.strictEqual(gap, 1, "fases contiguas");
    }
  });
  assert.strictEqual(days, 364);
  assert.strictEqual(phases[1].tag, "Recuperación");
  assert.strictEqual(phases[0].tag, "Progresión");
});

/* ---------- plantillas ---------- */
test("todas las plantillas generan configs válidas", function () {
  var ctx = freshApp();
  var res = vm.runInContext(
    '(function(){ var out = {}; Object.keys(TEMPLATES).forEach(function(k){' +
    ' var c = buildConfig("t-" + k, "Test", "#C8FF00", k);' +
    ' var ids = {}, bad = [];' +
    ' c.days.forEach(function(d){ d.exercises.forEach(function(e){ if (ids[e.id]) bad.push("dup " + e.id); ids[e.id] = 1; if (!muscleColors[e.muscle]) bad.push("musculo " + e.muscle); if (!e.repMax || e.repMax < e.repsPattern[0]) bad.push("rango " + e.name); }); });' +
    ' out[k] = { days: c.days.length, bad: bad, weekdays: Object.keys(c.dayIdsByWeekday).length }; }); return JSON.stringify(out); })()', ctx);
  res = JSON.parse(res);
  Object.keys(res).forEach(function (k) {
    assert.deepStrictEqual(res[k].bad, [], k);
    assert.strictEqual(res[k].days, res[k].weekdays, k);
  });
  assert.strictEqual(res.ppl6.days, 6);
  assert.strictEqual(res.upperlower4.days, 4);
});

test("los ejercicios de las plantillas están en la biblioteca", function () {
  var ctx = freshApp();
  var missing = vm.runInContext(
    '(function(){ var m = []; Object.keys(DAY_BLOCKS).forEach(function(b){ DAY_BLOCKS[b].rows.forEach(function(r){ var lib = findLibraryExercise(r[0]); if (!lib) m.push(r[0]); else if (lib.muscle !== r[1]) m.push(r[0] + " (" + lib.muscle + " vs " + r[1] + ")"); }); }); return JSON.stringify(m); })()', ctx);
  assert.deepStrictEqual(JSON.parse(missing), []);
});

/* ---------- motor: bugs de la v1.0.0 ---------- */
test("migra overrides congelados a esquema vivo y conserva el progreso", function () {
  var ctx = freshApp({ exercises: { "lun-press-banca": { top: 65, history: [] } }, overrides: { "lun-press-banca": { name: "Press Banca Barra", muscle: "Pecho", sets: [{ reps: "12", weight: "50 kg" }, { reps: "8", weight: "57.5 kg" }, { reps: "4", weight: "70 kg" }] } }, removed: {}, custom: {} });
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleCheck("lun-press-banca");
  var d = saved(ctx);
  assert.deepStrictEqual(d.schemes["lun-press-banca"], { repsPattern: [12, 8, 4], offsets: [-20, -12.5, 0] });
  assert.strictEqual(d.exercises["lun-press-banca"].top, 70);
  assert.ok(!d.overrides["lun-press-banca"].sets);
});

test("se puede registrar en ejercicios de peso corporal y personalizados", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleExpand("lun-fondos");
  setLog(ctx, "", 10);
  ctx.app_saveLog("lun-fondos");
  var d = saved(ctx);
  assert.strictEqual(d.exercises["lun-fondos"].history[0].reps, 10);
  assert.strictEqual(d.exercises["lun-fondos"].top, 0);
  ctx.app_addExercise("lunes");
  var id = d.custom && saved(ctx).custom.lunes[0];
  setLog(ctx, 30, 16);
  ctx.app_saveLog(id);
  var e = saved(ctx).exercises[id];
  // hipertrofia: 30 kg mostrados = base 37.5; 16 reps = objetivo (10 x 1.6) -> sube un escalón de 2.5
  assert.strictEqual(e.top, 40);
});

test("editar a mano no congela: el peso registrado sigue moviendo el peso base", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_updateSetField("lun-jalon-pecho", 0, "weight", "20");
  var d = saved(ctx);
  assert.strictEqual(d.schemes["lun-jalon-pecho"].offsets[0], -47);
  ctx.app_toggleExpand("lun-jalon-pecho");
  setLog(ctx, 70, 4);
  ctx.app_saveLog("lun-jalon-pecho");
  d = saved(ctx);
  // hipertrofia: peso mostrado = base * 0.8 -> base = 87.5; reps objetivo 6 > 4 -> no sube escalón
  assert.strictEqual(d.exercises["lun-jalon-pecho"].top, 87.5);
});

test("la descarga no modifica el peso base", function () {
  var ctx = freshApp(null, "2026-10-15T12:00:00");
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleExpand("lun-press-banca");
  setLog(ctx, 50, 12);
  ctx.app_saveLog("lun-press-banca");
  assert.strictEqual(saved(ctx).exercises["lun-press-banca"].top, 65);
});

test("los checks del día persisten y caducan al cambiar de fecha", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleCheck("lun-press-banca");
  var d = saved(ctx);
  assert.strictEqual(d.session.date, "2026-10-21");
  var ctx2 = freshApp(d);
  ctx2.app_setActiveDay("lunes");
  assert.ok(/1\/\d+ HECHOS/.test(ctx2.__els.app.innerHTML), "mismo día: conserva el check");
  var ctx3 = freshApp(d, "2026-10-22T12:00:00");
  ctx3.app_setActiveDay("lunes");
  assert.ok(/0\/\d+ HECHOS/.test(ctx3.__els.app.innerHTML), "día siguiente: checks vacíos");
});

test("reordenar ejercicios guarda el orden por día", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_moveExercise("lun-fondos", -1);
  var order = saved(ctx).order.lunes;
  assert.ok(order.indexOf("lun-fondos") < order.indexOf("lun-curl-ez"));
  ctx.app_moveExercise("lun-press-banca", -1); // ya es el primero: no cambia
  assert.strictEqual(saved(ctx).order.lunes[0], "lun-press-banca");
});

/* ---------- motor: doble progresión ---------- */
function templateProfile(ctx) {
  vm.runInContext('PROFILES.t = { label: "T", sub: "t", color: "#C8FF00", config: buildConfig("t", "T", "#C8FF00", "upperlower4") };', ctx);
}
function freshTemplateApp(initial, nowISO) {
  var ctx = makeContext(nowISO || "2026-10-21T12:00:00");
  load(ctx, FILES);
  templateProfile(ctx);
  ctx.__initial = initial || null;
  vm.runInContext('initProfileApp(PROFILES.t.config, __initial)', ctx);
  return ctx;
}

test("doble progresión: llegar al máximo del rango sube el peso base", function () {
  var ctx = freshTemplateApp();
  var day = vm.runInContext('PROFILES.t.config.days[0].id', ctx);
  var key = day + "-e0"; // press banca 6-10, salto 2.5
  ctx.app_setActiveDay(day);
  ctx.app_toggleExpand(key);
  setLog(ctx, 60, 10);
  ctx.app_saveLog(key, true);
  assert.strictEqual(saved(ctx, "t").exercises[key].top, 62.5);
  setLog(ctx, 62.5, 8);
  ctx.app_saveLog(key);
  var d = saved(ctx, "t");
  assert.strictEqual(d.exercises[key].top, 62.5, "sin llegar al máximo repite el peso");
  assert.strictEqual(d.exercises[key].history.length, 1, "el mismo día se sobrescribe");
});

test("aviso de estancamiento y bajada del 10 %", function () {
  var ctx0 = freshTemplateApp();
  var day = vm.runInContext('PROFILES.t.config.days[0].id', ctx0);
  var key = day + "-e0";
  var init = { exercises: {}, overrides: {}, removed: {}, custom: {}, schemes: {}, order: {} };
  init.exercises[key] = { top: 60, history: [{ date: "2026-10-14", weight: 60, reps: 7, hit: false }] };
  var ctx = freshTemplateApp(init);
  ctx.app_setActiveDay(day);
  ctx.app_toggleExpand(key);
  setLog(ctx, 60, 7);
  ctx.app_saveLog(key);
  ctx.app_toggleExpand(key);
  assert.ok(ctx.__els.app.innerHTML.indexOf("estancado") !== -1);
  ctx.app_applyDeload(key);
  var e = saved(ctx, "t").exercises[key];
  assert.strictEqual(e.top, 54);
  assert.ok(e.deloadAt);
  assert.ok(ctx.__els.app.innerHTML.indexOf("estancado") === -1);
});

test("escribir un rango en el modo edición convierte el ejercicio a doble progresión", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_updateSetField("lun-press-banca", 0, "reps", "6-10");
  var s = saved(ctx).schemes["lun-press-banca"];
  assert.strictEqual(s.repMax, 10);
  assert.deepStrictEqual(s.repsPattern, [6, 6, 6, 6]);
});


/* ---------- fase 3: calendario, series semanales, alternativas ---------- */
test("mover un día de la semana intercambia con el ocupado", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_setDayWeekday("lunes", 2);
  var sch = saved(ctx).schedule;
  assert.strictEqual(sch.lunes, 2);
  assert.strictEqual(sch.martes, 1);
  ctx.app_setDayWeekday("lunes", 3); // miércoles libre: solo se mueve
  assert.strictEqual(saved(ctx).schedule.lunes, 3);
});

test("el calendario movido sobrevive a recargar y decide el día de hoy", function () {
  var ctx = freshApp();
  ctx.app_setDayWeekday("jueves", 3); // pierna pasa a miércoles (el 21 oct 2026 es miércoles)
  var ctx2 = freshApp(saved(ctx));
  assert.ok(ctx2.__els.app.innerHTML.indexOf("PIERNA") !== -1 || ctx2.__els.app.innerHTML.indexOf("JUEVES") !== -1);
  assert.ok(ctx2.__els.app.innerHTML.indexOf("Hoy es día de descanso") === -1, "hoy (miércoles) ya es día de entreno");
});

test("series semanales por músculo y alternativas en el modo edición", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  assert.ok(ctx.__els.app.innerHTML.indexOf("SERIES SEMANALES POR MÚSCULO") !== -1);
  ctx.app_toggleEditMode();
  ctx.app_toggleExpand("lun-press-banca");
  var html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf("Sustituir por") !== -1);
  assert.ok(html.indexOf("Press Inclinado Mancuerna · Mancuernas") !== -1, "ofrece alternativas del mismo músculo con su material");
});


/* ---------- fase 5: sincronización ---------- */
test("mergeProgress conserva los registros de ambos dispositivos", function () {
  var ctx = freshApp();
  var res = vm.runInContext('JSON.stringify(SimpleGymStore.mergeProgress(' +
    '{ exercises: { a: { top: 50, history: [{ date: "2026-10-01", weight: 50, reps: 8 }, { date: "2026-10-05", weight: 50, reps: 9 }] }, solo: { top: 10, history: [] } }, custom: { d1: ["solo"] }, schemes: { solo: { repsPattern: [10], offsets: [0] } } },' +
    '{ exercises: { a: { top: 52.5, history: [{ date: "2026-10-05", weight: 52.5, reps: 8 }, { date: "2026-10-08", weight: 52.5, reps: 10 }] } }, custom: {} }))', ctx);
  var m = JSON.parse(res);
  assert.strictEqual(m.exercises.a.top, 52.5, "gana lo más reciente");
  assert.deepStrictEqual(m.exercises.a.history.map(function (h) { return h.date; }), ["2026-10-01", "2026-10-05", "2026-10-08"]);
  assert.strictEqual(m.exercises.a.history[1].weight, 52.5, "misma fecha: manda lo más reciente");
  assert.ok(m.exercises.solo && m.schemes.solo && m.custom.d1[0] === "solo", "ejercicio creado en el otro dispositivo");
});

test("un perfil nuevo no lee la clave antigua de otra persona", function () {
  var ctx = makeContext("2026-10-21T12:00:00");
  ctx.localStorage.setItem("gymAmigoProgresoV1", JSON.stringify({ exercises: { x: 1 } }));
  load(ctx, ["store"]);
  return vm.runInContext('SimpleGymStore.load("otra-persona")', ctx).then(function (v) { assert.strictEqual(v, null); });
});

/* ---------- ejecución ---------- */
(async function () {
  var failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    try {
      await t.fn();
      console.log("  ✓ " + t.name);
    } catch (e) {
      failed++;
      console.log("  ✗ " + t.name + "\n      " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n      ") : e));
    }
  }
  console.log("\n" + (tests.length - failed) + "/" + tests.length + " tests OK");
  process.exit(failed ? 1 : 0);
})();
