-- Private bucket for cow photos, scoped by farm membership
-- (ARCHITECTURE §6, §8). Object paths follow farm_id/cows/cow_id/<version>.webp,
-- so the first path segment is the farm to authorize against.

insert into storage.buckets (id, name, public)
values ('cow-photos', 'cow-photos', false)
on conflict (id) do nothing;

create policy cow_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cow-photos'
    and public.is_farm_member(((storage.foldername(name))[1])::uuid)
  );

create policy cow_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cow-photos'
    and public.is_farm_member(((storage.foldername(name))[1])::uuid)
  );

create policy cow_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cow-photos'
    and public.is_farm_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'cow-photos'
    and public.is_farm_member(((storage.foldername(name))[1])::uuid)
  );

create policy cow_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cow-photos'
    and public.is_farm_member(((storage.foldername(name))[1])::uuid)
  );
