/* ---------------- Crear una rutina nueva desde cero ----------------
   Una rutina creada por el usuario es solo otra entrada en PROFILES,
   con un *_CONFIG generado en blanco (3 días vacíos para que se llenen
   con "Editar rutina" → "+ Añadir ejercicio"). Se persiste junto al
   resto de datos (misma tabla/caché que el progreso), como un registro
   especial, para que aparezca en cualquier dispositivo. */
var CUSTOM_PROFILES_ID = "__custom_profiles__";
var customProfilesLoaded = false;
var creatingProfile = false;
var NEW_PROFILE_COLORS = ["#C8FF00", "#38BDF8", "#FF6B35", "#E879F9", "#FBBF24", "#34D399", "#A78BFA", "#F472B6"];

function slugifyId(name) {
  var base = String(name || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!base) base = "persona";
  var id = base, n = 2;
  while (PROFILES[id]) { id = base + "-" + n; n++; }
  return id;
}

/* config.header se persiste con datos planos (titleText); las funciones
   titleHtml/subtitle no son serializables en JSON, así que se reconstruyen
   aquí tanto al crear el perfil como al cargarlo desde el registro. */
function attachHeaderFunctions(config) {
  var h = config.header;
  if (typeof h.titleHtml !== "function") {
    var titleText = h.titleText || config.id.toUpperCase();
    h.titleHtml = function (accent) { return '<span style="color:' + accent + '">' + esc(titleText) + "</span>"; };
  }
  if (typeof h.subtitle !== "function") {
    h.subtitle = function (weekNumber) { return "Semana " + weekNumber + " de 52"; };
  }
  return config;
}

function buildBlankConfig(id, name, color) {
  var start = todayISO();
  var end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  var placeholderFocus = 'Pulsa "✎ Editar rutina" y luego "+ Añadir ejercicio" para construir este día desde cero.';
  var days = ["1", "2", "3"].map(function (n) {
    return {
      id: id + "-d" + n, label: "D" + n, fullName: "DÍA " + n, type: "ENTRENO", tag: "General",
      subtitle: "Añade tus ejercicios", accent: color, bg: "#0a0a0a",
      focus: placeholderFocus, exercises: [],
    };
  });
  return attachHeaderFunctions({
    id: id,
    header: { eyebrow: "RUTINA PERSONALIZADA", titleText: name.toUpperCase() },
    planPanelLabel: "FASES DE TU PLAN",
    phases: [
      { id: 1, name: "Progresión", tag: "Progresión", start: start, end: dateISO(end), color: color,
        desc: "Rutina nueva, todavía sin ejercicios. Entra en \"Editar rutina\" en cada día para añadir los tuyos.",
        rule: "Sube peso cuando completes las reps de la última serie; si no, repite el mismo. Ve poco a poco." },
    ],
    days: days,
    weekDaysList: [
      { label: "L", id: days[0].id, active: true },
      { label: "M", active: false },
      { label: "X", id: days[1].id, active: true },
      { label: "J", active: false },
      { label: "V", id: days[2].id, active: true },
      { label: "S", active: false },
      { label: "D", active: false },
    ],
    dayIdsByWeekday: { 1: days[0].id, 3: days[1].id, 5: days[2].id },
    overviewRows: [
      { day: "Lunes", type: "Día 1", tag: "Personaliza", accent: color },
      { day: "Martes", type: "Descanso", tag: "", accent: "#222" },
      { day: "Miércoles", type: "Día 2", tag: "Personaliza", accent: color },
      { day: "Jueves", type: "Descanso", tag: "", accent: "#222" },
      { day: "Viernes", type: "Día 3", tag: "Personaliza", accent: color },
      { day: "Sábado", type: "Descanso", tag: "", accent: "#222" },
      { day: "Domingo", type: "Descanso", tag: "Recuperación", accent: "#222" },
    ],
  });
}

/* ---------------- Plantillas de rutina ----------------
   Cada plantilla es una lista de días de la semana (1 = lunes … 6 = sábado)
   que apuntan a un bloque de entrenamiento. Los ejercicios usan doble
   progresión: [nombre, grupo, series, repsMin, repsMax, salto de peso (kg)].
   Con ~2 sesiones por músculo y semana y 10–20 series semanales por grupo
   es lo que mejor respalda la evidencia para ganar músculo. Los pesos
   arrancan en 0: se definen con "Registrar" o en "Editar rutina". */
var DAY_BLOCKS = {
  upperA: { type: "TORSO A", tag: "Fuerza", subtitle: "Pecho, espalda, hombro y brazos", focus: "Torso con básicos pesados (6–10 reps) y accesorios. Descansa 2–3 min en los básicos.", rows: [
    ["Press Banca Barra", "Pecho", 3, 6, 10, 2.5], ["Remo en Barra (Pendlay)", "Espalda", 3, 6, 10, 2.5],
    ["Press Militar Mancuerna", "Hombro", 3, 8, 12, 1], ["Jalón al Pecho (agarre ancho)", "Dorsal", 3, 8, 12, 2.5],
    ["Elevaciones Laterales Polea", "Hombro lat.", 3, 12, 20, 1], ["Extensiones Tríceps Polea", "Tríceps", 3, 10, 15, 2.5], ["Curl Barra EZ", "Bíceps", 3, 8, 12, 1.25]] },
  upperB: { type: "TORSO B", tag: "Hipertrofia", subtitle: "Torso con más volumen y detalle", focus: "Torso con ángulos distintos al A y más reps. Busca sentir el músculo; 1–2 reps en reserva.", rows: [
    ["Press Inclinado Mancuerna", "Pecho sup.", 3, 8, 12, 1], ["Remo Mancuerna 1 mano", "Espalda", 3, 8, 12, 2],
    ["Dominadas", "Espalda", 3, 6, 10, 0, true], ["Aperturas en Máquina (Pec-Deck)", "Pecho", 3, 12, 15, 2.5],
    ["Vuelos Laterales Mancuerna", "Hombro lat.", 3, 12, 20, 1], ["Face Pull Polea", "Hombro post.", 3, 12, 20, 2.5],
    ["Curl Martillo", "Bíceps", 3, 10, 15, 1], ["Press Francés", "Tríceps", 3, 10, 15, 1.25]] },
  lowerA: { type: "PIERNA A", tag: "Fuerza", subtitle: "Cuádriceps y básicos de pierna", focus: "Pierna con sentadilla como básico. Calienta bien y controla la bajada.", rows: [
    ["Sentadilla Libre", "Cuádriceps", 3, 6, 10, 2.5], ["Peso Muerto Rumano", "Isquios", 3, 8, 12, 2.5],
    ["Prensa Inclinada", "Cuádriceps", 3, 10, 15, 5], ["Curl Femoral Tumbado", "Isquios", 3, 10, 15, 2.5],
    ["Gemelos de Pie (máquina)", "Gemelos", 4, 10, 15, 2.5], ["Crunch en Polea Alta", "Core", 3, 10, 15, 2.5]] },
  lowerB: { type: "PIERNA B", tag: "Hipertrofia", subtitle: "Glúteo, isquios y detalle de pierna", focus: "Pierna con más volumen y glúteo. Rango completo y control.", rows: [
    ["Hip Thrust", "Glúteo", 3, 8, 12, 5], ["Zancadas con Mancuernas", "Cuádriceps", 3, 8, 12, 2],
    ["Extensión Cuádriceps (máquina)", "Cuádriceps", 3, 10, 15, 2.5], ["Curl Femoral Sentado", "Isquios", 3, 10, 15, 2.5],
    ["Gemelo (máquina)", "Gemelos", 4, 10, 15, 2.5], ["Rueda Abdominal", "Core", 3, 8, 12, 0, true]] },
  pushA: { type: "EMPUJE A", tag: "Fuerza", subtitle: "Pecho, hombro y tríceps", focus: "Empuje con press banca como básico y hombro lateral para anchura.", rows: [
    ["Press Banca Barra", "Pecho", 3, 6, 10, 2.5], ["Press Militar Mancuerna", "Hombro", 3, 8, 12, 1],
    ["Press Inclinado Mancuerna", "Pecho sup.", 3, 8, 12, 1], ["Elevaciones Laterales Polea", "Hombro lat.", 4, 12, 20, 1],
    ["Extensiones Tríceps Polea", "Tríceps", 3, 10, 15, 2.5], ["Press Francés", "Tríceps", 3, 10, 15, 1.25]] },
  pushB: { type: "EMPUJE B", tag: "Hipertrofia", subtitle: "Empuje con más reps", focus: "Empuje con ángulos distintos y reps medias-altas. Sentir el pecho y el hombro trabajar.", rows: [
    ["Press Inclinado Barra", "Pecho sup.", 3, 6, 10, 2.5], ["Press Plano Mancuerna", "Pecho", 3, 8, 12, 1],
    ["Press Arnold (sentado)", "Hombro", 3, 8, 12, 1], ["Aperturas en Máquina (Pec-Deck)", "Pecho", 3, 12, 15, 2.5],
    ["Vuelos Laterales Mancuerna", "Hombro lat.", 4, 12, 20, 1], ["Extensión Tríceps Sobre la Cabeza (polea)", "Tríceps", 3, 10, 15, 2.5]] },
  pullA: { type: "TIRÓN A", tag: "Fuerza", subtitle: "Espalda y bíceps", focus: "Tirón con dominadas o jalón y remo pesado. Escápulas atrás y abajo.", rows: [
    ["Dominadas", "Espalda", 3, 6, 10, 0, true], ["Remo en Barra (Pendlay)", "Espalda", 3, 6, 10, 2.5],
    ["Remo Unilateral Polea (cerrado)", "Espalda", 3, 8, 12, 2.5], ["Face Pull Polea", "Hombro post.", 3, 12, 20, 2.5],
    ["Curl Barra EZ", "Bíceps", 3, 8, 12, 1.25], ["Curl Martillo", "Bíceps", 3, 10, 15, 1]] },
  pullB: { type: "TIRÓN B", tag: "Hipertrofia", subtitle: "Espalda ancha y brazos", focus: "Tirón con jalones y remos de máquina, más reps y conexión mente-músculo.", rows: [
    ["Jalón al Pecho (agarre ancho)", "Dorsal", 3, 8, 12, 2.5], ["Remo en Máquina (pecho apoyado)", "Espalda", 3, 8, 12, 2.5],
    ["Pullover en Polea Alta", "Espalda", 3, 10, 15, 2.5], ["Remo Abierto (máquina)", "Espalda alta", 3, 10, 15, 2.5],
    ["Curl Predicador (barra EZ)", "Bíceps", 3, 8, 12, 1.25], ["Curl Inclinado Mancuerna", "Bíceps", 3, 10, 15, 1]] },
  legsA: { type: "PIERNA A", tag: "Fuerza", subtitle: "Cuádriceps y básicos", focus: "Pierna con sentadilla como básico.", rows: [
    ["Sentadilla Libre", "Cuádriceps", 3, 6, 10, 2.5], ["Peso Muerto Rumano", "Isquios", 3, 8, 12, 2.5],
    ["Prensa Inclinada", "Cuádriceps", 3, 10, 15, 5], ["Curl Femoral Tumbado", "Isquios", 3, 10, 15, 2.5],
    ["Gemelos de Pie (máquina)", "Gemelos", 4, 10, 15, 2.5], ["Crunch en Polea Alta", "Core", 3, 10, 15, 2.5]] },
  legsB: { type: "PIERNA B", tag: "Hipertrofia", subtitle: "Glúteo, isquios y detalle", focus: "Pierna con más volumen y glúteo.", rows: [
    ["Hip Thrust", "Glúteo", 3, 8, 12, 5], ["Zancadas con Mancuernas", "Cuádriceps", 3, 8, 12, 2],
    ["Extensión Cuádriceps (máquina)", "Cuádriceps", 3, 10, 15, 2.5], ["Curl Femoral Sentado", "Isquios", 3, 10, 15, 2.5],
    ["Gemelo (máquina)", "Gemelos", 4, 10, 15, 2.5], ["Rueda Abdominal", "Core", 3, 8, 12, 0, true]] },
  fullA: { type: "CUERPO A", tag: "Completo", subtitle: "Cuerpo completo, énfasis pierna y empuje", focus: "Todo el cuerpo con básicos. Sesión larga: no te saltes el calentamiento.", rows: [
    ["Sentadilla Libre", "Cuádriceps", 3, 6, 10, 2.5], ["Press Banca Barra", "Pecho", 3, 6, 10, 2.5],
    ["Remo en Barra (Pendlay)", "Espalda", 3, 8, 12, 2.5], ["Peso Muerto Rumano", "Isquios", 3, 8, 12, 2.5],
    ["Elevaciones Laterales Polea", "Hombro lat.", 3, 12, 20, 1], ["Curl Barra EZ", "Bíceps", 2, 8, 12, 1.25], ["Extensiones Tríceps Polea", "Tríceps", 2, 10, 15, 2.5]] },
  fullB: { type: "CUERPO B", tag: "Completo", subtitle: "Cuerpo completo, énfasis tirón y glúteo", focus: "Todo el cuerpo con ángulos distintos al A.", rows: [
    ["Hip Thrust", "Glúteo", 3, 8, 12, 5], ["Press Militar Mancuerna", "Hombro", 3, 8, 12, 1],
    ["Jalón al Pecho (agarre ancho)", "Dorsal", 3, 8, 12, 2.5], ["Press Inclinado Mancuerna", "Pecho sup.", 3, 8, 12, 1],
    ["Curl Femoral Tumbado", "Isquios", 3, 10, 15, 2.5], ["Gemelos de Pie (máquina)", "Gemelos", 3, 10, 15, 2.5], ["Crunch en Polea Alta", "Core", 3, 10, 15, 2.5]] },
};

var TEMPLATES = {
  blank: { label: "Vacía", sub: "Rutina nueva" },
  upperlower4: { label: "Torso / Pierna · 4 días", sub: "Torso/Pierna ×4", days: [[1, "upperA"], [2, "lowerA"], [4, "upperB"], [5, "lowerB"]],
    why: "Cada músculo 2 veces por semana con 4 días. La mejor opción por defecto." },
  hybrid5: { label: "Híbrido · 5 días", sub: "Torso/Pierna + PPL", days: [[1, "upperA"], [2, "lowerA"], [4, "pushB"], [5, "pullB"], [6, "legsB"]],
    why: "Más volumen manteniendo ~2 sesiones por músculo." },
  ppl6: { label: "Empuje / Tirón / Pierna · 6 días", sub: "PPL ×2", days: [[1, "pushA"], [2, "pullA"], [3, "legsA"], [4, "pushB"], [5, "pullB"], [6, "legsB"]],
    why: "Máximo volumen, pero exige 6 días: si faltas, pierdes frecuencia." },
  fullbody3: { label: "Cuerpo completo · 3 días", sub: "Full body ×3", days: [[1, "fullA"], [3, "fullB"], [5, "fullA"]],
    why: "Cada músculo 3 veces por semana. Ideal con poco tiempo." },
};

var WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
var WEEKDAY_SHORT = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"];
var WEEKDAY_LETTER = ["D", "L", "M", "X", "J", "V", "S"];
var DAY_ACCENTS = ["#C8FF00", "#FF6B35", "#38BDF8", "#E879F9", "#FBBF24", "#34D399"];

/* Ciclos de 5 semanas de progresión + 1 de descarga durante 52 semanas. */
function buildCyclePhases(color) {
  var phases = [];
  var d = new Date();
  var weeksLeft = 52, n = 1, id = 1;
  function pushPhase(weeks, name, tag, c, desc, rule) {
    var start = new Date(d.getTime());
    d.setDate(d.getDate() + weeks * 7);
    var end = new Date(d.getTime());
    end.setDate(end.getDate() - 1);
    phases.push({ id: id++, name: name, tag: tag, start: dateISO(start), end: dateISO(end), color: c, desc: desc, rule: rule });
  }
  while (weeksLeft > 0) {
    var w = Math.min(5, weeksLeft);
    pushPhase(w, "Bloque " + n, "Progresión", color,
      "Bloque de progresión: dentro del rango de reps de cada ejercicio, busca más reps o más peso cada semana. Deja 1–2 reps en reserva.",
      "Doble progresión: trabaja dentro del rango de reps. Cuando en la última serie llegues al máximo del rango, el peso sube. Si no llegas, repite el peso. Si te estancas 2 sesiones, la app te propone bajar un 10 %.");
    weeksLeft -= w;
    if (weeksLeft > 0) {
      pushPhase(1, "Descarga " + n, "Recuperación", "#94A3B8",
        "Semana ligera: menos peso y una serie menos por ejercicio. El cuerpo mejora cuando descansa, no solo cuando entrena.");
      weeksLeft -= 1;
    }
    n++;
  }
  return phases;
}

function buildTemplateConfig(id, name, color, templateKey) {
  var tpl = TEMPLATES[templateKey];
  var days = [];
  var dayIdsByWeekday = {};
  tpl.days.forEach(function (entry, di) {
    var wd = entry[0], block = DAY_BLOCKS[entry[1]];
    var dayId = id + "-" + WEEKDAY_SHORT[wd];
    dayIdsByWeekday[wd] = dayId;
    days.push({
      id: dayId, label: WEEKDAY_SHORT[wd].toUpperCase(), fullName: WEEKDAY_NAMES[wd].toUpperCase(),
      type: block.type, tag: block.tag, subtitle: block.subtitle, accent: DAY_ACCENTS[di % DAY_ACCENTS.length], bg: "#0a0a0a",
      focus: block.focus,
      exercises: block.rows.map(function (r, ei) {
        var sets = r[2];
        var reps = [], offs = [];
        for (var i = 0; i < sets; i++) { reps.push(r[3]); offs.push(0); }
        return {
          id: dayId + "-e" + ei, name: r[0], muscle: r[1], trackable: true,
          repsPattern: reps, offsets: offs, repMax: r[4], baseTop: 0, step: r[5] || 2.5, bw: !!r[6],
          note: "Elige un peso con el que llegues a " + r[4] + " reps dejando 1–2 en reserva. Al llegar a " + r[4] + " en la última serie, sube peso." + (r[6] ? " Si es fácil, añade lastre." : ""),
        };
      }),
    });
  });
  var weekDaysList = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
    return dayIdsByWeekday[wd] ? { label: WEEKDAY_LETTER[wd], id: dayIdsByWeekday[wd], active: true } : { label: WEEKDAY_LETTER[wd], active: false };
  });
  var overviewRows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
    var day = days.filter(function (d) { return d.id === dayIdsByWeekday[wd]; })[0];
    return day
      ? { day: WEEKDAY_NAMES[wd], type: day.type, tag: day.tag, accent: day.accent }
      : { day: WEEKDAY_NAMES[wd], type: "Descanso", tag: wd === 0 ? "Recuperación" : "Cardio opcional", accent: "#222" };
  });
  return attachHeaderFunctions({
    id: id,
    header: { eyebrow: tpl.label.toUpperCase(), titleText: name.toUpperCase() },
    planPanelLabel: "BLOQUES DE TU PLAN (5 + 1 DESCARGA)",
    phases: buildCyclePhases(color),
    days: days,
    weekDaysList: weekDaysList,
    dayIdsByWeekday: dayIdsByWeekday,
    overviewRows: overviewRows,
  });
}

function buildConfig(id, name, color, templateKey) {
  return templateKey && TEMPLATES[templateKey] && TEMPLATES[templateKey].days
    ? buildTemplateConfig(id, name, color, templateKey)
    : buildBlankConfig(id, name, color);
}
