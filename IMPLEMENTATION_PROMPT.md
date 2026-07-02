# Master implementation prompt — AgroVida

You are working as the senior engineer responsible for creating the production MVP of AgroVida.

## Inputs
The repository contains these canonical documents:
- `CLAUDE.md` or `AGENTS.md`
- `docs/DECISIONS.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN_SPEC.md`

It may also contain legacy reference files:
- `AgroVida.dc.html`
- `android-frame.jsx`
- `image-slot.js`
- an old `README.md`
- an old `CLAUDE.md`

The legacy files are not production code and are lower priority than the canonical documents. Use the HTML only to understand visual hierarchy, spacing, and interactions. Do not port custom design-tool components, inline CSS, phone chrome, image-slot behavior, or browser-only state logic.

## Goal
Create a clean, maintainable, tested React Native/Expo MVP for Android that:
- works offline after first login/bootstrap
- stores all domain data in SQLite first
- synchronizes automatically with Supabase
- isolates each farm with RLS
- supports owner/worker roles
- manages cows, genealogy, photos, morning/afternoon milk records, daily totals, and seven-day trends
- faithfully adapts the approved AgroVida design
- keeps future health, reproduction events, economics, alerts, and exports out of the MVP

## Mandatory technical rules
1. Use strict TypeScript.
2. Use Expo Router.
3. Verify the currently supported Expo SDK from official documentation before scaffolding. Prefer a development build and the current stable SDK. Use SDK 54 only if the existing environment explicitly requires Expo Go compatibility.
4. UI components must never call Supabase for domain reads/writes. They call use cases/repositories backed by SQLite.
5. Every local mutation and its outbox entry must commit in one SQLite transaction.
6. Every remote domain row must be scoped by `farm_id` and protected by RLS.
7. Use client-generated IDs so records can be created offline.
8. Use a server-issued monotonic `server_version` for remote pulls. Do not use device `updated_at` as a sync cursor.
9. Keep `lifecycle_status`, `lactation_status`, and `pregnancy_status` separate.
10. Derive age from `birth_date`; derive milk totals/deltas/trends from `milk_records`.
11. Use soft-delete tombstones only for correction/deletion propagation. Sold/deceased/culled are lifecycle states.
12. Queue photo uploads independently so photo failure does not block cow or milk synchronization.
13. Never expose the Supabase service-role key. Use migrations, reviewed SQL functions/Edge Functions where privilege is required, and `.env.example`.
14. Do not add Realtime in the MVP.
15. Do not claim a test passed unless you executed it.

## Required process

### Phase 0 — Audit and plan
Before editing:
- inspect all files
- identify contradictions or missing decisions
- verify the package manager and local toolchain
- produce a concise architecture/implementation plan
- list any assumption you must make
- create/update a checklist in `docs/IMPLEMENTATION_STATUS.md`

Do not stop merely because the repository is empty; scaffold it.

### Phase 1 — Foundation
- scaffold the Expo TypeScript app
- configure Expo Router, fonts, safe areas, environment validation, lint, formatting, typecheck, and test runner
- create the documented folder structure
- add `.env.example`
- add a theme/tokens module from `DESIGN_SPEC.md`
- add a basic diagnostics logger that never logs secrets

### Phase 2 — Supabase backend
Create versioned migrations for:
- farms
- farm_members
- farm_invites
- cows
- milk_records
- monotonic sync version mechanism
- constraints and indexes
- RLS helper functions and policies
- Storage policies for cow photos

Add seed/test fixtures where appropriate. Add database tests proving:
- unrelated users cannot read another farm
- workers cannot manage members or deactivate animals
- owners can perform allowed actions
- unique active tag and milk-session rules work

### Phase 3 — Local database
Implement:
- SQLite connection and migration runner
- local mirrors of required domain tables
- `sync_queue`
- `sync_state`
- photo upload queue/state
- repositories for farms, memberships, cows, and milk records
- transactional write + outbox behavior
- derived queries for today, yesterday delta, seven-day trend, and farm total

Add tests for migrations, repositories, and rollback behavior.

### Phase 4 — Authentication and farm bootstrap
Implement:
- login/register
- persisted session
- cached local bootstrap
- create/select/switch farm
- invitation acceptance
- owner member management
- offline behavior after first bootstrap
- explicit loading, offline, expired-session, and error states

### Phase 5 — Synchronization
Implement an automatic sync coordinator triggered by:
- reconnect
- app foreground
- successful auth refresh
- manual retry in diagnostics

Requirements:
- deterministic ordered pushes
- idempotent retries
- monotonic pull cursor
- transactional application of pulled changes
- cursor advances only after successful local apply
- bounded exponential backoff
- persistent errors and retry counts
- no lost local mutation
- documented handling of unique milk conflicts
- test scenarios for interruption, retry, duplicate delivery, restart, and two-device convergence

### Phase 6 — Product UI
Recreate the native UI using `DESIGN_SPEC.md`:
- main Design A cow carousel
- herd list/search
- cow detail
- add/edit cow
- milk entry
- milk history
- farm daily summary
- members/invitations
- settings/account
- sync status/diagnostics

Remove prototype-only controls:
- no “Diseño A / Diseño B”
- no ES/EN toggle in MVP
- no phone bezel/status bar
- no image-slot

Ensure:
- Spanish (Colombia) copy
- outdoor contrast and large touch targets
- screen-reader labels
- safe areas and keyboard handling
- loading/empty/error/offline/sync states
- immediate local-save confirmation
- smooth but non-blocking carousel animations

### Phase 7 — Validation
Run and fix:
- dependency installation
- typecheck
- lint
- unit tests
- integration tests
- Supabase local migration reset
- database/RLS tests
- Expo diagnostics
- Android development build or the most appropriate available validation

Document exact commands and results in `docs/IMPLEMENTATION_STATUS.md`.

## Definition of done
Do not mark the MVP complete until:
- a worker can record a full milking session in airplane mode
- restart preserves local data and pending mutations
- two devices converge after reconnect
- cross-farm access is denied by RLS
- worker forbidden actions are denied by the backend
- duplicate milk sessions are handled deterministically
- photos selected offline display locally and upload later
- no secret is committed
- all executed checks pass
- remaining limitations are listed honestly

## Final report format
At the end, provide:
1. implemented phases
2. important architecture decisions
3. files created/changed
4. commands and tests actually run
5. known limitations or blockers
6. exact next recommended task

Work autonomously through the phases when the environment permits. When a credential or external Supabase project is unavailable, implement and test locally with migrations/mocks, document the exact blocked step, and continue with all work that does not require the credential.
