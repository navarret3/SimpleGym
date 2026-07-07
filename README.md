# SimpleGym

App de rutinas de gimnasio para dos personas (Nava y Cristian), en un único `index.html` sin build ni dependencias, pensada para servirse tal cual desde GitHub Pages.

## Cómo funciona hoy

- Al abrir la app eliges quién entrena (se recuerda en el dispositivo). También puedes ir directo con `index.html?u=nava` o `index.html?u=cristian`.
- Los pesos, el registro de cada sesión y las ediciones de rutina (nombre, series, reps, ejercicios añadidos/eliminados) se guardan **siempre en local** (`localStorage`), así que funciona sin conexión.
- Si configuras Supabase (ver abajo), además esos mismos datos se sincronizan en la nube: entras desde el móvil o el portátil y ves el mismo progreso.

### Un motor genérico, varias rutinas

La app ya no tiene una implementación distinta por persona: hay **un único motor** (`initProfileApp`) que sabe periodizar, editar, guardar progreso y mostrar el día de hoy. Cada persona es solo un objeto de configuración (`NAVA_CONFIG`, `CRISTIAN_CONFIG`, ...) con sus propias fases, días y ejercicios, registrado en `PROFILES`. Añadir una rutina nueva para otra persona es crear su `*_CONFIG` y una línea en `PROFILES` — no hace falta tocar el motor ni duplicar código.

Gracias a esto, tanto Nava como Cristian tienen:

- **Periodización automática por fecha**: cada rutina define sus fases (fuerza, hipertrofia, descarga, mantenimiento, test) con fechas concretas. La app detecta la fase activa y calcula solo las series/reps/peso de cada ejercicio a partir del mismo dato base (peso de referencia): en hipertrofia añade una serie y sube las reps bajando el peso, en descarga quita una serie y baja el peso ~12%, en semana de test sube ligeramente el peso con menos series. Se ve en la etiqueta "MODO ..." de cada día. El plan de Nava tiene 12 fases a lo largo del año; el de Cristian por ahora tiene una única fase de recomposición (se pueden añadir más fases —p. ej. una descarga— sin tocar código).
- **Entrenamiento de hoy por defecto**: al entrar, la app detecta el día de la semana y muestra directamente la rutina de hoy (si toca descanso, avisa cuál es el próximo entreno).
- **Registro de peso con progresión protegida**: "Registrar lo que hiciste hoy" solo hace subir el peso de referencia durante las fases de fuerza/test — en las demás fases queda guardado en tu historial pero no mueve el peso base.
- **Editar rutina con biblioteca de ejercicios**: el nombre del ejercicio tiene autocompletado con una biblioteca compartida de ejercicios habituales — si eliges uno de la lista, el grupo muscular se actualiza solo. También puedes fijarlo a mano con el selector de al lado, así el banner de color siempre es correcto aunque escribas un nombre que no esté en la biblioteca.

Esto es un motor de reglas (periodización por bloques), no una IA generativa en vivo: no hay ninguna llamada a un servicio de IA desde el navegador (evita exponer una API key en código público).

> Nota: el plan de Cristian tenía antes un segundo bloque ("Plan Ávila", pensado para cuando empezara la academia) con su propio selector de bloques. Se ha retirado — de momento solo queda el plan de 5 días PPL actual como fase única de recomposición. Si hace falta reintroducir un cambio de bloque en el futuro, se modela como una fase nueva con fecha de inicio en `CRISTIAN_CONFIG.phases`.

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
4. En [index.html](index.html), busca `STORE_CONFIG` (cerca del principio del `<script>`) y rellena:

   ```js
   var STORE_CONFIG = {
     url: "https://tu-proyecto.supabase.co",
     anonKey: "tu-anon-key",
   };
   ```

5. Sube el cambio. La primera vez que cada persona registre un peso, se creará su fila en `progress` y desde ese momento cualquier dispositivo con el mismo usuario verá los mismos datos.

### Nota de seguridad

Al no haber login, cualquiera que tenga la `anon key` (visible en el código fuente) puede leer o escribir la tabla `progress` de cualquier usuario. Es un acuerdo consciente por simplicidad (solo hay 2 usuarios y los datos son pesos de gimnasio, nada sensible). Si en el futuro se quiere proteger de verdad, el siguiente paso natural es añadir Supabase Auth (login real) y una política RLS que solo permita a cada usuario tocar su propia fila.

## Ideas para seguir mejorando

- Añadir una nueva fase de periodización a Cristian (p. ej. una semana de descarga o un bloque de hipertrofia), o una rutina completa para una tercera persona (basta con un nuevo `*_CONFIG` + entrada en `PROFILES`).
- Login real por usuario (Supabase Auth) en vez del selector simple.
- Historial y gráficas de progreso por ejercicio (ya se guarda el historial de las últimas 10 sesiones, solo falta visualizarlo).
- Notificaciones/recordatorios de entrenamiento.

