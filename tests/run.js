/* Tests de la lógica de SimpleGym sin navegador ni dependencias:
   node tests/run.js
   Carga los mismos archivos de js/ en un contexto con un DOM de mentira,
   una fecha fija y un fetch que nunca sale a la red. */
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var ROOT = path.join(__dirname, "..");
var FILES = ["store", "core", "timer", "library", "builders", "data-nava", "data-cristian", "profiles", "engine", "app"];

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
    confirm: function () { return true; },
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
  assert.strictEqual(vm.runInContext('getPhase(NAVA_CONFIG.phases, "2027-03-10").tag', ctx), "Volumen");
  assert.strictEqual(vm.runInContext('getPhase(NAVA_CONFIG.phases, "2026-12-01").tag', ctx), "Recuperación");
  assert.strictEqual(vm.runInContext('getPhase(NAVA_CONFIG.phases, "2026-12-25").tag', ctx), "Mantenimiento");
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
  // el plan v2 sustituye el esquema por el rango de reps y convierte el peso (70 kg a 4 reps -> ~65 kg para 6-10)
  assert.ok(!d.schemes["lun-press-banca"]);
  assert.strictEqual(d.exercises["lun-press-banca"].top, 65);
  assert.ok(!d.overrides["lun-press-banca"].sets);
  assert.strictEqual(d.planVersion, 2);
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
  assert.strictEqual(e.history[0].weight, 30);
  assert.strictEqual(e.top, 0, "registrar no cambia los pesos de la rutina");
});

test("sin progresión: registrar guarda historial pero los pesos solo cambian a mano", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleExpand("lun-press-banca");
  setLog(ctx, 70, 10);
  ctx.app_saveLog("lun-press-banca");
  var d = saved(ctx);
  assert.strictEqual(d.exercises["lun-press-banca"].top, 60);
  assert.strictEqual(d.exercises["lun-press-banca"].history[0].weight, 70);
  setLog(ctx, 72.5, 9);
  ctx.app_saveLog("lun-press-banca");
  assert.strictEqual(saved(ctx).exercises["lun-press-banca"].history.length, 1, "el mismo día se sobrescribe");
  ctx.app_updateSetField("lun-press-banca", 2, "weight", "62.5");
  assert.strictEqual(saved(ctx).exercises["lun-press-banca"].top, 62.5, "editar a mano sí cambia el peso");
});

test("las fases ya no modifican series, reps ni pesos", function () {
  var desc = freshApp(null, "2026-12-01T12:00:00"); // antes semana de descarga
  desc.app_setActiveDay("lunes");
  desc.app_toggleExpand("lun-press-banca");
  var html = desc.__els.app.innerHTML;
  assert.ok(html.indexOf("3 series · 6–10 reps") !== -1);
  assert.ok(html.indexOf("60 kg") !== -1);
  assert.ok(html.indexOf("MODO") === -1 && html.indexOf("REGLA DE PROGRESIÓN") === -1);
});

test("sin textos explicativos: cabecera, descanso, foco ni notas", function () {
  var ctx = freshApp(null, "2026-10-21T12:00:00"); // miércoles: día de descanso
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleExpand("lun-press-banca");
  var html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf("Hoy es día de descanso") === -1);
  assert.ok(html.indexOf("ESPECIALIZACIÓN TREN SUPERIOR") === -1);
  assert.ok(html.indexOf("Escápulas atrás") === -1, "sin nota del ejercicio");
  assert.ok(html.indexOf("Técnica antes que ego") === -1, "sin foco del día");
  assert.ok(html.indexOf("la evidencia apunta") === -1);
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

/* ---------- modo edición ---------- */
test("modo edición: sin check, desplegado, añadir arriba y sin sustituir", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleEditMode();
  var html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf('class="chk"') === -1, "sin check de hecho");
  assert.ok(html.indexOf("pyrow-edit") !== -1, "series visibles sin desplegar");
  assert.ok(html.indexOf("Añadir ejercicio") < html.indexOf('class="excard"'), "añadir ejercicio va arriba");
  assert.ok(html.indexOf("Sustituir por") === -1);
  assert.ok(html.indexOf("datalist") === -1 && html.indexOf('list="') === -1, "nombre editable sin desplegable");
  ctx.app_toggleEditMode();
  assert.ok(ctx.__els.app.innerHTML.indexOf('class="chk"') !== -1, "fuera de edición vuelve el check");
});

test("modo edición: cambiar el nombre a mano no toca el músculo", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_updateExerciseName("lun-press-banca", "Curl Barra EZ");
  var ov = saved(ctx).overrides["lun-press-banca"];
  assert.strictEqual(ov.name, "Curl Barra EZ");
  assert.strictEqual(ov.muscle, "Pecho");
});

test("modo edición: renombrar el día persiste y se ve en la visión semanal", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_updateDayName("lunes", "fullName", "Empuje pesado");
  ctx.app_updateDayName("lunes", "type", "PUSH");
  var d = saved(ctx);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.dayNames.lunes)), { fullName: "Empuje pesado", type: "PUSH" });
  var ctx2 = freshApp(d);
  ctx2.app_setActiveDay("lunes");
  var html = ctx2.__els.app.innerHTML;
  assert.ok(html.indexOf("Empuje pesado") !== -1 && html.indexOf("PUSH") !== -1);
  ctx2.app_updateDayName("lunes", "fullName", "");
  ctx2.app_updateDayName("lunes", "type", "");
  assert.ok(!saved(ctx2).dayNames.lunes, "vacío vuelve al nombre original");
});

test("escribir un rango en el modo edición lo aplica a todas las series", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_updateSetField("lun-press-banca", 0, "reps", "6-10");
  var s = saved(ctx).schemes["lun-press-banca"];
  assert.strictEqual(s.repMax, 10);
  assert.deepStrictEqual(s.repsPattern, [6, 6, 6]);
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

test("panel de series semanales por músculo", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  assert.ok(ctx.__els.app.innerHTML.indexOf("SERIES SEMANALES POR MÚSCULO") !== -1);
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


/* ---------- plan v2 de Nava ---------- */
test("el plan de Nava es coherente: ids únicos, músculos válidos y fases contiguas", function () {
  var ctx = freshApp();
  var r = JSON.parse(vm.runInContext('(function(){ var ids = {}, bad = [];' +
    ' NAVA_CONFIG.days.forEach(function(d){ d.exercises.forEach(function(e){ if (ids[e.id]) bad.push("dup " + e.id); ids[e.id] = 1; if (!muscleColors[e.muscle]) bad.push("musculo " + e.muscle); if (e.trackable && (!e.repMax || e.repMax < e.repsPattern[0])) bad.push("rango " + e.id); }); });' +
    ' var gaps = []; NAVA_CONFIG.phases.forEach(function(p, i){ if (i) { var g = (new Date(p.start + "T00:00:00") - new Date(NAVA_CONFIG.phases[i-1].end + "T00:00:00")) / 86400000; if (g !== 1) gaps.push(p.name); } });' +
    ' return JSON.stringify({ bad: bad, gaps: gaps, start: NAVA_CONFIG.phases[0].start, end: NAVA_CONFIG.phases[NAVA_CONFIG.phases.length-1].end, days: NAVA_CONFIG.days.length }); })()', ctx));
  assert.deepStrictEqual(r.bad, []);
  assert.deepStrictEqual(r.gaps, []);
  assert.strictEqual(r.start, "2026-10-22");
  assert.strictEqual(r.end, "2027-06-30");
  assert.strictEqual(r.days, 4);
});

test("cambio de plan: convierte tus pesos antiguos una sola vez y no toca ejercicios sin historial", function () {
  var old = { exercises: { "lun-press-banca": { top: 65, history: [{ date: "2026-10-12", weight: 65, reps: 4 }] }, "jue-sentadilla": { top: 100, history: [] } }, overrides: {}, removed: {}, custom: {}, order: { lunes: ["lun-fondos"] } };
  var ctx = freshApp(old);
  ctx.app_setActiveDay("lunes");
  ctx.app_toggleCheck("lun-press-banca");
  var d = saved(ctx);
  assert.strictEqual(d.exercises["lun-press-banca"].top, 60, "65 kg x 4 reps -> 60 kg para 7 reps");
  assert.strictEqual(d.exercises["jue-sentadilla"].top, 95);
  assert.strictEqual(d.exercises["lun-press-banca"].history.length, 1, "se conserva el historial");
  assert.strictEqual(d.exercises["mar-pullover"].top, 27.5, "sin datos previos: peso inicial del plan");
  assert.deepStrictEqual(d.order, {}, "el orden antiguo se reinicia");
  var ctxAgain = freshApp(d);
  ctxAgain.app_setActiveDay("lunes");
  ctxAgain.app_toggleCheck("lun-press-banca");
  var again = saved(ctxAgain);
  assert.strictEqual(again.exercises["lun-press-banca"].top, 60, "no se convierte dos veces");
});

test("no hay aviso de días sin entrenar", function () {
  var old = { planVersion: 2, exercises: { "lun-press-banca": { top: 60, history: [{ date: "2026-10-05", weight: 60, reps: 8 }] } }, overrides: {}, removed: {}, custom: {}, schemes: {}, order: {}, schedule: {} };
  var ctx = freshApp(old, "2026-10-21T12:00:00"); // 16 días después
  assert.ok(ctx.__els.app.innerHTML.indexOf("sin registrar entrenos") === -1);
});


/* ---------- perfil de Cristian ---------- */
test("el perfil de Cristian está registrado y su rutina es válida", function () {
  var ctx = freshApp();
  var r = JSON.parse(vm.runInContext('(function(){ var ids = {}, bad = [];' +
    ' CRISTIAN_CONFIG.days.forEach(function(d){ d.exercises.forEach(function(e){ if (ids[e.id]) bad.push("dup " + e.id); ids[e.id] = 1; if (!muscleColors[e.muscle]) bad.push("musculo " + e.muscle); }); });' +
    ' return JSON.stringify({ bad: bad, reg: !!PROFILES.cristian, stat: !!STATIC_PROFILE_IDS.cristian, days: CRISTIAN_CONFIG.days.length }); })()', ctx));
  assert.deepStrictEqual(r.bad, []);
  assert.ok(r.reg && r.stat);
  assert.strictEqual(r.days, 5);
});

test("Cristian recupera su progreso antiguo y puede registrar en cualquier ejercicio", function () {
  var ctx = makeContext("2026-10-21T12:00:00");
  load(ctx, FILES);
  ctx.__initial = { exercises: { "a-lun-press-banca": { top: 60, history: [{ date: "2026-10-12", weight: 60, reps: 6 }] } }, overrides: {}, removed: {}, custom: {} };
  var firstDay = vm.runInContext('CRISTIAN_CONFIG.days[0].id', ctx);
  vm.runInContext('initProfileApp(PROFILES.cristian.config, __initial)', ctx);
  ctx.app_setActiveDay(firstDay);
  var ex = vm.runInContext('CRISTIAN_CONFIG.days[0].exercises[0].id', ctx);
  ctx.app_toggleExpand(ex);
  setLog(ctx, 20, 10);
  ctx.app_saveLog(ex);
  var d = JSON.parse(ctx.__storage["simplegym_cache_cristian"]);
  assert.strictEqual(d.exercises[ex].history.length >= 1, true);
});

test("la pantalla de inicio es el selector aunque haya un perfil recordado", async function () {
  var ctx = makeContext("2026-10-21T12:00:00");
  load(ctx, FILES);
  ctx.localStorage.setItem("simplegym_current_user", "nava");
  await vm.runInContext("boot()", ctx);
  var html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf("¿Quién eres?") !== -1);
  assert.ok(html.indexOf("Nava") !== -1 && html.indexOf("Cristian") !== -1);
  assert.ok(html.indexOf("ÚLTIMO USADO") !== -1);
  ctx.location.search = "?u=cristian";
  await vm.runInContext("boot()", ctx);
  assert.ok(ctx.__els.app.innerHTML.indexOf("¿Quién eres?") === -1, "con ?u= entra directo");
});

/* ---------- añadir y quitar días de entreno ---------- */
test("añadir un día de entreno en un día libre, con ejercicios, y que persista", function () {
  var ctx = freshApp(); // 21 oct 2026: miércoles, día libre en el plan de Nava
  ctx.app_toggleEditMode();
  assert.ok(ctx.__els.app.innerHTML.indexOf("app_addDay(3)") !== -1, "el miércoles libre se puede añadir");
  ctx.app_addDay(3);
  var d = saved(ctx);
  assert.strictEqual(d.customDays.length, 1);
  var id = d.customDays[0].id;
  assert.strictEqual(d.customDays[0].weekday, 3);
  ctx.app_addExercise(id);
  var d2 = saved(ctx);
  assert.strictEqual(d2.custom[id].length, 1);
  var ctx2 = freshApp(d2); // al recargar, hoy (miércoles) es ese día
  var html = ctx2.__els.app.innerHTML;
  assert.ok(html.indexOf("MIÉRCOLES") !== -1 && html.indexOf("Nuevo ejercicio") !== -1);
  assert.ok(html.indexOf("Miércoles") !== -1 && html.indexOf("ENTRENO") !== -1, "aparece en la visión semanal");
  ctx.app_addDay(1); // lunes ya ocupado: no hace nada
  assert.strictEqual(saved(ctx).customDays.length, 1);
});

test("quitar días de entreno: del perfil y añadidos, nunca el último", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("viernes");
  ctx.app_removeDay("viernes");
  var d = saved(ctx);
  assert.strictEqual(d.removedDays.viernes, true);
  ctx.app_toggleEditMode();
  assert.ok(ctx.__els.app.innerHTML.indexOf("app_addDay(5)") !== -1, "el viernes queda libre para añadir otro");
  ctx.app_addDay(5);
  var id = saved(ctx).customDays[0].id;
  ctx.app_addExercise(id);
  ctx.app_removeDay(id);
  d = saved(ctx);
  assert.strictEqual(d.customDays.length, 0);
  assert.ok(!d.custom[id], "sus ejercicios se borran con el día");
  ["lunes", "martes", "jueves"].forEach(function (k) { ctx.app_removeDay(k); });
  d = saved(ctx);
  assert.ok(!d.removedDays.jueves, "el último día no se puede quitar");
  assert.ok(ctx.__els.app.innerHTML.indexOf("JUEVES") !== -1 || ctx.__els.app.innerHTML.indexOf("TORSO B") !== -1);
});

/* ---------- estadísticas ---------- */
test("estadísticas: botón junto a desplegar, gráfica y resumen del historial", function () {
  var init = { planVersion: 2, exercises: { "lun-press-banca": { top: 60, history: [
    { date: "2026-09-01", weight: 55, reps: 8 }, { date: "2026-09-20", weight: 57.5, reps: 8 }, { date: "2026-10-12", weight: 60, reps: 9 }] } },
    overrides: {}, removed: {}, custom: {}, schemes: {}, order: {}, schedule: {} };
  var ctx = freshApp(init);
  ctx.app_setActiveDay("lunes");
  var html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf("app_openStats('lun-press-banca')") !== -1);
  assert.ok(html.indexOf('class="statbtn"') < html.indexOf('class="expbtn"'), "va justo antes del botón de desplegar");
  ctx.app_openStats("lun-press-banca");
  html = ctx.__els.app.innerHTML;
  assert.ok(html.indexOf("statsmodal") !== -1 && html.indexOf("<polyline") !== -1);
  assert.ok(html.indexOf("55 kg") !== -1 && html.indexOf("+5 kg · +9 %") !== -1, "inicio y cambio");
  ctx.app_closeStats();
  assert.ok(ctx.__els.app.innerHTML.indexOf("statsmodal") === -1);
  ctx.app_toggleEditMode();
  assert.ok(ctx.__els.app.innerHTML.indexOf("app_openStats") === -1, "no aparece en modo edición");
});

test("estadísticas: los cambios de peso de la rutina quedan en el historial y sin datos hay aviso", function () {
  var ctx = freshApp();
  ctx.app_setActiveDay("lunes");
  ctx.app_openStats("lun-curl-ez");
  assert.ok(ctx.__els.app.innerHTML.indexOf("Aún no hay registros") !== -1);
  ctx.app_closeStats();
  ctx.app_updateSetField("lun-curl-ez", 2, "weight", "35");
  var e = saved(ctx).exercises["lun-curl-ez"];
  assert.strictEqual(e.planLog.length, 1);
  assert.strictEqual(e.planLog[0].weight, 35);
  ctx.app_toggleExpand("lun-curl-ez");
  setLog(ctx, 35, 10);
  ctx.app_saveLog("lun-curl-ez");
  assert.strictEqual(saved(ctx).exercises["lun-curl-ez"].planLog.length, 1, "registrar no borra el historial de la rutina");
});

/* ---------- versiones de los archivos ---------- */
test("index.html y sw.js usan la misma versión en todos los archivos", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  var v = /var APP_VERSION = "([^"]+)"/.exec(sw)[1];
  var refs = html.match(/(src|href)="(js\/[^"]+|styles\.css[^"]*)"/g) || [];
  assert.ok(refs.length >= FILES.length + 1);
  refs.forEach(function (r) { assert.ok(r.indexOf("?v=" + v + '"') !== -1, r + " debe llevar ?v=" + v); });
  FILES.forEach(function (f) {
    assert.ok(html.indexOf('js/' + f + '.js?v=' + v) !== -1, f + " en index.html");
    assert.ok(sw.indexOf('"js/' + f + '.js"') !== -1, f + " en la caché del service worker");
  });
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
