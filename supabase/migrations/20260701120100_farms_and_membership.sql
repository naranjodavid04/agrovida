-- Farms, memberships, and invitations (docs/ARCHITECTURE.md §5, §8).
-- RLS helpers are SECURITY DEFINER so policies never recurse into
-- farm_members' own policies.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create table public.farm_members (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'worker')),
  membership_status text not null default 'active'
    check (membership_status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0,
  unique (farm_id, user_id)
);

create table public.farm_invites (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id),
  normalized_email text not null
    check (normalized_email = lower(trim(normalized_email))),
  role text not null check (role in ('owner', 'worker')),
  -- Reserved for future email-link acceptance; in-app acceptance matches the
  -- authenticated user's email instead.
  token_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0
);

create index farm_members_user_idx on public.farm_members (user_id);
create index farm_members_farm_idx on public.farm_members (farm_id);
create index farm_invites_farm_idx on public.farm_invites (farm_id);
create index farm_invites_email_idx on public.farm_invites (normalized_email)
  where status = 'pending';

-- Sync version triggers
create trigger farms_server_version
  before insert or update on public.farms
  for each row execute function public.set_server_version();
create trigger farm_members_server_version
  before insert or update on public.farm_members
  for each row execute function public.set_server_version();
create trigger farm_invites_server_version
  before insert or update on public.farm_invites
  for each row execute function public.set_server_version();

-- Index used by pull_changes cursors
create index farms_version_idx on public.farms (server_version);
create index farm_members_version_idx on public.farm_members (farm_id, server_version);
create index farm_invites_version_idx on public.farm_invites (farm_id, server_version);

-- ---------------------------------------------------------------------------
-- RLS helpers (non-recursive: SECURITY DEFINER bypasses farm_members RLS)
-- ---------------------------------------------------------------------------

create or replace function public.is_farm_member(p_farm_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.farm_members m
    where m.farm_id = p_farm_id
      and m.user_id = (select auth.uid())
      and m.membership_status = 'active'
  );
$$;

create or replace function public.farm_role(p_farm_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select m.role
  from public.farm_members m
  where m.farm_id = p_farm_id
    and m.user_id = (select auth.uid())
    and m.membership_status = 'active';
$$;

create or replace function public.is_farm_owner(p_farm_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(public.farm_role(p_farm_id) = 'owner', false);
$$;

revoke execute on function public.is_farm_member(uuid) from anon;
revoke execute on function public.farm_role(uuid) from anon;
revoke execute on function public.is_farm_owner(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Farm bootstrap: creating a farm makes the creator its owner. Runs as
-- SECURITY DEFINER because farm_members has no client insert policy.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_farm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.farm_members (farm_id, user_id, role, membership_status)
  values (new.id, new.created_by, 'owner', 'active');
  return new;
end;
$$;

create trigger farms_bootstrap_owner
  after insert on public.farms
  for each row execute function public.handle_new_farm();

-- ---------------------------------------------------------------------------
-- Invitation acceptance (reviewed SECURITY DEFINER function; the app never
-- holds privileged credentials — docs/ARCHITECTURE.md §5).
-- ---------------------------------------------------------------------------

create or replace function public.accept_farm_invite(p_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.farm_invites%rowtype;
  v_email text;
  v_member_id uuid;
begin
  v_email := lower(trim(coalesce(
    (select auth.jwt() ->> 'email'),
    ''
  )));
  if v_email = '' then
    raise exception 'authenticated email required';
  end if;

  select * into v_invite
  from public.farm_invites
  where id = p_invite_id
  for update;

  if not found then
    raise exception 'invite not found';
  end if;
  if v_invite.normalized_email <> v_email then
    raise exception 'invite addressed to a different email';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'invite is not pending';
  end if;
  if v_invite.expires_at < now() then
    update public.farm_invites set status = 'expired' where id = p_invite_id;
    raise exception 'invite expired';
  end if;

  insert into public.farm_members (farm_id, user_id, role, membership_status)
  values (v_invite.farm_id, (select auth.uid()), v_invite.role, 'active')
  on conflict (farm_id, user_id)
    do update set membership_status = 'active', role = excluded.role
  returning id into v_member_id;

  update public.farm_invites set status = 'accepted' where id = p_invite_id;

  return v_member_id;
end;
$$;

revoke execute on function public.accept_farm_invite(uuid) from anon;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.farm_invites enable row level security;

-- farms
create policy farms_select on public.farms
  for select to authenticated
  using (public.is_farm_member(id));

create policy farms_insert on public.farms
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy farms_update on public.farms
  for update to authenticated
  using (public.is_farm_owner(id))
  with check (public.is_farm_owner(id));

-- farm_members: reads for members; owner may deactivate/reactivate.
-- Inserts only happen through SECURITY DEFINER paths (farm bootstrap trigger
-- and accept_farm_invite), so there is no insert policy on purpose.
create policy farm_members_select on public.farm_members
  for select to authenticated
  using (public.is_farm_member(farm_id));

create policy farm_members_update on public.farm_members
  for update to authenticated
  using (public.is_farm_owner(farm_id))
  with check (public.is_farm_owner(farm_id));

-- farm_invites: owner manages; the invited user can see their own invites.
create policy farm_invites_select on public.farm_invites
  for select to authenticated
  using (
    public.is_farm_owner(farm_id)
    or normalized_email = lower(trim(coalesce((select auth.jwt() ->> 'email'), '')))
  );

create policy farm_invites_insert on public.farm_invites
  for insert to authenticated
  with check (
    public.is_farm_owner(farm_id)
    and created_by = (select auth.uid())
  );

create policy farm_invites_update on public.farm_invites
  for update to authenticated
  using (public.is_farm_owner(farm_id))
  with check (public.is_farm_owner(farm_id));
