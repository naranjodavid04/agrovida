# AgroVida — Implementation Status

Registro vivo del avance por fases de `IMPLEMENTATION_PROMPT.md`. Cada fase se cierra con archivos, comandos ejecutados, resultados reales, riesgos y siguiente tarea.

## Estado global

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Auditoría y plan | ✅ Completada (2026-07-01) |
| 1 | Fundación (scaffold, tooling, tokens) | ✅ Completada (2026-07-01) |
| 2 | Backend Supabase (migraciones, RLS) | 🟡 Escrita; ejecución bloqueada sin Docker (2026-07-01) |
| 3 | Base de datos local (SQLite, repos, outbox) | ⬜ Pendiente |
| 4 | Autenticación y bootstrap de finca | ⬜ Pendiente |
| 5 | Sincronización | ⬜ Pendiente |
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

## Fase 3 — Base de datos local (⬜ pendiente)

## Fase 4 — Autenticación y bootstrap (⬜ pendiente)

## Fase 5 — Sincronización (⬜ pendiente)

## Fase 6 — UI del producto (⬜ pendiente)

## Fase 7 — Validación y cierre (⬜ pendiente)
