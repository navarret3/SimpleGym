/* ============================================================
   RUTINA DE NAVA — 3 TORSO + 1 PIERNA · 22 Oct 2026 → 30 Jun 2027
   Plan v2: 4 días (L-M-J-V; el viernes es el 4º día, opcional) con
   énfasis en tren superior: Torso A, Pierna A, Torso B y Torso C (con
   pierna residual), doble progresión por rango de reps y bloques de 6 semanas con descarga. Incluye la parada
   de Navidad y una semana de reentrada.
   Los ids de los ejercicios se conservan del plan anterior (aunque
   cambien de día) para no perder el historial; `legacyTopReps` son las
   reps de la serie pesada del plan antiguo y sirven para convertir tu
   peso guardado al nuevo rango de reps (ver upgradePlan en engine.js).
   ============================================================ */
var NAVA_PLAN_VERSION = 2;

var NAVA_PHASES = [
  { id: 1, name: "Bloque 1 · Base", tag: "Progresión", start: "2026-10-22", end: "2026-11-29", color: "#C8FF00",
    desc: "Empezamos el Torso/Pierna con doble progresión. Las primeras semanas calibran tus pesos: deja 2–3 reps en reserva y sube cuando llegues al máximo del rango. Las últimas, acércate más al fallo en la última serie.",
    rule: "Doble progresión: trabaja dentro del rango de reps. Cuando en la última serie llegues al máximo, el peso sube. Si no llegas, repite el peso. Semanas 1–2: 2–3 reps en reserva; 3–5: 1–2; la última serie, hasta 0–1." },
  { id: 2, name: "Descarga", tag: "Recuperación", start: "2026-11-30", end: "2026-12-06", color: "#94A3B8",
    desc: "Semana ligera: menos peso y una serie menos. Llegas a diciembre recuperado, no quemado." },
  { id: 3, name: "Bloque 2 · Cierre de año", tag: "Progresión", start: "2026-12-07", end: "2026-12-20", color: "#C8FF00",
    desc: "Dos semanas para cerrar el año arriba antes de parar. Aprovecha para marcar tus mejores registros." },
  { id: 4, name: "Parada de Navidad", tag: "Mantenimiento", start: "2026-12-21", end: "2027-01-03", color: "#38BDF8",
    desc: "Descanso sin culpa. Dos semanas sin entrenar apenas hacen perder músculo y se recupera rápido. Si te apetece, una o dos sesiones cortas con los pesos que tengas a mano.",
    rule: "Parada de Navidad: no hace falta entrenar. Si lo haces, mantén los pesos y no persigas récords." },
  { id: 5, name: "Reentrada", tag: "Recuperación", start: "2027-01-04", end: "2027-01-10", color: "#94A3B8",
    desc: "Primera semana tras la parada: pesos un ~12 % más bajos y una serie menos, para volver sin agujetas ni lesiones. Se recupera en pocas sesiones." },
  { id: 6, name: "Bloque 3", tag: "Progresión", start: "2027-01-11", end: "2027-02-21", color: "#C8FF00",
    desc: "Seis semanas de progresión con los pesos recuperados. Misma regla de doble progresión." },
  { id: 7, name: "Descarga", tag: "Recuperación", start: "2027-02-22", end: "2027-02-28", color: "#94A3B8",
    desc: "Semana ligera antes del bloque de volumen." },
  { id: 8, name: "Bloque 4 · Volumen", tag: "Volumen", start: "2027-03-01", end: "2027-04-11", color: "#FF6B35",
    desc: "Una serie extra por ejercicio durante seis semanas para empujar el volumen, con el mismo peso. Si las sesiones se te hacen demasiado largas, quita series con ✎ en los accesorios.",
    rule: "Bloque de volumen: una serie más por ejercicio, mismo rango de reps. Prioriza dormir y comer bien; si el rendimiento cae dos semanas seguidas, adelanta la descarga." },
  { id: 9, name: "Descarga", tag: "Recuperación", start: "2027-04-12", end: "2027-04-18", color: "#94A3B8",
    desc: "Semana ligera tras el bloque de volumen." },
  { id: 10, name: "Bloque 5", tag: "Progresión", start: "2027-04-19", end: "2027-05-30", color: "#C8FF00",
    desc: "Vuelta a las series base, con la fuerza y el músculo acumulados. Aquí se nota el trabajo del año." },
  { id: 11, name: "Descarga", tag: "Recuperación", start: "2027-05-31", end: "2027-06-06", color: "#94A3B8",
    desc: "Última descarga: llegas fresco al empujón final." },
  { id: 12, name: "Bloque final · Pico", tag: "Progresión", start: "2027-06-07", end: "2027-06-30", color: "#E879F9",
    desc: "Último bloque: busca tus mejores registros en los básicos. Compara con octubre de 2026 y mira lo lejos que has llegado.",
    rule: "Bloque final: pesos y reps en su mejor momento. En los básicos puedes ir hasta 0–1 reps en reserva en la última serie." },
];

/* [id, nombre, músculo, series, repsMin, repsMax, salto, peso inicial, legacyTopReps, nota] */
function navaEx(r, bw) {
  var reps = [], offs = [];
  for (var i = 0; i < r[3]; i++) { reps.push(r[4]); offs.push(0); }
  return {
    id: r[0], name: r[1], muscle: r[2], trackable: true,
    repsPattern: reps, offsets: offs, repMax: r[5], step: r[6], baseTop: r[7], legacyTopReps: r[8], bw: !!bw,
    note: r[9] + " Al llegar a " + r[5] + " reps en la última serie, sube peso.",
  };
}

var NAVA_DAYS = [
  {
    id: "lunes", label: "LUN", fullName: "LUNES", type: "TORSO A", tag: "Fuerza",
    subtitle: "Pecho · Espalda · Hombro · Brazos", accent: "#C8FF00", bg: "#0f1a00",
    focus: "Torso pesado: empieza por los básicos (6–10 reps) y descansa 2–3 min. Técnica antes que ego.",
    exercises: [
      navaEx(["lun-press-banca", "Press Banca Barra", "Pecho", 3, 6, 10, 2.5, 60, 4, "Escápulas atrás, pies firmes. Controla la bajada."]),
      navaEx(["lun-jalon-pecho", "Jalón al Pecho (agarre neutro)", "Espalda", 3, 8, 12, 2.5, 57.5, 4, "Tira con codos hacia las caderas. Pausa 1 seg abajo."]),
      navaEx(["lun-press-militar", "Press Militar Barra (de pie)", "Hombro", 3, 6, 10, 2.5, 42.5, 4, "Core apretado, sin arquear la espalda."]),
      navaEx(["lun-remo-maquina", "Remo en Máquina (pecho apoyado)", "Espalda", 3, 8, 12, 2.5, 70, 6, "Codos cerca del cuerpo. Pausa 1 seg apretando la espalda."]),
      navaEx(["lun-fondos", "Fondos en Paralelas", "Tríceps", 3, 8, 12, 2.5, 0, 0, "Torso vertical = tríceps. Si te sobra, añade lastre (kg)."], true),
      navaEx(["vie-vuelos-polea", "Vuelos Laterales (polea baja)", "Hombro lat.", 3, 12, 20, 1, 7, 10, "La polea da tensión constante en el lateral."]),
      navaEx(["lun-curl-ez", "Curl Barra EZ", "Bíceps", 3, 8, 12, 1.25, 32.5, 8, "Sin balanceo. Contracción total arriba."]),
    ],
  },
  {
    id: "martes", label: "MAR", fullName: "MARTES", type: "PIERNA A", tag: "Fuerza",
    subtitle: "Cuádriceps · Isquios · Gemelos · Core", accent: "#38BDF8", bg: "#001a2a",
    focus: "Tu día de pierna: sentadilla de básico, descansa 3 min en sentadilla y prensa. Es la sesión que no te puedes saltar.",
    exercises: [
      navaEx(["jue-sentadilla", "Sentadilla Libre", "Cuádriceps", 3, 6, 10, 2.5, 95, 5, "Profundidad completa y técnica antes que ego."]),
      navaEx(["jue-peso-muerto", "Peso Muerto Rumano", "Isquios", 3, 8, 12, 2.5, 65, 6, "Caderas atrás, barra cerca del cuerpo."]),
      navaEx(["jue-prensa", "Prensa Inclinada", "Cuádriceps", 3, 10, 15, 5, 150, 6, "Pies bajos en la plataforma = más cuádriceps."]),
      navaEx(["jue-curl-femoral", "Curl Femoral Tumbado", "Isquios", 3, 10, 15, 2.5, 42.5, 8, "Aprieta 1 seg al final del recorrido."]),
      navaEx(["jue-gemelos", "Gemelos de Pie (máquina)", "Gemelos", 5, 10, 15, 2.5, 57.5, 10, "Pausa 2 seg en el estiramiento abajo."]),
      { id: "jue-plancha", name: "Plancha", muscle: "Core", trackable: false,
        staticPyramid: [
          { set: 1, reps: "45 seg", weight: "—" },
          { set: 2, reps: "45 seg", weight: "—" },
          { set: 3, reps: "45 seg", weight: "—" } ],
        note: "Glúteos y abdomen apretados. Sin caer las caderas." },
    ],
  },
  {
    id: "jueves", label: "JUE", fullName: "JUEVES", type: "TORSO B", tag: "Hipertrofia",
    subtitle: "Pecho · Espalda · Hombro · Brazos", accent: "#FF6B35", bg: "#1a0a00",
    focus: "Torso con más reps y ángulos distintos al lunes. Descansa 90 seg y busca sentir el músculo; 1–2 reps en reserva.",
    exercises: [
      navaEx(["mar-press-inclinado", "Press Inclinado Mancuerna", "Pecho sup.", 3, 8, 12, 2, 26, 8, "Estiramiento máximo abajo. Peso = por mancuerna."]),
      navaEx(["mar-remo-mancuerna", "Remo Mancuerna 1 mano", "Espalda", 3, 8, 12, 2, 28, 8, "Recorrido completo. Pausa 1 seg arriba."]),
      navaEx(["vie-cruces-polea", "Cruces Polea Baja", "Pecho sup.", 3, 12, 15, 1, 7, 10, "Tira hacia arriba y al centro. Estira bien abajo."]),
      navaEx(["mar-pullover", "Pullover en Polea Alta", "Espalda", 2, 10, 15, 2.5, 27.5, 10, "Brazos casi rectos. Siente el estiramiento del dorsal."]),
      navaEx(["mar-vuelos-mancuerna", "Vuelos Laterales Mancuerna", "Hombro lat.", 3, 12, 20, 1, 9, 10, "Da anchura de hombros: no hace falta ir pesado."]),
      navaEx(["vie-face-pull", "Face Pull Polea", "Hombro post.", 2, 12, 20, 2.5, 20, 12, "Salud del manguito rotador. No lo saltes."]),
      navaEx(["mar-curl-predicador", "Curl Predicador (barra EZ)", "Bíceps", 4, 8, 12, 1.25, 27.5, 8, "Sin trampa. Aislamiento puro."]),
      navaEx(["mar-extension-triceps", "Extensiones Tríceps Polea", "Tríceps", 4, 10, 15, 2.5, 30, 10, "Codos fijos. Bloqueo total abajo."]),
    ],
  },
  {
    id: "viernes", label: "VIE", fullName: "VIERNES", type: "TORSO C", tag: "4º día · opcional",
    subtitle: "Hombro 3D · Espalda alta · Brazos · pierna residual", accent: "#E879F9", bg: "#1a0020",
    focus: "Torso de detalle: hombros, espalda alta y brazos con descansos cortos (60–90 seg). Al final, dos ejercicios de pierna ligeros (residual): si vas justo de tiempo, es lo primero que puedes saltarte. Los ejercicios nuevos arrancan en 'Elige peso': empieza ligero y súbelo con ✎.",
    exercises: [
      navaEx(["vie-press-arnold", "Press Arnold (sentado)", "Hombro", 3, 8, 12, 2, 20, 8, "Rotación controlada. Peso = por mancuerna."]),
      navaEx(["vie-remo-abierto", "Remo Abierto Polea", "Espalda alta", 3, 10, 15, 2.5, 0, 0, "Codos abiertos, aprieta la espalda alta 1 seg."]),
      navaEx(["vie-pec-deck", "Aperturas en Máquina (Pec-Deck)", "Pecho", 3, 12, 15, 2.5, 0, 0, "Estiramiento controlado, sin rebotar."]),
      navaEx(["vie-laterales-maquina", "Elevaciones Laterales (máquina)", "Hombro lat.", 3, 12, 20, 2.5, 0, 0, "Tercer día de laterales: ve cómodo y busca quemazón."]),
      navaEx(["vie-curl-martillo", "Curl Martillo con Cuerda (polea)", "Bíceps", 3, 10, 15, 1.25, 28.75, 10, "Separa las manos arriba. Trabaja braquial y braquiorradial."]),
      navaEx(["vie-ext-sobre-cabeza", "Extensión Tríceps Sobre la Cabeza (polea)", "Tríceps", 3, 10, 15, 2.5, 0, 0, "Codos hacia delante y fijos. Estira bien la cabeza larga."]),
      navaEx(["jue-extension-cuadriceps", "Extensión Cuádriceps (máquina)", "Cuádriceps", 3, 12, 15, 2.5, 37.5, 10, "Residual de pierna. Pausa 1 seg arriba."]),
      navaEx(["vie-curl-femoral-sentado", "Curl Femoral Sentado", "Isquios", 3, 10, 15, 2.5, 0, 0, "Residual de pierna. Aprieta 1 seg al final."]),
    ],
  },
];

var NAVA_CONFIG = {
  id: "nava",
  planVersion: NAVA_PLAN_VERSION,
  header: {
    eyebrow: "ESPECIALIZACIÓN TREN SUPERIOR · DOBLE PROGRESIÓN",
    titleHtml: function (accent) { return "3 TORSO<br><span style=\"color:" + accent + "\">1 PIERNA</span>"; },
    subtitle: function (weekNumber) { return "Oct 2026 → Jun 2027 · Semana " + weekNumber + " de 36"; },
  },
  planPanelLabel: "LAS 12 FASES HASTA JUNIO",
  phases: NAVA_PHASES,
  days: NAVA_DAYS,
  weekDaysList: [
    { label: "L", id: "lunes", active: true },
    { label: "M", id: "martes", active: true },
    { label: "X", active: false },
    { label: "J", id: "jueves", active: true },
    { label: "V", id: "viernes", active: true },
    { label: "S", active: false },
    { label: "D", active: false },
  ],
  dayIdsByWeekday: { 1: "lunes", 2: "martes", 4: "jueves", 5: "viernes" },
  overviewRows: [
    { day: "Lunes", type: "Torso A", tag: "Fuerza", accent: "#C8FF00" },
    { day: "Martes", type: "Pierna A", tag: "Fuerza", accent: "#38BDF8" },
    { day: "Miércoles", type: "Descanso", tag: "Cardio opcional", accent: "#333" },
    { day: "Jueves", type: "Torso B", tag: "Hipertrofia", accent: "#FF6B35" },
    { day: "Viernes", type: "Torso C", tag: "4º día · opcional", accent: "#E879F9" },
    { day: "Sábado", type: "Descanso", tag: "Cardio opcional", accent: "#333" },
    { day: "Domingo", type: "Descanso", tag: "Recuperación", accent: "#222" },
  ],
};
