# AgroVida — Supabase backend

Schema lives exclusively in versioned migrations (`migrations/`); dashboard
edits are not a source of truth (DECISIONS.md D-011).

## Layout
- `migrations/20260701120000_sync_infrastructure.sql` — `sync_version_seq` + `set_server_version()` trigger function (D-008).
- `migrations/20260701120100_farms_and_membership.sql` — farms, farm_members, farm_invites, non-recursive RLS helpers, farm bootstrap trigger, `accept_farm_invite`.
- `migrations/20260701120200_cows.sql` — cows, tag uniqueness, genealogy triggers, owner-only lifecycle RLS.
- `migrations/20260701120300_milk_records.sql` — milk records, active-session uniqueness, liters bound (mirrors `MAX_LITERS_PER_SESSION`).
- `migrations/20260701120400_pull_changes.sql` — unified pull feed RPC (D-014).
- `migrations/20260701120500_storage_cow_photos.sql` — private `cow-photos` bucket scoped by farm membership.
- `tests/database/*.test.sql` — pgTAP suites: isolation, worker restrictions, constraints/invites/feed.

## Commands

Local stack (requires Docker Desktop):

```sh
npx supabase start        # boot local Postgres/Auth/Storage
npx supabase db reset     # apply all migrations from scratch
npx supabase test db      # run pgTAP suites in tests/
```

Against a hosted project:

```sh
npx supabase link --project-ref <ref>
npx supabase db push      # apply pending migrations
```

Client environment comes from `.env` (see `.env.example`). Never commit keys;
never ship the service-role key in the app.
