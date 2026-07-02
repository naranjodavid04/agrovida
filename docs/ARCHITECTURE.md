# AgroVida — Technical Architecture

## 1. Stack
- React Native + Expo + TypeScript
- Expo Router
- Supabase Postgres, Auth, Storage, and RLS
- SQLite through `expo-sqlite`
- NetInfo for connectivity
- Reanimated + Gesture Handler for the cow carousel
- `react-native-svg` for sparklines
- `expo-image-picker` for camera/gallery selection

Prefer a development build. Verify the supported Expo SDK at project bootstrap.

## 2. Data flow
Screens call use cases/repositories. Repositories read and write SQLite. No domain screen calls Supabase directly.

Write transaction:
1. Validate input.
2. Begin SQLite transaction.
3. Insert/update the local domain row.
4. Insert an outbox mutation.
5. Commit.
6. Refresh the local query/UI immediately.

Sync cycle:
1. Ensure a valid authenticated session.
2. Push pending outbox mutations in deterministic order.
3. Mark accepted mutations as acknowledged.
4. Pull remote changes after the last server cursor.
5. Apply pulled rows and tombstones in a SQLite transaction.
6. Advance cursor only after the transaction succeeds.
7. Retry transient failures with bounded exponential backoff.
8. Surface permanent conflicts without dropping local data.

## 3. Remote change cursor
Every syncable remote row has:
- `server_version bigint not null`
- `server_updated_at timestamptz not null`
- `deleted_at timestamptz null` where tombstones are required

A backend trigger assigns `server_version = nextval('sync_version_seq')` and `server_updated_at = now()` on insert/update. The client pulls by `server_version`, not by device clocks.

For multi-table pulling, expose an authenticated RPC/view that returns a unified ordered change feed, or maintain a cursor per table. Choose one approach and document it before implementation.

## 4. Local metadata
Each local syncable row should include or be associated with:
- local ID generated before network access
- `local_updated_at`
- latest known `server_version`
- sync state when useful

`sync_queue` stores JSON as SQLite `TEXT`, not `jsonb`.

Suggested outbox fields:
- `id`
- `farm_id`
- `entity_type`
- `entity_id`
- `operation`
- `payload_json`
- `created_at`
- `attempt_count`
- `last_error`
- `next_attempt_at`

Suggested `sync_state` fields:
- `farm_id`
- `scope`
- `last_server_version`
- `last_success_at`
- `last_error`

## 5. Remote domain model

### farms
- id
- name
- created_by
- created_at
- server_updated_at
- server_version

### farm_members
- id
- farm_id
- user_id
- role (`owner | worker`)
- membership_status (`active | inactive`)
- created_at
- server_updated_at
- server_version
- unique `(farm_id, user_id)`

### farm_invites
- id
- farm_id
- normalized_email
- role
- token hash or acceptance code metadata
- status (`pending | accepted | revoked | expired`)
- expires_at
- created_by
- created_at
- server_updated_at
- server_version

Invitation acceptance requiring privileged operations should use a reviewed database function or Edge Function. Never expose a service-role key to the app.

### cows
- id
- farm_id
- name
- tag_number
- photo_path
- birth_date
- birth_date_is_estimated
- breed
- mother_id
- calving_count
- lifecycle_status
- lactation_status
- pregnancy_status
- created_by
- created_at
- deleted_at
- server_updated_at
- server_version

Constraints:
- unique active tag per farm when tag is not null
- mother is not self
- mother belongs to same farm
- only owner may move lifecycle away from `active`

### milk_records
- id
- farm_id
- cow_id
- record_date
- session (`morning | afternoon`)
- liters
- recorded_by
- created_at
- deleted_at
- server_updated_at
- server_version

Constraint:
- unique active `(farm_id, cow_id, record_date, session)`

## 6. Photos
When selected offline:
1. Copy the image into app-controlled local storage.
2. Save the local URI in SQLite.
3. Queue an independent upload job.
4. Upload to a stable path such as `farm_id/cows/cow_id/<version>.webp`.
5. Update the cow’s remote `photo_path` after successful upload.
6. Keep local display working while upload is pending.

Compress/resize images before upload. Clean superseded local files only after confirmed synchronization.

## 7. Authentication offline
- First login and first farm bootstrap require internet.
- Persist the Supabase session using the supported React Native storage adapter.
- Cache the authorized user, farms, memberships, and active farm in SQLite.
- Offline mode may continue after token expiry, but sync waits until refresh succeeds.
- Logout must define whether local farm data is retained or securely cleared; choose and document before release.

## 8. RLS
RLS is mandatory on every farm-owned table.
- Membership checks must be non-recursive and reviewed.
- Worker may read and modify allowed active-farm data.
- Worker may not manage memberships/invites or set lifecycle inactive.
- Storage policies must scope cow photos by farm membership.
- Add automated tests for cross-farm isolation and role restrictions.

## 9. Conflict policy
The MVP uses deterministic server-order convergence, not device-clock last-write-wins.
- Different fields edited concurrently may still overwrite at row level.
- Never silently drop a rejected local mutation.
- Record permanent failures and expose them in sync diagnostics.
- Milk uniqueness conflicts require explicit resolution: fetch the canonical record, compare values, and either merge under a documented rule or ask the owner to choose.

## 10. Testing
At minimum:
- unit tests for validators, derived totals, age, and trend mapping
- SQLite migration tests
- repository transaction/outbox tests
- sync retry and cursor tests
- airplane-mode/restart integration scenario
- RLS tests for owner, worker, and unrelated user
- duplicate milk and tag conflict tests
