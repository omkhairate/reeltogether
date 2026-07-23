-- Backward-compatible account recovery helpers for ReelTogether.
-- Run once in Supabase SQL Editor. Existing users, memberships, and sessions
-- are untouched; rows are only moved after a user explicitly verifies an
-- existing email account and presents a short-lived transfer token.

create table if not exists public.account_transfers (
  token uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

alter table public.account_transfers enable row level security;

-- There are deliberately no direct table policies. Both operations go through
-- narrow security-definer functions so another signed-in user cannot inspect
-- recovery tokens or discover private list IDs.
create or replace function public.prepare_account_transfer(target_list uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in is required';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Only a guest account needs this recovery handoff';
  end if;
  if not exists (
    select 1 from public.list_members
    where list_id = target_list and user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this list';
  end if;

  delete from public.account_transfers
  where from_user = auth.uid() or expires_at < now();
  insert into public.account_transfers(from_user, list_id)
  values (auth.uid(), target_list)
  returning token into new_token;
  return new_token;
end;
$$;

create or replace function public.claim_account_transfer(transfer_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  transfer_row public.account_transfers%rowtype;
  target_user uuid := auth.uid();
begin
  if target_user is null then raise exception 'Sign in is required'; end if;

  select * into transfer_row
  from public.account_transfers
  where token = transfer_token and expires_at >= now()
  for update;
  if transfer_row.token is null then return null; end if;

  if transfer_row.from_user <> target_user then
    insert into public.list_members(list_id, user_id, joined_at)
    values (transfer_row.list_id, target_user, now())
    on conflict do nothing;

    insert into public.votes(list_id, user_id, item_id, kind, decision, updated_at)
    select list_id, target_user, item_id, kind, decision, updated_at
    from public.votes
    where list_id = transfer_row.list_id and user_id = transfer_row.from_user
    on conflict do nothing;
    delete from public.votes
    where list_id = transfer_row.list_id and user_id = transfer_row.from_user;

    if to_regclass('public.pair_events') is not null then
      execute $move_events$
        insert into public.pair_events(id, list_id, user_id, event_type, item_id, kind, payload, updated_at)
        select id, list_id, $1, event_type, item_id, kind, payload, updated_at
        from public.pair_events where list_id = $2 and user_id = $3
        on conflict (list_id, user_id, event_type, item_id, kind) do nothing
      $move_events$ using target_user, transfer_row.list_id, transfer_row.from_user;
      execute 'delete from public.pair_events where list_id = $1 and user_id = $2'
        using transfer_row.list_id, transfer_row.from_user;
    end if;

    if to_regclass('public.list_items') is not null then
      execute 'update public.list_items set added_by = $1 where list_id = $2 and added_by = $3'
        using target_user, transfer_row.list_id, transfer_row.from_user;
    end if;
    if to_regclass('public.push_subscriptions') is not null then
      execute 'delete from public.push_subscriptions where list_id = $1 and user_id = $2'
        using transfer_row.list_id, transfer_row.from_user;
    end if;

    update public.shared_lists set owner_id = target_user
    where id = transfer_row.list_id and owner_id = transfer_row.from_user;
    delete from public.list_members
    where list_id = transfer_row.list_id and user_id = transfer_row.from_user;
  end if;

  delete from public.account_transfers where token = transfer_token;
  return transfer_row.list_id;
end;
$$;

revoke all on function public.prepare_account_transfer(uuid) from public;
revoke all on function public.claim_account_transfer(uuid) from public;
grant execute on function public.prepare_account_transfer(uuid) to authenticated;
grant execute on function public.claim_account_transfer(uuid) to authenticated;
