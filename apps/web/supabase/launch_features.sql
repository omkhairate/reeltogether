-- Dynamic catalogue, custom activities, and web-push subscriptions.
-- Safe to run more than once in the Supabase SQL editor.

create table if not exists public.list_items (
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  item_id text not null,
  kind text not null check (kind in ('movie','show','activity')),
  added_by uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (list_id, item_id, kind)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.list_items enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "members read saved items" on public.list_items;
create policy "members read saved items" on public.list_items for select to authenticated
using (public.is_list_member(list_id));

drop policy if exists "members add saved items" on public.list_items;
create policy "members add saved items" on public.list_items for insert to authenticated
with check (added_by = auth.uid() and public.is_list_member(list_id));

drop policy if exists "members update saved items" on public.list_items;
create policy "members update saved items" on public.list_items for update to authenticated
using (public.is_list_member(list_id))
with check (public.is_list_member(list_id));

drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions" on public.push_subscriptions for select to authenticated
using (user_id = auth.uid());

drop policy if exists "users add own push subscriptions" on public.push_subscriptions;
create policy "users add own push subscriptions" on public.push_subscriptions for insert to authenticated
with check (user_id = auth.uid() and public.is_list_member(list_id));

drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions" on public.push_subscriptions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions" on public.push_subscriptions for delete to authenticated
using (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.list_items;
exception when duplicate_object then null;
end $$;
