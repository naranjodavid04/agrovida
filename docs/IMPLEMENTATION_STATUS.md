# AgroVida — Implementation Status

Registro vivo del avance por fases de `IMPLEMENTATION_PROMPT.md`. Cada fase se cierra con archivos, comandos ejecutados, resultados reales, riesgos y siguiente tarea.

## Estado global

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Auditoría y plan | ✅ Completada (2026-07-01) |
| 1 | Fundación (scaffold, tooling, tokens) | ✅ Completada (2026-07-01) |
| 2 | Backend Supabase (migraciones, RLS) | 🟡 Escrita; ejecución bloqueada sin Docker (2026-07-01) |
| 3 | Base de datos local (SQLite, repos, outbox) | ✅ Completada (2026-07-01) |
| 4 | Autenticación y bootstrap de finca | ✅ Completada (2026-07-02) |
| 5 | Sincronización | ✅ Completada (2026-07-02) |
| 6 | UI del producto | ⬜ Pendiente |
| 7 | Validación y cierre | ⬜ Pendiente |

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

## Fase 6 — UI del producto (⬜ pendiente)

## Fase 7 — Validación y cierre (⬜ pendiente)
