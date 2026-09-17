-- Account-private reading data. No references to public tweet/ingestion tables.
-- Apply to the existing CA Supabase project only after reviewing this migration.
begin;

create table public.private_reading_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  epoch uuid not null default gen_random_uuid()
);

create table public.private_reading_events (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  epoch uuid not null,
  tweet_id text not null check (tweet_id ~ '^[0-9]{1,25}$'),
  username text not null check (username ~ '^[A-Za-z0-9_]{1,15}$'),
  display_name text not null check (length(display_name) <= 100),
  full_text text not null check (length(full_text) <= 30000),
  page_kind text not null check (page_kind in ('home','thread','profile','search','other')),
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  visible_ms integer not null check (visible_ms between 1500 and 7200000),
  primary key (owner_id, id),
  check (last_seen >= first_seen),
  check (visible_ms <= extract(epoch from (last_seen - first_seen)) * 1000 + 1500)
);
create index private_reading_recent on public.private_reading_events(owner_id, last_seen desc);
create index private_reading_tweet on public.private_reading_events(owner_id, tweet_id);
create index private_reading_text on public.private_reading_events using gin (to_tsvector('simple', full_text));

alter table public.private_reading_preferences enable row level security;
alter table public.private_reading_events enable row level security;
revoke all on public.private_reading_preferences, public.private_reading_events from public, anon, authenticated;
grant select, insert, update, delete on public.private_reading_preferences, public.private_reading_events to authenticated;

create policy reading_preferences_owner on public.private_reading_preferences
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') <> 'true');
create policy reading_events_select on public.private_reading_events
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy reading_events_delete on public.private_reading_events
  for delete to authenticated using ((select auth.uid()) = owner_id);
create policy reading_events_insert on public.private_reading_events
  for insert to authenticated with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.private_reading_preferences p
      where p.owner_id = (select auth.uid()) and p.enabled and p.epoch = private_reading_events.epoch
    )
  );
create policy reading_events_update on public.private_reading_events
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id and exists (
      select 1 from public.private_reading_preferences p
      where p.owner_id = (select auth.uid()) and p.enabled and p.epoch = private_reading_events.epoch
    )
  );

-- Rotating the epoch prevents queued records from before a pause/deletion from
-- returning when collection is later enabled, including from another device.
create function public.configure_private_reading(p_enabled boolean, p_clear boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare prefs public.private_reading_preferences;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  insert into public.private_reading_preferences(owner_id, enabled)
    values (auth.uid(), case when p_clear then false else p_enabled end)
    on conflict (owner_id) do update set enabled = excluded.enabled, epoch = gen_random_uuid()
    returning * into prefs;
  if p_clear then delete from public.private_reading_events where owner_id = auth.uid(); end if;
  return jsonb_build_object('enabled', prefs.enabled, 'epoch', prefs.epoch);
end;
$$;

create function public.record_private_reading(p_epoch uuid, p_events jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare prefs public.private_reading_preferences; item jsonb; inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 or octet_length(p_events::text) > 2000000 then
    raise exception 'Invalid reading batch' using errcode = '22023';
  end if;
  -- Serializes ingestion with pause/clear on every device.
  select * into prefs from public.private_reading_preferences where owner_id = auth.uid() for share;
  if prefs.enabled is distinct from true or prefs.epoch is distinct from p_epoch then return 0; end if;
  for item in select value from jsonb_array_elements(p_events) loop
    if to_timestamp((item->>'lastSeen')::double precision / 1000) > now() + interval '5 minutes'
      or to_timestamp((item->>'firstSeen')::double precision / 1000) < now() - interval '2 days' then
      raise exception 'Reading timestamp outside sync window' using errcode = '22023';
    end if;
    insert into public.private_reading_events as e
      (owner_id, id, epoch, tweet_id, username, display_name, full_text, page_kind, first_seen, last_seen, visible_ms)
    values (auth.uid(), (item->>'id')::uuid, p_epoch, item->'tweet'->>'tweetId', item->'tweet'->>'username',
      item->'tweet'->>'displayName', item->'tweet'->>'text', item->'tweet'->>'pageKind',
      to_timestamp((item->>'firstSeen')::double precision / 1000), to_timestamp((item->>'lastSeen')::double precision / 1000),
      (item->>'visibleMs')::integer)
    on conflict (owner_id, id) do update set
      last_seen = greatest(e.last_seen, excluded.last_seen),
      visible_ms = greatest(e.visible_ms, excluded.visible_ms),
      full_text = case when length(excluded.full_text) > length(e.full_text) then excluded.full_text else e.full_text end
    where e.epoch = excluded.epoch and e.tweet_id = excluded.tweet_id;
    inserted := inserted + 1;
  end loop;
  return inserted;
end;
$$;

create function public.search_private_reading(p_query text default '', p_username text default '', p_limit integer default 40)
returns setof public.private_reading_events language sql stable security invoker set search_path = '' as $$
  select recent.* from (
    select distinct on (tweet_id) * from public.private_reading_events
    where owner_id = auth.uid()
      and (p_username = '' or lower(username) = lower(p_username))
      and (p_query = '' or to_tsvector('simple', full_text) @@ websearch_to_tsquery('simple', left(p_query, 200))
        or lower(username) = lower(trim(leading '@' from p_query)))
    order by tweet_id, last_seen desc
  ) recent order by last_seen desc limit least(greatest(p_limit, 1), 100);
$$;

create function public.summarize_private_reading()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with recent as (
    select * from public.private_reading_events
    where owner_id = auth.uid() and first_seen >= now() - interval '7 days'
  ), authors as (
    select lower(username) as username, count(distinct tweet_id) as tweets, sum(visible_ms) as ms
    from recent group by lower(username) order by ms desc limit 6
  ), days as (
    select to_char(first_seen at time zone 'UTC', 'YYYY-MM-DD') as day,
      count(distinct tweet_id) as tweets, sum(visible_ms) as ms
    from recent group by 1 order by 1
  ) select jsonb_build_object(
    'tweets', (select count(distinct tweet_id) from recent),
    'visibleMs', (select coalesce(sum(visible_ms), 0) from recent),
    'authors', (select coalesce(jsonb_agg(jsonb_build_object('username', username, 'tweets', tweets, 'visibleMs', ms)), '[]') from authors),
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'tweets', tweets, 'visibleMs', ms)), '[]') from days)
  );
$$;

revoke all on function public.configure_private_reading(boolean, boolean), public.record_private_reading(uuid, jsonb),
  public.search_private_reading(text, text, integer), public.summarize_private_reading() from public, anon;
grant execute on function public.configure_private_reading(boolean, boolean), public.record_private_reading(uuid, jsonb),
  public.search_private_reading(text, text, integer), public.summarize_private_reading() to authenticated;

comment on table public.private_reading_events is 'Private user reading history. Exclude from public exports, firehose, analytical projections and telemetry.';
commit;
