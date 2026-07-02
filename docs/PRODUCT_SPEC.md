# AgroVida — Product Specification

## 1. Product goal
AgroVida helps dairy farms record and consult herd and milk-production data even where there is no mobile signal. After the first online login and farm bootstrap, core work must remain available offline and synchronize automatically when connectivity returns.

## 2. Initial users
- **Owner:** manages the farm, members, animals, all milk data, and animal lifecycle changes.
- **Worker:** views the herd, creates/edits active animals, and records milk. Cannot manage members or change an animal to sold/deceased/culled.

A user may belong to more than one farm and has a role per farm.

## 3. MVP scope

### Authentication and farm bootstrap
- Email/password registration and login.
- First login requires connectivity.
- Persist the session locally.
- Create a farm.
- Select/switch among authorized farms.
- Invite a member and accept an invitation.
- Owner can list and deactivate memberships.

### Herd
- Create, view, search, and edit cows.
- Fields:
  - name
  - tag number
  - photo
  - birth date and “estimated” flag
  - breed
  - mother
  - calving count
  - lifecycle status
  - lactation status
  - pregnancy status
- Navigate from a cow to its mother and registered daughters.
- Owner-only lifecycle deactivation.

### Milk production
- Create or edit one morning and one afternoon record per cow/date.
- Display today’s total per cow.
- Display today’s total for the farm.
- Display yesterday comparison and a seven-day sparkline.
- Display a simple per-cow history list.
- Work fully offline and synchronize later.

### Offline and sync
- Domain screens read from SQLite.
- Domain writes update SQLite and the outbox atomically.
- Automatic sync on reconnect, app foreground, login refresh, and manual retry from diagnostics.
- Show compact states: offline, syncing, synchronized, and action required.
- Preserve pending edits across app restarts.
- Never require the worker to press an “upload” button.

## 4. Required screens
1. Bootstrap/loading
2. Login
3. Register
4. Create/select farm
5. Pending/accepted invitations
6. Main cow-card carousel
7. Searchable herd list
8. Cow detail
9. Add/edit cow
10. Record milk
11. Milk history
12. Farm daily summary
13. Members and invitations (owner)
14. Settings/account
15. Sync diagnostics/retry

## 5. Explicit non-goals
Do not implement in the MVP:
- health events or medication withdrawal
- reproduction event timeline, inseminations, heat, expected calving
- economics or profitability
- lots/groups
- notifications and reminders
- Excel/CSV export
- advanced charts or anomaly detection
- Supabase Realtime

The schema and modules must allow these later without prebuilding them.

## 6. Core domain invariants
- Every farm-owned row has `farm_id`.
- A cow can be lactating and pregnant simultaneously.
- `tag_number` is unique among non-deleted cows within a farm when present.
- Milk session uniqueness: one active record per farm/cow/date/session.
- Liters must be finite and non-negative. Define a sensible upper validation bound in one shared constant.
- A cow cannot be its own mother.
- A mother must belong to the same farm.
- Age, daily totals, deltas, and trends are derived values.
- Business deactivation is not deletion.

## 7. UX principles
- Optimized for outdoor use: high contrast, large touch targets, minimal typing.
- Spanish (Colombia) copy.
- Show immediate local success; do not block a save on network availability.
- Make sync state visible but unobtrusive.
- Errors must explain whether data is safe locally and what action is needed.
- Preserve form input on navigation or sync failure.

## 8. Acceptance criteria
The MVP is not complete until:
- Two users on the same farm can create/edit data on separate devices and converge after reconnecting.
- A worker can complete a full milking session with airplane mode enabled.
- Restarting the app offline preserves session bootstrap, cows, records, and pending outbox entries.
- RLS prevents cross-farm access and worker-only forbidden actions.
- Duplicate milk sessions and duplicate tag numbers are handled deterministically.
- Photo upload failure does not lose the cow or milk data.
- Typecheck, lint, unit tests, sync integration tests, and database policy tests pass.
