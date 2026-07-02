# AgroVida — Implementation Status

Registro vivo del avance por fases de `IMPLEMENTATION_PROMPT.md`. Cada fase se cierra con archivos, comandos ejecutados, resultados reales, riesgos y siguiente tarea.

## Estado global

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Auditoría y plan | ✅ Completada (2026-07-01) |
| 1 | Fundación (scaffold, tooling, tokens) | ✅ Completada (2026-07-01) |
| 2 | Backend Supabase (migraciones, RLS) | ✅ Completada y validada en Docker (2026-07-02) |
| 3 | Base de datos local (SQLite, repos, outbox) | ✅ Completada (2026-07-01) |
| 4 | Autenticación y bootstrap de finca | ✅ Completada (2026-07-02) |
| 5 | Sincronización | ✅ Completada (2026-07-02) |
| 6 | UI del producto | ✅ Completada (2026-07-02) |
| 7 | Validación y cierre | ✅ Completada (2026-07-02) — pendientes solo los pasos bloqueados por entorno |

## Entorno verificado (2026-07-01)

- Node 24.16.0, npm 11.13.0, git 2.54 — disponibles.
- Supabase CLI: **no instalada**. Docker: **no instalado**.
- Android SDK / adb / Java: **no instalados**.
- Expo SDK: npm `latest` = 57.0.1 (recién publicado); se usa **SDK 56** por decisión del usuario (ver D-018).
- El proyecto vive dentro de OneDrive: riesgo de EPERM/lentitud con `node_modules` y Metro. Mitigación recomendada: marcar `node_modules` como "Liberar espacio/solo en este dispositivo" o pausar la sincronización de OneDrive durante instalaciones.

## Bloqueos reales (no detienen el trabajo)

| Bloqueo | Impacto | Comando pendiente cuando se desbloquee |
|---------|---------|----------------------------------------|
| Sin Docker + Supabase CLI | Migraciones y tests RLS/pgTAP se escriben pero **no se ejecutan localmente** | `npx supabase db reset` · `npx supabase test db` |
| Sin credenciales Supabase | Auth/sync remoto solo validable con mocks | Crear proyecto, poblar `.env` desde `.env.example`, `npx supabase db push` |
| Sin Android SDK/emulador | Sin build de desarrollo ni ejecución en dispositivo | `npx expo run:android` o build EAS + prueba física |

## Fase 0 — Auditoría y plan (✅ 2026-07-01)

**Hallazgos:**
- El repo contenía solo especificación (`CLAUDE.md`, `docs/*`, `references/AgroVida.dc.html`) y no era repositorio git.
- Sin contradicciones sustanciales entre documentos. Tres decisiones que los documentos delegaban se formalizaron como **D-014** (feed unificado de pull con cursor único por finca), **D-015** (logout limpia datos locales con advertencia si hay outbox pendiente), **D-016** (regla de conflicto de unicidad de leche), más **D-017** (driver SQLite intercambiable para tests en Node) y **D-018** (SDK 56 verificado al bootstrap).

**Archivos:** `.gitignore` (nuevo), `docs/DECISIONS.md` (D-014…D-018), `docs/IMPLEMENTATION_STATUS.md` (nuevo), `git init`.

**Comandos ejecutados:** `git init -b main` ✔ · verificación de toolchain (`node`, `npm`, `git`, `where supabase/docker/adb/java`) ✔ · `npm view expo dist-tags` ✔.

**Riesgos:** los listados en "Bloqueos reales" y el riesgo OneDrive.

**Siguiente tarea:** Fase 1 — scaffold Expo SDK 56 con Expo Router y TypeScript estricto.

## Fase 1 — Fundación (✅ 2026-07-01)

**Implementado:**
- Scaffold Expo SDK 56 (`create-expo-app --template default@sdk-56`, generado en carpeta temporal y fusionado; sin demos de la plantilla).
- `package.json` con scripts `typecheck/lint/format/test/doctor`; dependencias SDK 56 vía `npx expo install`: `expo-sqlite`, `@react-native-community/netinfo`, `react-native-svg`, `expo-image-picker`, `expo-file-system`, `expo-crypto`, `expo-haptics`, fuentes Manrope y Space Grotesk empaquetadas. `@supabase/supabase-js`, `zod`, `react-native-url-polyfill`.
- TypeScript estricto + `noUncheckedIndexedAccess`; regla ESLint `no-explicit-any: error`.
- Jest en dos proyectos: `domain` (Node + babel-preset-expo, para db/sync/lib) y `ui` (jest-expo). `transformIgnorePatterns` ajustado porque babel-preset-expo reescribe `process.env` al módulo ESM `expo/virtual/env`.
- `src/lib/theme/tokens.ts` (tokens completos de DESIGN_SPEC), `src/lib/i18n/strings.ts` (copy es-CO centralizado), `src/lib/env.ts` (validación zod + `.env.example`), `src/lib/logger.ts` (buffer de diagnóstico con redacción de secretos), `src/lib/constants.ts` (`MAX_LITERS_PER_SESSION = 60`), `src/types/domain.ts`.
- `src/app/_layout.tsx` (fuentes, splash, GestureHandlerRootView) y `src/app/index.tsx` (placeholder de bootstrap; se reemplaza en Fase 4).

**Comandos ejecutados y resultados:**
- `npm install` + `npx expo install …` ✔ (sin errores EPERM de OneDrive en esta corrida)
- `npx tsc --noEmit` ✔ · `npx eslint .` ✔ · `npx prettier --check .` ✔
- `npx jest` ✔ 2 suites, 5 tests (logger redaction, env validation)
- `npx expo-doctor` ✔ 21/21 checks (tras alinear jest 29.7, @types/jest 29.5, babel-preset-expo 56, eslint-config-expo 56)

**Riesgos:** ninguno nuevo; los assets de ícono/splash son placeholders de Expo (pendiente identidad visual).

**Siguiente tarea:** Fase 2 — migraciones Supabase con RLS y RPC `pull_changes`.

## Fase 2 — Backend Supabase (🟡 escrita, no ejecutada — 2026-07-01)

**Implementado (6 migraciones + 3 suites pgTAP):**
- `sync_version_seq` global + trigger `set_server_version()` en las 5 tablas (D-008: el cursor nunca es un reloj de dispositivo).
- `farms`, `farm_members`, `farm_invites` con helpers RLS no recursivos (`is_farm_member`, `farm_role`, `is_farm_owner` — SECURITY DEFINER), trigger que crea la membresía owner al crear finca, y `accept_farm_invite()` SECURITY DEFINER (valida email autenticado, pendiente y no expirada). `farm_members` no tiene política de INSERT a propósito: solo entra por rutas revisadas.
- `cows`: chapeta única (case-insensitive) entre no-eliminadas por finca, `mother_id ≠ id` (CHECK), madre de la misma finca (trigger), lifecycle owner-only vía USING/WITH CHECK (worker solo toca vacas activas y no puede sacarlas de `active`).
- `milk_records`: única sesión activa por finca/vaca/fecha/jornada (índice parcial), `liters entre 0 y 60` (espejo de `MAX_LITERS_PER_SESSION`), vaca de la misma finca (trigger).
- RPC `pull_changes(farm, after_version, limit)` SECURITY INVOKER (RLS filtra cada rama) — feed unificado ordenado por `server_version` (D-014).
- Bucket privado `cow-photos` con políticas por primer segmento de ruta = `farm_id`.
- Tests pgTAP (35 aserciones): aislamiento cross-farm y pull vacío para no-miembros; permisos worker vs owner (lifecycle, invitaciones, membresías); unicidad de chapeta y sesión, genealogía, tope de litros, monotonicidad de `server_version`, aceptación de invitación.

**Comandos ejecutados:** `npx supabase init` ✔ (estructura y `config.toml`).

**Bloqueado (documentado):** `npx supabase db reset` y `npx supabase test db` requieren Docker Desktop — no disponible en esta máquina. Las migraciones y tests quedan versionados y listos; **ninguna prueba de BD se declara aprobada**.

**Actualización 2026-07-02 — desbloqueado:** con Docker Desktop instalado se ejecutó `npx supabase start` + `db reset` (las 6 migraciones aplican limpias) + `npx supabase test db`. La primera corrida detectó un problema real: faltaban los **GRANTs de tabla** para `authenticated` (todo fallaba con `permission denied` antes de llegar a RLS). Se añadieron grants explícitos por tabla en las migraciones (sin `delete` en ninguna: las correcciones son soft deletes; `farm_members` sin `insert`: solo entra por rutas SECURITY DEFINER). Tras el fix: **35/35 aserciones pgTAP PASS** (aislamiento cross-farm, restricciones de worker, unicidad, genealogía, invitaciones, monotonicidad y orden del feed).

**Siguiente tarea:** Fase 3 — espejo SQLite local con outbox transaccional.

## Fase 3 — Base de datos local (✅ 2026-07-01)

**Implementado:**
- Interfaz de driver síncrona (`src/db/driver.ts`, D-017) con transacciones anidadas por savepoints (BEGIN IMMEDIATE en nivel 0); implementación expo-sqlite (`src/db/expo-driver.ts` + `src/db/database.ts` con WAL y foreign_keys) y better-sqlite3 para Jest (`tests/helpers/testDb.ts`).
- Runner de migraciones locales con `PRAGMA user_version`, cada migración atómica (`src/db/migrations.ts`, `src/db/schema.ts` v1: espejos de dominio + `sync_queue`, `sync_state`, `photo_upload_queue`, `sync_conflicts`, `app_state`; índices únicos parciales que replican chapeta y sesión de leche).
- Outbox transaccional (`src/sync/outbox.ts`): encolar en la misma transacción, listado determinista por id, ack por borrado, fallo con `attempt_count`/`next_attempt_at`.
- Repositorios (`src/repositories/`): `cows` (crear/editar/lifecycle/soft-delete/madre-hijas/búsqueda, payloads con forma remota), `milk` (upsert por sesión que edita in situ, historial, y derivados: total del día, delta vs ayer con null sin comparación, tendencia 7 días con ceros, totales de finca), `farms` (caché remoto), `appState`, `conflicts` (D-016), `photoQueue` (D-010). La UI nunca emite SQL.
- Utilidades: `ids` (UUID inyectable), `clock` (inyectable), `dates` (edad derivada D-006, fechas locales), `validation` (litros 0–60 finitos, nombre, fecha futura, partos, chapeta).

**Comandos ejecutados y resultados:**
- `npx jest` ✔ **8 suites, 42 tests**: migraciones (idempotencia, rollback atómico, savepoints anidados), vacas (chapeta duplicada sin escrituras parciales, genealogía, estados independientes D-005, tombstone), leche (unicidad de sesión editando in situ, derivados con casos borde, exclusión de soft-deleted), outbox (orden, backoff, rollback conjunto con la escritura de dominio).
- `npx tsc --noEmit` ✔ · `npx eslint .` ✔ · `npx prettier --check .` ✔

**Riesgos:** el driver expo-sqlite solo se ejercita en dispositivo (misma SQL que better-sqlite3; riesgo bajo, se valida en Fase 7 con export).

**Siguiente tarea:** Fase 4 — autenticación y bootstrap de finca.

## Fase 4 — Autenticación y bootstrap (✅ 2026-07-02)

**Implementado:**
- `src/lib/supabase.ts`: cliente con sesión persistida en `expo-sqlite/kv-store` (sobrevive reinicios offline), auto-refresh, sin detección de URL.
- `src/features/auth/session.ts`: login/registro (con estado `needs_confirmation`), lectura de sesión almacenada sin red, guard de logout D-015 (`hasPendingLocalChanges`) y `signOutAndClear` (revoca sesión local aun offline + `clearLocalData`).
- `src/features/bootstrap/service.ts`: `bootstrapFromRemote` cachea fincas/membresías/invitaciones + identidad en una transacción; `restoreFromCache` para reinicios offline (continúa tras expiración del token, sync espera refresh); `createFarm` (el trigger del backend crea la membresía owner), `acceptInvite` vía RPC, `inviteMember`, `deactivateMember`; finca activa persistida y validada contra membresías.
- `src/features/auth/AuthProvider.tsx`: máquina de estados `loading → signedOut | needsFarm | ready` con `sessionExpired`, acciones de sesión/finca; montada en el layout raíz.
- Pantallas 1–5: bootstrap/loading, login, registro, crear/seleccionar finca + invitaciones pendientes con aceptación; componentes reutilizables (`ScreenContainer` con teclado/safe-area, `TextField` ≥48dp, `AppButton`, `OfflineBanner`); mapeo de errores auth a copy es-CO (`errors.ts`); aviso explícito cuando falta `.env`.
- `clearLocalData` movido a `src/db/maintenance.ts` (sin imports de expo) para testearlo en Node.

**Comandos ejecutados y resultados:**
- `npx jest` ✔ **9 suites, 48 tests** (nuevos: bootstrap cachea y restaura, finca activa validada, membresía inactiva sin rol, createFarm aplica local, acceptInvite llama la RPC, guard/limpieza de logout D-015).
- `npx tsc --noEmit` ✔ · `npx eslint .` ✔ · `npx prettier --check .` ✔

**Riesgos:** flujos online (login real, RLS) no ejercitados contra un proyecto Supabase — cubiertos por mocks; pendiente validación E2E cuando haya credenciales.

**Siguiente tarea:** Fase 5 — coordinador de sincronización.

## Fase 5 — Sincronización (✅ 2026-07-02)

**Implementado:**
- `src/sync/engine.ts` — ciclo completo: push del outbox en orden determinista (id ascendente; un fallo transitorio detiene la fase para no adelantar mutaciones), clasificación de resultados (ok / transitorio con backoff / violación de unicidad / rechazo permanente), pull por RPC con cursor que **solo avanza tras aplicar el lote en transacción**, tombstones aplicados, y protección de ediciones locales pendientes (una fila pulled no pisa una entidad con mutación en outbox).
- Conflicto de leche D-016 en `resolveMilkUniqueConflict`: litros iguales → éxito idempotente; distintos → el servidor queda canónico localmente y el valor local va a `sync_conflicts` para resolución del dueño. Rechazos permanentes (RLS/constraints) también se preservan en conflictos — nada se descarta en silencio.
- `src/sync/remote.ts` — interfaz `SyncRemote` + implementación Supabase (upsert por id, clasificación de errores Postgres, RPC `pull_changes`); permite inyectar un servidor falso en tests.
- `src/sync/backoff.ts` (5s→15min acotado), `src/sync/syncState.ts` (cursor por finca), `src/sync/photos.ts` + `photoUploader.ts` (cola independiente D-010: subir → `photo_path` vía outbox; fallo → backoff sin bloquear datos).
- `src/sync/coordinator.ts` — single-flight con re-ejecución si llega una solicitud durante un ciclo; espera sesión válida (ARCHITECTURE §7); snapshot de estado UI (`offline/syncing/synced/error/action_required` + pendientes + conflictos).
- `src/features/sync/SyncProvider.tsx` — triggers automáticos: reconexión (NetInfo), foreground (AppState), refresh de auth (`onAuthStateChange`), timer acotado de reintento y `retryNow` manual para diagnósticos. Montado en el layout raíz.

**Comandos ejecutados y resultados:**
- `npx jest` ✔ **12 suites, 62 tests**. Escenarios de sync cubiertos: orden determinista + ack; interrupción a mitad de lote; fallo transitorio con backoff y reintento idempotente; entrega duplicada (ack perdido); pull con tombstones y avance de cursor solo tras aplicar; fallo de pull sin avance de cursor; edición local pendiente no pisada por pull; conflicto de leche igual/distinto (D-016); convergencia de dos dispositivos (criterio de aceptación §8); cola de fotos éxito/fallo.
- `npx tsc --noEmit` ✔ · `npx eslint .` ✔ (corregidas 4 violaciones de reglas React Compiler en SyncProvider) · `npx prettier --check .` ✔

**Riesgos:** el mapeo de códigos de error del PostgREST real puede diferir en matices del clasificador — se validará contra un proyecto Supabase real; el uploader de fotos usa `fetch(file://)` que se valida en dispositivo.

**Siguiente tarea:** Fase 6 — UI del producto (pantallas 6–15).

## Fase 6 — UI del producto (✅ 2026-07-02)

**Implementado — las 15 pantallas requeridas (PRODUCT_SPEC §4):**
- Tabs Inicio/Rebaño/Resumen (`src/app/(tabs)/`) + rutas secundarias (`cow/new`, `cow/[id]`, `cow/[id]/edit|milk|history`, `members`, `settings`, `sync-status`), sobre las pantallas 1–5 de la Fase 4.
- **Carrusel Design A** (pantalla 6, `CowCard.tsx`): banner de foto con chips superpuestos, nombre/raza, litros de hoy dominante (Space Grotesk 46), delta vs ayer con signo y texto, sparkline 7 días (react-native-svg), edad/partos/chapeta, acción "Ver perfil". Una vaca por viewport (Animated.FlatList + reanimated, paging con clamp), indicador textual `n / total`, botones accesibles anterior/siguiente sin swipe, scroll vertical intacto.
- Rebaño (7): búsqueda nombre/chapeta, miniatura 48dp, chips, total de hoy y mini-sparkline, estados vacío/sin resultados, FAB agregar.
- Detalle (8): producción derivada, info, genealogía navegable madre↔hijas, "foto pendiente de subir", registrar/historial, y cambio de lifecycle **solo owner**.
- Alta/edición (9, `CowForm.tsx`): foto (cámara/galería → resize 1280 + JPEG 0.7 → almacenamiento de la app → cola de subida en la misma transacción), nombre, chapeta, **fecha de nacimiento con selector nativo + flag estimada** (sin edad numérica), raza, selector de madre con búsqueda, partos, lactancia y preñez **separadas** (sin estado combinado, sin "leche hoy"); al guardar ofrece "Registrar ordeño" como acción aparte.
- Registrar leche (10): fecha hoy por defecto, segmentado mañana/tarde, teclado decimal grande, muestra el registro existente de la jornada, guarda offline con confirmación local inmediata + háptica, y preserva el input ante error.
- Historial (11), Resumen de finca (12: total del día dominante, delta, sparkline de finca, vacas con/sin registro), Miembros e invitaciones owner-only (13), Ajustes con logout D-015 (14), Diagnóstico de sync (15: estado, pendientes, última sync, **resolución explícita de conflictos D-016** conservar servidor / usar mi valor, retry manual, log redactado).
- Sin controles del prototipo: sin Diseño A/B, sin ES/EN, sin bezel, sin image-slot. Copy 100% es-CO centralizado; chips y deltas nunca comunican solo por color; targets ≥44/48dp; labels de screen reader en todas las acciones.
- `useLocalQuery`: hook de lectura SQLite que refresca en focus y tras cada snapshot de sync (la UI nunca emite SQL).
- Dependencias añadidas vía `expo install`: `@react-native-community/datetimepicker`, `expo-image-manipulator`, `@expo/vector-icons`.

**Comandos ejecutados y resultados:**
- `npx tsc --noEmit` ✔ · `npx eslint .` ✔ (corregidas violaciones de reglas React Compiler: refs en render, setState síncrono en efectos, memoización) · `npx prettier --check .` ✔
- `npx jest` ✔ 12 suites, 62 tests · `npx expo-doctor` ✔ 21/21
- `npx expo export --platform android` ✔ — bundle Hermes generado (6.1MB), Metro compila toda la UI.

**Riesgos:** gestos/animaciones del carrusel y flujos de cámara/fecha solo verificables en dispositivo (sin emulador local); fotos de otros dispositivos requieren red para URL firmada (documentado en `CowPhoto`).

**Siguiente tarea:** Fase 7 — validación integral y reporte final.

## Fase 7 — Validación y cierre (✅ 2026-07-02)

### Comandos ejecutados y resultados reales (2026-07-02)

| Comando | Resultado |
|---------|-----------|
| `npm install` | ✔ up to date, 1119 paquetes auditados |
| `npx tsc --noEmit` | ✔ sin errores |
| `npx eslint .` | ✔ sin errores ni warnings |
| `npx prettier --check .` | ✔ formato correcto |
| `npx jest` | ✔ **12 suites, 62 tests, 0 fallos** |
| `npx expo-doctor` | ✔ 21/21 checks |
| `npx expo export --platform android` | ✔ bundle Hermes generado (`dist/`, 6.1MB) |
| `npx supabase db reset` / `npx supabase test db` | ⛔ **bloqueado**: requiere Docker Desktop (no instalado) |
| Build/emulador Android (`npx expo run:android`) | ⛔ **bloqueado**: sin Android SDK/adb/Java en la máquina |
| E2E contra proyecto Supabase real | ⛔ **bloqueado**: sin credenciales (`.env`) |

### Reporte final (formato de IMPLEMENTATION_PROMPT.md)

**1. Fases implementadas:** 0–7 completas en lo ejecutable localmente. La Fase 2 tiene el SQL y los tests pgTAP escritos y versionados pero sin ejecutar (Docker).

**2. Decisiones de arquitectura importantes:**
- D-014: pull por feed unificado (`pull_changes` RPC, SECURITY INVOKER) con un cursor por finca.
- D-015: logout con advertencia si hay outbox pendiente; al confirmar se limpia el dispositivo.
- D-016: conflicto de sesión de leche → servidor canónico + valor local preservado en `sync_conflicts` con resolución explícita en diagnósticos.
- D-017: driver SQLite síncrono intercambiable (expo-sqlite en la app, better-sqlite3 en Jest) — permitió probar migraciones, repos y todo el motor de sync sin emulador.
- D-018: Expo SDK 56 (estable maduro) elegido por el usuario frente al 57 recién publicado.
- Pull nunca pisa entidades con mutaciones pendientes en el outbox; el cursor solo avanza tras aplicar el lote en transacción; los push van en orden determinista y un fallo transitorio detiene la fase.

**3. Archivos creados/cambiados:** ~70 archivos. Núcleo: `src/db/*` (driver, esquema v1, migraciones), `src/repositories/*` (cows, milk, farms, appState, conflicts, photoQueue), `src/sync/*` (outbox, engine, coordinator, remote, backoff, photos, syncState), `src/features/*` (auth, bootstrap, herd, sync UI), `src/app/*` (15 pantallas), `src/lib/*` (tokens, strings es-CO, env, logger, dates, validation, ids, clock, supabase), `supabase/migrations/*` (6 migraciones), `supabase/tests/database/*` (3 suites pgTAP), `tests/*` (12 suites Jest), configs (tsconfig estricto, eslint, prettier, jest, babel), `docs/DECISIONS.md` (D-014…D-018), este archivo.

**4. Tests ejecutados:** los de la tabla superior. Cobertura de escenarios clave: transacción+outbox con rollback, unicidad local de chapeta/sesión, derivados (hoy/ayer/7 días/finca) con casos borde, edad derivada, push determinista, interrupción, backoff+reintento idempotente, entrega duplicada, tombstones, cursor solo-tras-aplicar, edición local pendiente protegida del pull, conflicto de leche igual/distinto, convergencia de dos dispositivos, cola de fotos éxito/fallo, bootstrap/caché offline, guard de logout.

**5. Limitaciones y bloqueos honestos:**
- **RLS sin ejecutar**: las políticas y los 35 asserts pgTAP están escritos pero no corridos (falta Docker). Ninguna prueba de BD remota se declara aprobada.
- **Sin validación en dispositivo**: carrusel/gestos, cámara, selector de fecha, háptica y el driver expo-sqlite real solo se verificaron por compilación del bundle, no en runtime Android.
- **Sin credenciales Supabase**: login/sync reales sin probar E2E; los criterios de aceptación multi-dispositivo se cubrieron con servidor simulado en Jest.
- Fotos de otros dispositivos requieren conexión (URL firmada del bucket privado).
- Assets de ícono/splash siguen siendo placeholders de Expo.
- El mapeo de errores PostgREST del clasificador de push puede requerir ajustes contra el backend real.

**6. Siguiente tarea recomendada:** instalar Docker Desktop y ejecutar `npx supabase start && npx supabase db reset && npx supabase test db` para validar migraciones y RLS; después crear el proyecto Supabase, llenar `.env`, `npx supabase db push`, y probar el flujo completo en un dispositivo Android físico (`npx expo run:android` o build EAS), incluyendo el criterio de aceptación de modo avión.

## Post-MVP (2026-07-02) — desbloqueos y endurecimiento

**Hecho:**
- **Tests de componentes UI**: `@testing-library/react-native` v14 (API async) sobre jest-expo — 15 tests nuevos para `StatusChips` (D-005: chips independientes, lifecycle inactivo reemplaza), `DeltaBadge` (dirección con signo+texto, no solo color), `SegmentedControl`, `TextField` (labels y rol alert), `Sparkline` (label accesible, división por cero). **Total: 17 suites, 77 tests.**
- **Assets de marca**: ícono, adaptive icon (foreground/background/monochrome), splash y favicon generados en verde `#16794F` con la "A" blanca (GDI+; reemplazan los placeholders azules de Expo).
- **Backend validado en Docker**: ver actualización en Fase 2 — fix de GRANTs + **35/35 pgTAP PASS**.
- **`.env` real configurado** con la URL y publishable key del proyecto Supabase del usuario (`xzcfhqhjbiqtgawypzif`); el archivo está gitignoreado.

**Backend hosted desplegado (2026-07-02):**
- `npx supabase login` (usuario) + `link` + `db push`: las **7 migraciones aplicadas** al proyecto `xzcfhqhjbiqtgawypzif` (verificado con `migration list`: local == remoto).
- Migración de endurecimiento `20260702120000_lock_anon.sql`: revocado todo acceso de `anon` a tablas/funciones (EXECUTE explícito solo para `authenticated`); validada primero en local (35/35 pgTAP) y luego en hosted.
- Smoke test contra el proyecto real: `GET /rest/v1/farms` como anónimo → **401 permission denied** ✔; antes del lock retornaba `[]` (RLS ya filtraba, ahora ni siquiera puede consultar).

**Bug real encontrado en la prueba de campo (2026-07-02) — corregido:**
- Síntoma: crear finca desde el teléfono fallaba con el mensaje genérico de sync. Causa: el cliente inserta con `RETURNING` y Postgres valida la fila devuelta contra la política SELECT (`is_farm_member`) **antes** de que el trigger cree la membresía owner → `new row violates row-level security policy for table "farms"`. El pgTAP original no lo cubría porque insertaba sin RETURNING.
- Fix: migración `20260702130000_fix_farm_creator_visibility.sql` (el creador siempre ve su finca: `or created_by = auth.uid()`) + test de regresión con RETURNING (36/36 pgTAP local) + push a hosted + **E2E real verificado**: signup vía API + `POST /farms?select=*` → 201 con fila y membresía owner del trigger.
- Mejora de UX derivada: `authErrorMessage` ya no promete reintentos automáticos en acciones directas (nuevo copy `actionFailed`/`notAllowed`; los errores RLS/permisos se distinguen).

**Pendiente (requiere acción del usuario):**
- Continuar la prueba en teléfono con Expo Go SDK 56: crear finca (ya corregido), vaca y ordeño; criterio de modo avión y reconexión.
