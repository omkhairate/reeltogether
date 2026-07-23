-- Run this once in a new Supabase project's SQL editor, then enable
-- Anonymous Sign-Ins and Realtime for shared_lists, list_members, and votes.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.shared_lists (
  id uuid primary key,
  invite_code uuid unique not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  threshold integer not null default 2 check (threshold between 1 and 20),
  content_mode text not null default 'mixed' check (content_mode in ('watch','activities','mixed')),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.list_members (
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table if not exists public.votes (
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null,
  kind text not null check (kind in ('movie','show','activity')),
  decision text not null check (decision in ('pick','pass')),
  updated_at timestamptz not null default now(),
  primary key (list_id, user_id, item_id, kind)
);

alter table public.profiles enable row level security;
alter table public.shared_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.votes enable row level security;

create or replace function public.is_list_member(target_list uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.list_members
    where list_id = target_list and user_id = auth.uid()
  );
$$;

create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "users own their profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "users update their profile" on public.profiles for update to authenticated using (id = auth.uid());

create policy "members read lists" on public.shared_lists for select to authenticated using (
  owner_id = auth.uid() or public.is_list_member(id)
);
create policy "users create lists" on public.shared_lists for insert to authenticated with check (owner_id = auth.uid());
create policy "members update shared settings" on public.shared_lists for update to authenticated using (
  owner_id = auth.uid() or public.is_list_member(id)
);

create policy "members read membership" on public.list_members for select to authenticated using (
  public.is_list_member(list_id)
);
create policy "owners add themselves" on public.list_members for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from public.shared_lists where id = list_id and owner_id = auth.uid())
);

create policy "members read votes" on public.votes for select to authenticated using (
  public.is_list_member(list_id)
);
create policy "members cast own votes" on public.votes for insert to authenticated with check (
  user_id = auth.uid() and public.is_list_member(list_id)
);
create policy "members change own votes" on public.votes for update to authenticated using (user_id = auth.uid());

create or replace function public.join_list_by_invite(code uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare target_id uuid;
begin
  select id into target_id from public.shared_lists where invite_code = code;
  if target_id is null then return null; end if;
  insert into public.list_members(list_id, user_id) values (target_id, auth.uid()) on conflict do nothing;
  return target_id;
end;
$$;

revoke all on function public.join_list_by_invite(uuid) from public;
grant execute on function public.join_list_by_invite(uuid) to authenticated;

alter publication supabase_realtime add table public.shared_lists;
alter publication supabase_realtime add table public.list_members;
alter publication supabase_realtime add table public.votes;
