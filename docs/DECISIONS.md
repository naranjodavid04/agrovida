# AgroVida — Decision Log

This file resolves contradictions in the legacy `CLAUDE.md`, design handoff, and HTML prototype.

## D-001 — Product name
**Decision:** The canonical product name is **AgroVida**. “Hato” is retired as a provisional name.

## D-002 — Starting point
**Decision:** Build a clean production repository from scratch. Do not treat the design prototype as an application codebase.

The prototype files are reference material:
- `AgroVida.dc.html`: visual and interaction reference.
- `android-frame.jsx`: mock phone chrome only.
- `image-slot.js`: design-tool-only image placeholder.
- legacy `README.md`: design handoff, not the domain model.
- legacy `CLAUDE.md`: useful product context, but superseded by these documents.

## D-003 — Design alternatives
**Decision:** “Diseño A / Diseño B” is not a production feature. Use **Design A** as the MVP carousel card. Keep Design B as an archived alternative, not a user-facing toggle.

## D-004 — Language
**Decision:** The MVP UI is Spanish (Colombia). Remove the ES/EN toggle. Centralize strings so English can be added later without refactoring screens.

## D-005 — Animal statuses
**Decision:** Do not use one status enum for `Lactando`, `Preñada`, `Vacía`, `Seca`, `Vendida`, `Muerta`, and `Descartada`.

Store independent dimensions:
- `lifecycle_status`: `active | sold | deceased | culled`
- `lactation_status`: `lactating | dry | unknown`
- `pregnancy_status`: `pregnant | open | unknown`

The UI may show two compact chips, for example “Lactando” and “Preñada”. An inactive lifecycle state takes visual precedence.

## D-006 — Age and birth date
**Decision:** Store `birth_date`, never numeric age. The add/edit flow asks for birth date and may mark it as estimated. Age is calculated for display.

## D-007 — Milk data
**Decision:** Do not store `milk`, `yesterday`, or `trend` on the cow. Store morning/afternoon `milk_records`; derive daily total, yesterday delta, and seven-day trend.

## D-008 — Offline synchronization
**Decision:** SQLite is the immediate source of truth. Use an outbox pattern.

Do not use device `updated_at` as the pull cursor. The backend must assign a monotonic `server_version` to each changed row. Pull rows where `server_version > cursor`, ordered by version. Local timestamps are for display/diagnostics only.

## D-009 — Deletes
**Decision:** Selling, death, and culling are lifecycle changes, not deletes. Use `deleted_at` only for erroneous records that must disappear while propagating a tombstone to other devices.

## D-010 — Photos
**Decision:** A photo selected offline is stored by local URI and queued separately for upload. The cow record references a stable storage path after upload. Failed photo uploads must not block cow data synchronization.

## D-011 — Supabase schema management
**Decision:** Use Supabase CLI migrations in version control. Dashboard-only schema edits are not accepted as the source of truth.

## D-012 — Expo version
**Decision:** Do not permanently pin the project instructions to a stale Expo version. At bootstrap, verify official compatibility. Prefer the current stable SDK with a development build. Use SDK 54 only if the user explicitly requires the installed Expo Go workflow.

## D-013 — Delivery strategy
**Decision:** Implement in tested vertical slices. Do not ask an agent to generate the entire app in one unverified pass.

## D-014 — Pull strategy: unified change feed
**Decision:** Remote pulls use a single authenticated RPC `pull_changes(p_farm_id, p_after_version, p_limit)` that returns the union of all syncable tables (rows and tombstones) ordered by the global monotonic `server_version`. The client keeps **one cursor per farm** in `sync_state`. This preserves cross-table ordering (a cow always arrives before its milk records within the feed) and keeps client bookkeeping minimal. Resolves the open choice in `ARCHITECTURE.md` §3.

## D-015 — Logout and local data
**Decision:** On explicit logout, local farm data and the session are cleared (shared-device safety). If the outbox has pending mutations, the app warns that unsynchronized data will be lost and requires explicit confirmation; the recommended path is to sync first. Resolves the open choice in `ARCHITECTURE.md` §7.

## D-016 — Milk session uniqueness conflict rule
**Decision:** When a push is rejected by the unique `(farm_id, cow_id, record_date, session)` constraint:
- If local liters equal the canonical remote value → treat as idempotent success and acknowledge the mutation.
- If they differ → the server record stays canonical; the rejected local value is stored in a local `sync_conflicts` table and surfaced in sync diagnostics for explicit owner resolution (keep server value or overwrite with local value as a new edit). No local mutation is silently dropped. Implements `ARCHITECTURE.md` §9.

## D-017 — Local database test strategy
**Decision:** SQLite access goes through a thin driver interface. The app binds it to `expo-sqlite`; Jest binds it to `better-sqlite3` running in Node (same SQL dialect). Migrations, repositories, transactional outbox behavior, derived queries, and the sync engine are tested without an emulator.

## D-018 — Expo SDK 56 at bootstrap (2026-07-01)
**Decision:** Per D-012 the SDK was verified at bootstrap: npm `latest` was Expo SDK 57 (57.0.1, published days earlier). The user chose **SDK 56** (56.0.x, mature patch level) for ecosystem stability. Revisit the upgrade to SDK 57+ after the MVP validates.

## D-019 — Ampliación post-MVP (2026-07-02)
**Decision:** Validado el MVP en campo por el usuario, se amplía el alcance en este orden: (1) eventos de salud con retiro de leche por medicamento, (2) eventos de reproducción (celo, inseminación, chequeo, parto) con fecha estimada de parto **derivada** (inseminación + 283 días, nunca almacenada), (3) exportación CSV, (4) recordatorios. Mismas reglas no negociables: SQLite primero, outbox transaccional, RLS por finca, valores derivados no almacenados. Las secciones de "no objetivos" de `PRODUCT_SPEC.md` §5 y los límites de `CLAUDE.md` quedan superseded por esta decisión en esos cuatro puntos.
