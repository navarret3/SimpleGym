# SimpleGym

App de rutinas de gimnasio multi-persona (las rutinas de fábrica son la de Nava y la de Cristian, pero cualquiera puede crear la suya desde la propia app), sin build ni dependencias (HTML + CSS + JS plano), pensada para servirse tal cual desde GitHub Pages. Es instalable como app (PWA) y funciona sin conexión.

## Cómo funciona hoy

- Al abrir la app eliges quién eres (se recuerda en el dispositivo). También puedes ir directo con `index.html?u=nava` o `index.html?u=cristian`.
- Botón "+ Añadir rutina" en esa misma pantalla: crea una rutina nueva desde cero con solo poner un nombre. Empieza con 3 días vacíos (lunes/miércoles/viernes) y una fase única de progresión; se completa con "Editar rutina" → "+ Añadir ejercicio" en cada día, igual que con Nava. Se guarda junto al resto de datos, así que la nueva rutina aparece en cualquier dispositivo, no solo en el que la creaste.
- Los pesos, el registro de cada sesión y las ediciones de rutina (nombre, series, reps, ejercicios añadidos/eliminados) se guardan **siempre en local** (`localStorage`), así que funciona sin conexión.
- Si configuras Supabase (ver abajo), además esos mismos datos se sincronizan en la nube: entras desde el móvil o el portátil y ves el mismo progreso.

### Un motor genérico, varias rutinas

La app ya no tiene una implementación distinta por persona: hay **un único motor** (`initProfileApp`) que sabe periodizar, editar, guardar progreso y mostrar el día de hoy. Cada persona es solo un objeto de configuración (`NAVA_CONFIG`, ...) con sus propias fases, días y ejercicios, registrado en `PROFILES`. Añadir una rutina nueva para otra persona es crear su `*_CONFIG` y una línea en `PROFILES` — no hace falta tocar el motor ni duplicar código.

Gracias a esto, cualquier rutina tiene:

- **Periodización automática por fecha**: cada rutina define sus fases (fuerza, hipertrofia, descarga, mantenimiento, test) con fechas concretas. La app detecta la fase activa y calcula solo las series/reps/peso de cada ejercicio a partir del mismo dato base (peso de referencia): en hipertrofia añade una serie y sube las reps bajando el peso, en descarga quita una serie y baja el peso ~12%, en semana de test sube ligeramente el peso con menos series. Se ve en la etiqueta "MODO ..." de cada día. El plan de Nava tiene 12 fases a lo largo del año.
- **Entrenamiento de hoy por defecto**: al entrar, la app detecta el día de la semana y muestra directamente la rutina de hoy (si toca descanso, avisa cuál es el próximo entreno).
- **Registro de lo hecho hoy en cualquier ejercicio** (también los de peso corporal, con lastre opcional). En los ejercicios con peso, lo registrado pasa a ser el nuevo peso base —normalizado por la fase— y, si llegas a las reps objetivo, sube un escalón. Solo la semana de descarga no toca el peso base. Editar series/reps/peso a mano ya no "congela" el ejercicio: sigue progresando.
- **Doble progresión con rango de reps** (ejercicios de las plantillas, y cualquiera donde escribas un rango como `8-12` en "Editar rutina"): trabajas dentro del rango y, cuando en la última serie llegas al máximo, el peso base sube. Las fases no cambian las reps de estos ejercicios; la descarga baja el peso ~12 % y quita una serie.
- **Aviso de estancamiento**: si fallas el objetivo 2 sesiones seguidas con el mismo peso, el ejercicio muestra "⚠ estancado" y un botón para bajar el peso base un 10 %.
- **Plantillas al crear una rutina**: Torso/Pierna 4 días (recomendada), Híbrido 5 días, Empuje/Tirón/Pierna 6 días y Cuerpo completo 3 días. Traen ejercicios con rangos de reps y 5 semanas de progreso + 1 de descarga durante 52 semanas. Los pesos arrancan vacíos ("Elige peso") y se fijan con "Registrar" o en "Editar rutina".
- **Progreso del día persistente**: los checks y los registros de hoy se guardan (local y nube) y sobreviven a cerrar la app; caducan solos al cambiar de día.
- **Reordenar ejercicios** con ▲▼ en "Editar rutina".
- **Editar rutina con biblioteca de ejercicios**: el nombre del ejercicio tiene autocompletado con una biblioteca compartida de ejercicios habituales — si eliges uno de la lista, el grupo muscular se actualiza solo. También puedes fijarlo a mano con el selector de al lado, así el banner de color siempre es correcto aunque escribas un nombre que no esté en la biblioteca.

Esto es un motor de reglas (periodización por bloques), no una IA generativa en vivo: no hay ninguna llamada a un servicio de IA desde el navegador (evita exponer una API key en código público).

> Nota: el perfil de Cristian (PPL de 5 días, recomposición) vuelve a estar disponible tal como estaba, con sus datos de Supabase intactos. Sigue con su plan original en pirámide; no se ha migrado a doble progresión.

## Activar sincronización real (Supabase)

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En el **SQL editor** del proyecto, ejecuta:

   ```sql
   create table if not exists progress (
     id text primary key,
     data jsonb not null default '{}'::jsonb,
     updated_at timestamptz not null default now()
   );

   alter table progress enable row level security;

   create policy "allow read" on progress for select using (true);
   create policy "allow insert" on progress for insert with check (true);
   create policy "allow update" on progress for update using (true);
   ```

3. En **Project Settings > API**, copia la **Project URL** y la **anon public key**.
4. En [js/store.js](js/store.js), busca `STORE_CONFIG` (al principio del archivo) y rellena:

   ```js
   var STORE_CONFIG = {
     url: "https://tu-proyecto.supabase.co",
     anonKey: "tu-anon-key",
   };
   ```

5. Sube el cambio. La primera vez que cada persona registre un peso, se creará su fila en `progress` y desde ese momento cualquier dispositivo con el mismo usuario verá los mismos datos.

### Nota de seguridad

Al no haber login, cualquiera que tenga la `anon key` (visible en el código fuente) puede leer o escribir la tabla `progress` de cualquier usuario. Es un acuerdo consciente por simplicidad (solo hay 2 usuarios y los datos son pesos de gimnasio, nada sensible). Si en el futuro se quiere proteger de verdad, el siguiente paso natural es añadir Supabase Auth (login real) y una política RLS que solo permita a cada usuario tocar su propia fila.

## Estado actual (v1.4.0)

- **Sin progresión automática:** los ejercicios, series, reps y pesos son siempre los de la rutina y solo cambian a mano desde "Editar rutina". Las fases de cada plan se conservan en los datos, pero no modifican nada ni se muestran. "Registrar lo que hiciste hoy" solo guarda el historial (gráfica y último registro). En el futuro se añadirá un plan avanzado de progresión.
- **Interfaz sin textos explicativos:** sin notas de ejercicio, foco del día, regla de progresión, aviso de días sin entrenar ni aviso de día de descanso.
- **Estadísticas por ejercicio:** botón junto a desplegar que abre una gráfica del peso en el tiempo (registros de cada sesión y, en discontinuo, los cambios de peso hechos en la rutina), con inicio, actual, máximo, cambio y los últimos registros.
- **Añadir y quitar días de entreno** desde "Editar rutina": los días libres de la semana se pueden convertir en día de entreno, y cualquier día se puede quitar (siempre queda al menos uno).
- **Modo edición:** nombre del ejercicio y grupo muscular a mano (sin sugerencias), nombre y tipo del día editables, series visibles sin desplegar, sin check de hecho y "+ Añadir ejercicio" arriba de la lista.

## Funciones de la v1.0.0

- **Modo gimnasio**: al marcar un ejercicio como hecho o registrarlo arranca un temporizador de descanso (2 min en básicos de ≤ 8 reps, 75 s en el resto, 60 s en peso corporal) que sigue visible mientras navegas; −15 / +30 s / parar. Vibra al terminar.
- **Gráfica de evolución** por ejercicio (peso o reps) y último registro visible en cada tarjeta.
- **Series semanales por músculo**: ver si llegas a las ~10–20 series por músculo y semana que apoya la evidencia para ganar músculo.
- **Calendario editable**: en "Editar rutina" puedes mover un día de entreno a otro día de la semana (si está ocupado, se intercambian).
- **Sustituir ejercicio** por alternativas del mismo músculo, con el material (barra, mancuernas, polea, máquina…).
- **Sincronización más segura**: si dos dispositivos registran por separado, se combinan los historiales en vez de pisarse; lo que no se pudo subir se reenvía al volver la conexión; el pie de la página indica el estado. Copia de seguridad: "Exportar datos" / "Importar datos" (JSON por perfil).
- **PWA**: `manifest.webmanifest` + `sw.js` (offline). Sube `CACHE_VERSION` en `sw.js` en cada release para que los móviles recojan los cambios.

## Plan de Nava (v2): Torso / Pierna ×4, octubre 2026 → junio 2027

- **Semana:** lunes Torso A (fuerza), martes Pierna A (fuerza), jueves Torso B (hipertrofia), viernes Torso C (4º día, opcional: hombro, espalda alta y brazos, más dos ejercicios de pierna residual). El tren superior entra 3 veces por semana y la pierna 1 (+ residual).
- **Progresión:** doble progresión por rango de reps (6–10 en básicos, 8–12 y 10–15 en accesorios, 12–20 en laterales y gemelos).
- **Calendario (12 fases):** bloques de 5–6 semanas con descarga entre ellos, parada de Navidad (21 dic–3 ene), semana de reentrada (−12 % de peso y una serie menos), un bloque de volumen en marzo-abril (+1 serie por ejercicio) y un bloque final de pico en junio.
- **Cambio desde el plan antiguo:** tus pesos guardados (serie pesada de 4–6 reps) se convierten automáticamente al nuevo rango con la fórmula de Epley y se conserva el historial. Los ejercicios nuevos (remo abierto en polea, pec-deck, laterales en máquina, extensión sobre la cabeza, curl femoral sentado) arrancan en "Elige peso".
- **Vacaciones sueltas:** si pasas 10+ días sin registrar entrenos, la app propone bajar los pesos un 10 % (15 % a partir de 21 días) y volver a subir.

## Estructura del proyecto

| Archivo | Contenido |
|---|---|
| `index.html`, `styles.css` | Estructura y estilos |
| `js/store.js` | Persistencia (localStorage + Supabase), fusión de datos, estado de sincronización |
| `js/core.js` | Utilidades, fechas y periodización por fases |
| `js/timer.js` | Temporizador de descanso |
| `js/library.js` | Músculos, biblioteca de ejercicios y alternativas |
| `js/builders.js` | Plantillas de rutina y creación de perfiles |
| `js/data-nava.js`, `js/data-cristian.js`, `js/profiles.js` | Rutinas de Nava (plan v2) y Cristian, y registro de perfiles |
| `js/engine.js` | Motor genérico: progresión, edición, sesión del día, render |
| `js/app.js` | Selector de perfil y arranque |
| `tests/run.js` | Tests de la lógica (sin dependencias) |

Para probar la lógica: `node tests/run.js`. Para ver la app en local, sirve la carpeta con cualquier servidor estático (`python -m http.server`); el service worker no funciona abriendo el archivo con `file://`.

## Pendiente / ideas

- Supabase Auth con RLS por usuario (hoy no hay login; ver la nota de seguridad). Exige configurar el proyecto de Supabase y cambiar las políticas, así que se deja como decisión aparte.
- Añadir o quitar días de entreno y editar las fases desde la interfaz (hoy se pueden mover de día de la semana, no crear días nuevos).
- Notificaciones/recordatorios de entrenamiento.
