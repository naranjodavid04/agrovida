# AgroVida — Implementation Status

Registro vivo del avance por fases de `IMPLEMENTATION_PROMPT.md`. Cada fase se cierra con archivos, comandos ejecutados, resultados reales, riesgos y siguiente tarea.

## Estado global

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Auditoría y plan | ✅ Completada (2026-07-01) |
| 1 | Fundación (scaffold, tooling, tokens) | ⬜ Pendiente |
| 2 | Backend Supabase (migraciones, RLS) | ⬜ Pendiente |
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

## Fase 1 — Fundación (⬜ pendiente)

## Fase 2 — Backend Supabase (⬜ pendiente)

## Fase 3 — Base de datos local (⬜ pendiente)

## Fase 4 — Autenticación y bootstrap (⬜ pendiente)

## Fase 5 — Sincronización (⬜ pendiente)

## Fase 6 — UI del producto (⬜ pendiente)

## Fase 7 — Validación y cierre (⬜ pendiente)
