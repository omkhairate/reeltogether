-- Pair-focused shared state for Tonight Mode, nudges, wildcards, plans, ratings, and history.
create table if not exists public.pair_events (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('tonight','nudge','wildcard','plan','confirm','complete','rating')),
  item_id text not null default '',
  kind text not null default '' check (kind in ('','movie','show','activity')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (list_id, user_id, event_type, item_id, kind)
);

alter table public.pair_events enable row level security;

do $$ begin
  create policy "pair members read events" on public.pair_events for select to authenticated
    using (public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members create own events" on public.pair_events for insert to authenticated
    with check (user_id = auth.uid() and public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members update own events" on public.pair_events for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members delete own events" on public.pair_events for delete to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.pair_events;
exception when duplicate_object then null; end $$;

-- Lists are intentionally private two-person spaces.
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
  if exists (select 1 from public.list_members where list_id = target_id and user_id = auth.uid()) then
    return target_id;
  end if;
  if (select count(*) from public.list_members where list_id = target_id) >= 2 then
    raise exception 'This pair is already complete';
  end if;
  insert into public.list_members(list_id, user_id) values (target_id, auth.uid());
  return target_id;
end;
$$;
