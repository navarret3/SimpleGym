/* ============================================================
   GRUPOS MUSCULARES Y BIBLIOTECA DE EJERCICIOS — compartidos por
   todas las rutinas, para que el autocompletado al editar y el
   selector de grupo muscular tengan siempre el máximo de opciones.
   ============================================================ */
var muscleColors = {
  "Pecho": "#FF6B35", "Pecho sup.": "#FF6B35", "Pecho inf.": "#FF6B35",
  "Espalda": "#C8FF00", "Dorsal": "#A3E635", "Espalda alta": "#84CC16",
  "Hombro": "#38BDF8", "Hombro lat.": "#38BDF8", "Hombro post.": "#38BDF8",
  "Bíceps": "#E879F9", "Tríceps": "#E879F9", "Antebrazo": "#C084FC",
  "Cuádriceps": "#FB923C", "Isquios": "#FB923C", "Glúteo": "#F472B6",
  "Gemelos": "#34D399", "Trapecio": "#FBBF24", "Core": "#94A3B8",
};
var EXERCISE_LIBRARY = [
  { name: "Press Banca Barra", muscle: "Pecho" },
  { name: "Press Banca Mancuerna", muscle: "Pecho" },
  { name: "Press Plano Mancuerna", muscle: "Pecho" },
  { name: "Press Plano (máquina/mancuerna)", muscle: "Pecho" },
  { name: "Aperturas en Máquina (Pec-Deck)", muscle: "Pecho" },
  { name: "Aperturas / Contractor (máquina)", muscle: "Pecho" },
  { name: "Press Inclinado Mancuerna", muscle: "Pecho sup." },
  { name: "Press Superior en Multipower", muscle: "Pecho sup." },
  { name: "Cruces Polea Baja", muscle: "Pecho sup." },
  { name: "Press Declinado / Inferior", muscle: "Pecho inf." },
  { name: "Jalón al Pecho (agarre neutro)", muscle: "Espalda" },
  { name: "Jalón Agarre Neutro", muscle: "Dorsal" },
  { name: "Remo en Máquina (pecho apoyado)", muscle: "Espalda" },
  { name: "Remo Mancuerna 1 mano", muscle: "Espalda" },
  { name: "Remo Mancuerna en Banco", muscle: "Espalda" },
  { name: "Remo Unilateral Polea (cerrado)", muscle: "Espalda" },
  { name: "Remo en Barra (Pendlay)", muscle: "Espalda" },
  { name: "Rack Pull (peso muerto parcial)", muscle: "Espalda" },
  { name: "Remo Abierto (máquina)", muscle: "Espalda alta" },
  { name: "Remo Abierto Polea", muscle: "Espalda alta" },
  { name: "Pullover en Polea Alta", muscle: "Espalda" },
  { name: "Pull Over en Polea", muscle: "Dorsal" },
  { name: "Dominadas", muscle: "Espalda" },
  { name: "Encogimientos de Trapecio", muscle: "Trapecio" },
  { name: "Press Militar Barra (de pie)", muscle: "Hombro" },
  { name: "Press Militar Multipower", muscle: "Hombro" },
  { name: "Press Militar Mancuerna", muscle: "Hombro" },
  { name: "Press Arnold (sentado)", muscle: "Hombro" },
  { name: "Vuelos Laterales Mancuerna", muscle: "Hombro lat." },
  { name: "Vuelos Laterales (polea baja)", muscle: "Hombro lat." },
  { name: "Elevaciones Laterales Polea", muscle: "Hombro lat." },
  { name: "Elevaciones Laterales (máquina)", muscle: "Hombro lat." },
  { name: "Face Pull Polea", muscle: "Hombro post." },
  { name: "Rotación Externa (manguito)", muscle: "Hombro post." },
  { name: "Curl Barra EZ", muscle: "Bíceps" },
  { name: "Curl Predicador (barra EZ)", muscle: "Bíceps" },
  { name: "Curl Martillo con Cuerda (polea)", muscle: "Bíceps" },
  { name: "Curl Martillo", muscle: "Bíceps" },
  { name: "Curl Bayesian (polea)", muscle: "Bíceps" },
  { name: "Curl Bayesian", muscle: "Bíceps" },
  { name: "Curl Bayesian Scott", muscle: "Bíceps" },
  { name: "Curl de Antebrazo (muñeca)", muscle: "Antebrazo" },
  { name: "Fondos en Paralelas", muscle: "Tríceps" },
  { name: "Extensiones Tríceps Polea", muscle: "Tríceps" },
  { name: "Extensión Tríceps Polea + Katana", muscle: "Tríceps" },
  { name: "Extensión Polea Unilateral", muscle: "Tríceps" },
  { name: "Press Cerrado (tríceps)", muscle: "Tríceps" },
  { name: "Patada de Tríceps (mancuerna)", muscle: "Tríceps" },
  { name: "Press Francés", muscle: "Tríceps" },
  { name: "Sentadilla Libre", muscle: "Cuádriceps" },
  { name: "Prensa Inclinada", muscle: "Cuádriceps" },
  { name: "Extensión Cuádriceps (máquina)", muscle: "Cuádriceps" },
  { name: "Extensión de Cuádriceps", muscle: "Cuádriceps" },
  { name: "Zancadas con Mancuernas", muscle: "Cuádriceps" },
  { name: "Peso Muerto Rumano", muscle: "Isquios" },
  { name: "Curl Femoral Tumbado", muscle: "Isquios" },
  { name: "Hip Thrust", muscle: "Glúteo" },
  { name: "Abductor (máquina)", muscle: "Glúteo" },
  { name: "Gemelos de Pie (máquina)", muscle: "Gemelos" },
  { name: "Gemelo (máquina)", muscle: "Gemelos" },
  { name: "Plancha", muscle: "Core" },
  { name: "Rueda Abdominal", muscle: "Core" },
  { name: "Crunch en Polea Alta", muscle: "Core" },
  { name: "Press Inclinado Barra", muscle: "Pecho sup." },
  { name: "Jalón al Pecho (agarre ancho)", muscle: "Dorsal" },
  { name: "Curl Inclinado Mancuerna", muscle: "Bíceps" },
  { name: "Extensión Tríceps Sobre la Cabeza (polea)", muscle: "Tríceps" },
  { name: "Curl Femoral Sentado", muscle: "Isquios" },
  { name: "Sentadilla Búlgara", muscle: "Cuádriceps" },
  { name: "Sentadilla Hack (máquina)", muscle: "Cuádriceps" },
  { name: "Peso Muerto Convencional", muscle: "Espalda" },
  { name: "Remo con Barra", muscle: "Espalda" },
  { name: "Gemelo Sentado (máquina)", muscle: "Gemelos" },
  { name: "Elevación de Piernas Colgado", muscle: "Core" },
];
function findLibraryExercise(name) {
  var n = String(name || "").toLowerCase().trim();
  return EXERCISE_LIBRARY.filter(function (e) { return e.name.toLowerCase() === n; })[0] || null;
}
function muscleOptions(current) {
  return Object.keys(muscleColors).map(function (m) {
    return '<option value="' + esc(m) + '"' + (m === current ? " selected" : "") + ">" + esc(m) + "</option>";
  }).join("");
}

/* Familia de cada grupo (para contar series semanales y proponer alternativas). */
var MUSCLE_FAMILY = {
  "Pecho": "Pecho", "Pecho sup.": "Pecho", "Pecho inf.": "Pecho",
  "Espalda": "Espalda", "Dorsal": "Espalda", "Espalda alta": "Espalda",
  "Hombro": "Hombro", "Hombro lat.": "Hombro", "Hombro post.": "Hombro",
};
function muscleFamily(m) { return MUSCLE_FAMILY[m] || m; }

function equipOf(name) {
  var n = String(name || "").toLowerCase();
  if (/multipower/.test(n)) return "Multipower";
  if (/polea|cuerda|katana/.test(n)) return "Polea";
  if (/mancuerna/.test(n)) return "Mancuernas";
  if (/barra|pendlay|rack pull|sentadilla libre|peso muerto|press banca barra/.test(n)) return "Barra";
  if (/máquina|pec-deck|prensa|hack|contractor|femoral|abductor|gemelo/.test(n)) return "Máquina";
  return "Peso corporal / otros";
}

function libraryAlternatives(muscle, currentName) {
  var fam = muscleFamily(muscle);
  return EXERCISE_LIBRARY.filter(function (e) { return muscleFamily(e.muscle) === fam && e.name !== currentName; });
}
