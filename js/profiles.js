/* ============================================================
   REGISTRO DE PERFILES — para añadir una persona nueva con su
   propia rutina, basta con crear su propio *_CONFIG (fases,
   días, ejercicios, biblioteca si hace falta) y registrarlo
   aquí. El motor (periodización, edición, hoy por defecto,
   persistencia) se reutiliza automáticamente sin tocar código.
   ============================================================ */
var PROFILES = {
  nava: { label: "Nava", sub: "3 Upper · 1 Pierna", color: "#C8FF00", config: NAVA_CONFIG },
};
/* Perfiles "de fábrica" (código) vs. creados por el usuario (persistidos aparte,
   ver saveCustomProfiles/loadCustomProfiles más abajo). */
var STATIC_PROFILE_IDS = { nava: true };
