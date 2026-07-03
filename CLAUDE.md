# CLAUDE.md — AgroVida
You are allowed to propose changes that contradict the .md files, like CLAUDE.md, if you think it's better, and even modify these files

## Project
AgroVida is an offline-first mobile app for dairy herd management. Android is the first target; iOS may follow. The app is multi-farm and multi-user.

## Canonical documentation
Read these files before changing code:

@docs/DECISIONS.md
@docs/PRODUCT_SPEC.md
@docs/ARCHITECTURE.md
@docs/DESIGN_SPEC.md

Conflict precedence:
1. `docs/DECISIONS.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DESIGN_SPEC.md`
5. Legacy prototypes and handoff files

When implementation changes a documented decision, update the relevant document in the same task.

## Non-negotiable rules
- The app must remain usable without internet after the first successful login and farm bootstrap.
- SQLite is the immediate source of truth for app reads and writes.
- Every domain row belongs to a `farm_id`.
- Every local mutation is written transactionally with an outbox entry.
- Sync must be automatic, retryable, idempotent, observable, and tested.
- Never use a device timestamp as the remote pull cursor.
- Never store derived values such as age, milk today, or seven-day trend on `cows`.
- Never model lactation, pregnancy, and animal lifecycle as one status field.
- Never copy the HTML prototype, `android-frame.jsx`, or `image-slot.js` into production code.
- Never put secrets in the repository. Use environment variables and maintain `.env.example`.
- All Supabase schema changes must be versioned migrations with RLS policies and tests.
- UI copy is Spanish (Colombia) for the MVP. Keep strings centralized for future i18n.
- Code identifiers, database identifiers, and comments are in English.
- TypeScript must be strict. Avoid `any`.

## Preferred stack
- React Native + Expo + TypeScript
- Expo Router
- Supabase: Postgres, Auth, Storage, RLS
- `expo-sqlite`
- `expo-image-picker`
- `@react-native-community/netinfo`
- `react-native-reanimated`
- `react-native-gesture-handler`
- `react-native-svg` for sparklines

At bootstrap, verify the supported Expo SDK in the official documentation. Prefer a development build and the current stable SDK. Use SDK 54 only when compatibility with the user's installed Expo Go is an explicit requirement.

## Architecture boundaries
- `src/app/`: routes and screen composition
- `src/features/`: feature UI and use cases
- `src/components/`: reusable visual components
- `src/db/`: SQLite connection, schema, migrations, transactions
- `src/repositories/`: domain persistence APIs; UI must not issue raw SQL
- `src/sync/`: outbox, pull cursor, conflict handling, retries
- `src/lib/`: Supabase client, environment, logging
- `src/types/`: shared domain types
- `supabase/migrations/`: remote schema, functions, RLS
- `tests/`: unit and integration tests

## Domain rules
- `lifecycle_status`: `active | sold | deceased | culled`
- `lactation_status`: `lactating | dry | unknown`
- `pregnancy_status`: `pregnant | open | unknown`
- A cow may be both `lactating` and `pregnant`.
- Age is calculated from `birth_date`.
- Today's milk and trends are derived from `milk_records`.
- Milk records are per cow, date, and session (`morning | afternoon`).
- Deactivation is a business state, not a hard delete.
- Use soft deletion only for correcting records that must disappear and still synchronize.

## Working method
1. Inspect the repository and documentation.
2. State assumptions and a short implementation plan.
3. Implement the smallest complete vertical slice.
4. Run typecheck, lint, tests, and relevant database checks.
5. Report changed files, commands run, failures, and remaining risks.
6. Do not claim success when a command or test was not run.
7. After every commit, push to the GitHub remote (`git push`). The public
   repo https://github.com/naranjodavid04/agrovida is the user's backup and
   portfolio; never leave local commits unpushed at the end of a task.

## MVP limits
Implement only authentication, farm membership/invitations, cows, photos, milk records, genealogy, daily totals, offline storage, automatic sync, and the documented screens. Do not implement health, advanced reproduction events, economics, alerts, exports, or analytics beyond the seven-day sparkline required by the UI.
