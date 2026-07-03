-- Health and reproduction events: RLS and the extended pull feed (D-019).
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000032', 'outsider@test.local');

insert into farms (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000031', 'Finca', '00000000-0000-0000-0000-000000000031');
insert into cows (id, farm_id, name, created_by) values
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000031',
   'Lola', '00000000-0000-0000-0000-000000000031');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000031","email":"owner@test.local","role":"authenticated"}';

select lives_ok(
  $$insert into health_events (farm_id, cow_id, event_date, event_type, description, withdrawal_until, recorded_by)
    values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031',
            '2026-07-02', 'treatment', 'Antibiótico mastitis', '2026-07-06',
            '00000000-0000-0000-0000-000000000031')$$,
  'member can record a health event'
);

select lives_ok(
  $$insert into repro_events (farm_id, cow_id, event_date, event_type, recorded_by)
    values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031',
            '2026-07-01', 'insemination', '00000000-0000-0000-0000-000000000031')$$,
  'member can record a reproduction event'
);

select throws_ok(
  $$insert into repro_events (farm_id, cow_id, event_date, event_type, result, recorded_by)
    values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031',
            '2026-07-01', 'pregnancy_check', 'maybe',
            '00000000-0000-0000-0000-000000000031')$$,
  '23514',
  null,
  'pregnancy check result is constrained'
);

select ok(
  exists (
    select 1 from pull_changes('10000000-0000-0000-0000-000000000031', 0, 100)
    where entity_type = 'health_event'
  ),
  'pull feed includes health events'
);

select ok(
  exists (
    select 1 from pull_changes('10000000-0000-0000-0000-000000000031', 0, 100)
    where entity_type = 'repro_event'
  ),
  'pull feed includes reproduction events'
);

-- Unrelated user sees nothing.
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000032","email":"outsider@test.local","role":"authenticated"}';

select is(
  (select count(*)::int from health_events
   where farm_id = '10000000-0000-0000-0000-000000000031'),
  0,
  'outsider cannot read health events'
);

select throws_ok(
  $$insert into repro_events (farm_id, cow_id, event_date, event_type, recorded_by)
    values ('10000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000031',
            '2026-07-01', 'heat', '00000000-0000-0000-0000-000000000032')$$,
  '42501',
  null,
  'outsider cannot insert reproduction events'
);

select * from finish();
rollback;
