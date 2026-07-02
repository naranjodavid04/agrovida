-- Worker role restrictions (PRODUCT_SPEC §2, §8; ARCHITECTURE §8).
-- Run with: npx supabase test db   (requires Docker / local stack)
begin;
create extension if not exists pgtap;
select plan(12);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000011', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000012', 'worker@test.local');

-- Seed farm, memberships, and one cow as postgres.
insert into farms (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000011', 'Finca', '00000000-0000-0000-0000-000000000011');
-- The bootstrap trigger created the owner membership; add the worker.
insert into farm_members (id, farm_id, user_id, role, membership_status) values
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000012', 'worker', 'active');
insert into cows (id, farm_id, name, lifecycle_status, created_by) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000011',
   'Activa', 'active', '00000000-0000-0000-0000-000000000011'),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000011',
   'Vendida', 'sold', '00000000-0000-0000-0000-000000000011');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000012","email":"worker@test.local","role":"authenticated"}';

-- Allowed worker actions.
select lives_ok(
  $$insert into cows (farm_id, name, created_by)
    values ('10000000-0000-0000-0000-000000000011', 'Nueva',
            '00000000-0000-0000-0000-000000000012')$$,
  'worker can create an active cow'
);

select lives_ok(
  $$update cows set name = 'Activa Editada'
    where id = '20000000-0000-0000-0000-000000000011'$$,
  'worker can edit an active cow'
);

select lives_ok(
  $$insert into milk_records (farm_id, cow_id, record_date, session, liters, recorded_by)
    values ('10000000-0000-0000-0000-000000000011',
            '20000000-0000-0000-0000-000000000011', '2026-07-01', 'morning', 12.5,
            '00000000-0000-0000-0000-000000000012')$$,
  'worker can record milk'
);

-- Forbidden: lifecycle deactivation is owner-only.
select throws_ok(
  $$update cows set lifecycle_status = 'sold'
    where id = '20000000-0000-0000-0000-000000000011'$$,
  '42501',
  'new row violates row-level security policy for table "cows"',
  'worker cannot move lifecycle away from active'
);

select throws_ok(
  $$insert into cows (farm_id, name, lifecycle_status, created_by)
    values ('10000000-0000-0000-0000-000000000011', 'Fantasma', 'culled',
            '00000000-0000-0000-0000-000000000012')$$,
  '42501',
  'new row violates row-level security policy for table "cows"',
  'worker cannot create a non-active cow'
);

select is_empty(
  $$update cows set name = 'Tocada'
    where id = '20000000-0000-0000-0000-000000000012'
    returning id$$,
  'worker cannot edit a sold cow'
);

-- Forbidden: membership and invite management.
select throws_ok(
  $$insert into farm_invites (farm_id, normalized_email, role, created_by)
    values ('10000000-0000-0000-0000-000000000011', 'amigo@test.local', 'worker',
            '00000000-0000-0000-0000-000000000012')$$,
  '42501',
  'new row violates row-level security policy for table "farm_invites"',
  'worker cannot create invites'
);

select is_empty(
  $$update farm_members set membership_status = 'inactive'
    where id = '30000000-0000-0000-0000-000000000012'
    returning id$$,
  'worker cannot deactivate memberships'
);

select is(
  (select count(*)::int from farm_invites
   where farm_id = '10000000-0000-0000-0000-000000000011'),
  0,
  'worker cannot list farm invites'
);

-- Owner-allowed counterparts.
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000011","email":"owner@test.local","role":"authenticated"}';

select lives_ok(
  $$update cows set lifecycle_status = 'sold'
    where id = '20000000-0000-0000-0000-000000000011'$$,
  'owner can deactivate a cow lifecycle'
);

select lives_ok(
  $$insert into farm_invites (farm_id, normalized_email, role, created_by)
    values ('10000000-0000-0000-0000-000000000011', 'amiga@test.local', 'worker',
            '00000000-0000-0000-0000-000000000011')$$,
  'owner can invite a member'
);

select lives_ok(
  $$update farm_members set membership_status = 'inactive'
    where id = '30000000-0000-0000-0000-000000000012'$$,
  'owner can deactivate a membership'
);

select * from finish();
rollback;
