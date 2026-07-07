# SimpleGym

App de rutinas de gimnasio para dos personas (Nava y Cristian), en un único `index.html` sin build ni dependencias, pensada para servirse tal cual desde GitHub Pages.

## Cómo funciona hoy

- Al abrir la app eliges quién entrena (se recuerda en el dispositivo). También puedes ir directo con `index.html?u=nava` o `index.html?u=cristian`.
- Los pesos, el registro de cada sesión y las ediciones de rutina (nombre, series, reps, ejercicios añadidos/eliminados) se guardan **siempre en local** (`localStorage`), así que funciona sin conexión.
- Si configuras Supabase (ver abajo), además esos mismos datos se sincronizan en la nube: entras desde el móvil o el portátil y ves el mismo progreso.

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

- Login real por usuario (Supabase Auth) en vez del selector simple.
- Historial y gráficas de progreso por ejercicio (ya se guarda el historial de las últimas 10 sesiones, solo falta visualizarlo).
- Notificaciones/recordatorios de entrenamiento.
