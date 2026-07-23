-- Additive pair-experience storage. Safe to run on the live project.
-- This script does not update or delete any existing profile, membership,
-- shared list, vote, saved item, collection, session, or pair-event row.

create table if not exists public.pair_extras (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  extra_type text not null check (extra_type in (
    'reaction', 'memory', 'challenge', 'theme', 'services', 'nomination'
  )),
  item_id text not null default '',
  kind text not null default '' check (kind in ('','movie','show','activity')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (list_id, user_id, extra_type, item_id, kind)
);

alter table public.pair_extras enable row level security;

do $$ begin
  create policy "pair members read extras" on public.pair_extras for select to authenticated
    using (public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members create own extras" on public.pair_extras for insert to authenticated
    with check (user_id = auth.uid() and public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members update own extras" on public.pair_extras for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_list_member(list_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pair members delete own extras" on public.pair_extras for delete to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.pair_extras;
exception when duplicate_object then null; end $$;
