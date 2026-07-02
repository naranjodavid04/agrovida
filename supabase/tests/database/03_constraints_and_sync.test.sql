-- Domain constraints, invite acceptance, and the pull feed
-- (PRODUCT_SPEC §6, DECISIONS D-014/D-016).
-- Run with: npx supabase test db   (requires Docker / local stack)
begin;
create extension if not exists pgtap;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000021', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000022', 'invitee@test.local');

insert into farms (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000021', 'Finca', '00000000-0000-0000-0000-000000000021'),
  ('10000000-0000-0000-0000-000000000022', 'Otra Finca', '00000000-0000-0000-0000-000000000021');

insert into cows (id, farm_id, name, tag_number, created_by) values
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
   'Lola', 'A-01', '00000000-0000-0000-0000-000000000021');

-- Tag uniqueness among non-deleted cows in a farm.
select throws_ok(
  $$insert into cows (farm_id, name, tag_number, created_by)
    values ('10000000-0000-0000-0000-000000000021', 'Copia', 'a-01',
            '00000000-0000-0000-0000-000000000021')$$,
  '23505',
  null,
  'duplicate active tag is rejected (case-insensitive)'
);

update cows set deleted_at = now() where id = '20000000-0000-0000-0000-000000000021';

select lives_ok(
  $$insert into cows (farm_id, name, tag_number, created_by)
    values ('10000000-0000-0000-0000-000000000021', 'Reusa', 'A-01',
            '00000000-0000-0000-0000-000000000021')$$,
  'tag can be reused after soft-deleting the previous cow'
);

-- Genealogy constraints.
select throws_ok(
  $$update cows set mother_id = id
    where farm_id = '10000000-0000-0000-0000-000000000021' and name = 'Reusa'$$,
  '23514',
  null,
  'a cow cannot be its own mother'
);

insert into cows (id, farm_id, name, created_by) values
  ('20000000-0000-0000-0000-000000000022', '10000000-0000-0000-0000-000000000022',
   'Ajena', '00000000-0000-0000-0000-000000000021');

select throws_ok(
  $$update cows set mother_id = '20000000-0000-0000-0000-000000000022'
    where farm_id = '10000000-0000-0000-0000-000000000021' and name = 'Reusa'$$,
  'P0001',
  'mother must belong to the same farm',
  'mother from another farm is rejected'
);

-- Milk session uniqueness and liters bound.
insert into milk_records (id, farm_id, cow_id, record_date, session, liters, recorded_by)
values ('40000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
        '20000000-0000-0000-0000-000000000021', '2026-07-01', 'morning', 10,
        '00000000-0000-0000-0000-000000000021');

select throws_ok(
  $$insert into milk_records (farm_id, cow_id, record_date, session, liters, recorded_by)
    values ('10000000-0000-0000-0000-000000000021',
            '20000000-0000-0000-0000-000000000021', '2026-07-01', 'morning', 11,
            '00000000-0000-0000-0000-000000000021')$$,
  '23505',
  null,
  'duplicate active milk session is rejected'
);

select throws_ok(
  $$insert into milk_records (farm_id, cow_id, record_date, session, liters, recorded_by)
    values ('10000000-0000-0000-0000-000000000021',
            '20000000-0000-0000-0000-000000000021', '2026-07-01', 'afternoon', 75,
            '00000000-0000-0000-0000-000000000021')$$,
  '23514',
  null,
  'liters above the shared bound are rejected'
);

select throws_ok(
  $$insert into milk_records (farm_id, cow_id, record_date, session, liters, recorded_by)
    values ('10000000-0000-0000-0000-000000000022',
            '20000000-0000-0000-0000-000000000021', '2026-07-01', 'afternoon', 5,
            '00000000-0000-0000-0000-000000000021')$$,
  'P0001',
  'cow must belong to the same farm',
  'milk record farm must match the cow farm'
);

-- server_version is monotonic across updates.
select ok(
  (select server_version from milk_records
   where id = '40000000-0000-0000-0000-000000000021') > 0,
  'insert assigned a server_version'
);

update milk_records set liters = 12
where id = '40000000-0000-0000-0000-000000000021';

select ok(
  (select server_version from milk_records
   where id = '40000000-0000-0000-0000-000000000021') =
  (select last_value from sync_version_seq),
  'update advanced server_version to the sequence head'
);

-- Invite acceptance via SECURITY DEFINER function.
insert into farm_invites (id, farm_id, normalized_email, role, created_by) values
  ('50000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021',
   'invitee@test.local', 'worker', '00000000-0000-0000-0000-000000000021');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000022","email":"other@test.local","role":"authenticated"}';

select throws_ok(
  $$select accept_farm_invite('50000000-0000-0000-0000-000000000021')$$,
  'P0001',
  'invite addressed to a different email',
  'invite cannot be accepted by a different email'
);

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000022","email":"invitee@test.local","role":"authenticated"}';

select lives_ok(
  $$select accept_farm_invite('50000000-0000-0000-0000-000000000021')$$,
  'invitee accepts the invite'
);

select is(
  (select membership_status from farm_members
   where farm_id = '10000000-0000-0000-0000-000000000021'
     and user_id = '00000000-0000-0000-0000-000000000022'),
  'active',
  'acceptance created an active membership'
);

-- The new worker pulls the farm feed in version order.
select ok(
  (with feed as (
     select server_version,
            lag(server_version) over (order by server_version) as prev
     from pull_changes('10000000-0000-0000-0000-000000000021', 0, 1000)
   )
   select count(*) = 0 from feed where prev is not null and prev >= server_version),
  'pull_changes returns strictly increasing server_version'
);

select * from finish();
rollback;
