-- Cross-farm isolation (PRODUCT_SPEC §8: RLS prevents cross-farm access).
-- Run with: npx supabase test db   (requires Docker / local stack)
begin;
create extension if not exists pgtap;
select plan(10);

-- Seed two unrelated users as postgres.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'owner2@test.local');

-- owner1 creates farm1 through the client path (tests farms_insert policy
-- and the bootstrap-owner trigger).
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"owner1@test.local","role":"authenticated"}';

select lives_ok(
  $$insert into farms (id, name, created_by)
    values ('10000000-0000-0000-0000-000000000001', 'Farm One',
            '00000000-0000-0000-0000-000000000001')$$,
  'owner1 can create a farm'
);

select is(
  (select role from farm_members
   where farm_id = '10000000-0000-0000-0000-000000000001'
     and user_id = '00000000-0000-0000-0000-000000000001'),
  'owner',
  'farm creation bootstraps an owner membership'
);

select lives_ok(
  $$insert into cows (id, farm_id, name, created_by)
    values ('20000000-0000-0000-0000-000000000001',
            '10000000-0000-0000-0000-000000000001', 'Lola',
            '00000000-0000-0000-0000-000000000001')$$,
  'owner1 can create a cow in own farm'
);

-- owner2 creates farm2.
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000002","email":"owner2@test.local","role":"authenticated"}';

select lives_ok(
  $$insert into farms (id, name, created_by)
    values ('10000000-0000-0000-0000-000000000002', 'Farm Two',
            '00000000-0000-0000-0000-000000000002')$$,
  'owner2 can create a farm'
);

-- owner2 must not see or touch farm1 data.
select is(
  (select count(*)::int from farms where id = '10000000-0000-0000-0000-000000000001'),
  0,
  'owner2 cannot read farm1'
);

select is(
  (select count(*)::int from cows
   where farm_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'owner2 cannot read farm1 cows'
);

select is(
  (select count(*)::int from farm_members
   where farm_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'owner2 cannot read farm1 memberships'
);

select throws_ok(
  $$insert into cows (farm_id, name, created_by)
    values ('10000000-0000-0000-0000-000000000001', 'Intrusa',
            '00000000-0000-0000-0000-000000000002')$$,
  '42501',
  'new row violates row-level security policy for table "cows"',
  'owner2 cannot insert a cow into farm1'
);

select is_empty(
  $$update cows set name = 'Hacked'
    where id = '20000000-0000-0000-0000-000000000001'
    returning id$$,
  'owner2 updates zero rows in farm1'
);

select is_empty(
  $$select * from pull_changes('10000000-0000-0000-0000-000000000001', 0, 100)$$,
  'pull_changes returns nothing for a farm the caller does not belong to'
);

select * from finish();
rollback;
