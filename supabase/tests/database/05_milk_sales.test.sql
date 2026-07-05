-- Milk sales RLS and pull feed.
-- Run with: npx supabase test db
begin;
create extension if not exists pgtap;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000041', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000042', 'outsider@test.local');

insert into farms (id, name, created_by) values
  ('10000000-0000-0000-0000-000000000041', 'Finca', '00000000-0000-0000-0000-000000000041');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000041","email":"owner@test.local","role":"authenticated"}';

select lives_ok(
  $$insert into milk_sales (farm_id, sale_date, liters, price_per_liter, fat_percent, recorded_by)
    values ('10000000-0000-0000-0000-000000000041', '2026-07-03', 120.5, 2050, 3.8,
            '00000000-0000-0000-0000-000000000041')$$,
  'member can record a milk sale'
);

select throws_ok(
  $$insert into milk_sales (farm_id, sale_date, liters, price_per_liter, recorded_by)
    values ('10000000-0000-0000-0000-000000000041', '2026-07-03', 0, 2050,
            '00000000-0000-0000-0000-000000000041')$$,
  '23514',
  null,
  'zero liters are rejected'
);

select ok(
  exists (
    select 1 from pull_changes('10000000-0000-0000-0000-000000000041', 0, 100)
    where entity_type = 'milk_sale'
  ),
  'pull feed includes milk sales'
);

set local request.jwt.claims to
  '{"sub":"00000000-0000-0000-0000-000000000042","email":"outsider@test.local","role":"authenticated"}';

select is(
  (select count(*)::int from milk_sales
   where farm_id = '10000000-0000-0000-0000-000000000041'),
  0,
  'outsider cannot read milk sales'
);

select throws_ok(
  $$insert into milk_sales (farm_id, sale_date, liters, price_per_liter, recorded_by)
    values ('10000000-0000-0000-0000-000000000041', '2026-07-03', 10, 2000,
            '00000000-0000-0000-0000-000000000042')$$,
  '42501',
  null,
  'outsider cannot insert milk sales'
);

select * from finish();
rollback;
