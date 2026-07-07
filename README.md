# SimpleGym

App de rutinas de gimnasio para dos personas (Nava y Cristian), en un único `index.html` sin build ni dependencias, pensada para servirse tal cual desde GitHub Pages.

## Cómo funciona hoy

- Al abrir la app eliges quién entrena (se recuerda en el dispositivo). También puedes ir directo con `index.html?u=nava` o `index.html?u=cristian`.
- Los pesos, el registro de cada sesión y las ediciones de rutina (nombre, series, reps, ejercicios añadidos/eliminados) se guardan **siempre en local** (`localStorage`), así que funciona sin conexión.
- Si configuras Supabase (ver abajo), además esos mismos datos se sincronizan en la nube: entras desde el móvil o el portátil y ves el mismo progreso.

### Plan de Nava: periodización automática por fecha

El plan de Nava está dividido en 12 fases a lo largo de un año (fuerza, hipertrofia, descarga, mantenimiento, test), cada una con fechas concretas. La app:

- Detecta la fecha de hoy y muestra automáticamente **el entrenamiento del día** al entrar (si hoy toca descanso, avisa cuál es el próximo entreno).
- Calcula solo, según la fase activa, las series/reps/peso de cada ejercicio a partir del mismo dato base (peso de fuerza actual): en hipertrofia añade una serie y sube las reps bajando el peso, en descarga quita una serie y baja el peso ~12%, en semana de test sube ligeramente el peso con menos series. Se ve en la etiqueta "MODO ..." de cada día.
- El registro de peso ("Registrar lo que hiciste hoy") solo hace subir el peso de referencia durante las fases de fuerza/test — en las demás fases queda guardado en tu historial pero no mueve el peso base, tal y como indica el mensaje de cada fase.

Esto es un motor de reglas (periodización por bloques), no una IA generativa en vivo: no hay ninguna llamada a un servicio de IA desde el navegador (evita exponer una API key en código público).

### Editar rutina: biblioteca de ejercicios

Al pulsar "Editar rutina", el nombre del ejercicio tiene autocompletado con una biblioteca de ejercicios habituales — si eliges uno de la lista, el grupo muscular se actualiza solo. También puedes fijar el grupo muscular a mano con el selector de al lado, así el banner de color siempre es correcto aunque escribas un nombre que no esté en la biblioteca.

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

- Aplicar el mismo motor de periodización + biblioteca de ejercicios al plan de Cristian (por ahora solo está en el de Nava).
- Login real por usuario (Supabase Auth) en vez del selector simple.
- Historial y gráficas de progreso por ejercicio (ya se guarda el historial de las últimas 10 sesiones, solo falta visualizarlo).
- Notificaciones/recordatorios de entrenamiento.

