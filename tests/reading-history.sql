set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
do $$
declare prefs jsonb; old_epoch uuid; payload jsonb; n integer; result jsonb;
begin
  prefs := public.configure_private_reading(true);
  old_epoch := (prefs->>'epoch')::uuid;
  payload := jsonb_build_array(jsonb_build_object(
    'id', '11111111-1111-4111-8111-111111111111',
    'tweet', jsonb_build_object('tweetId','12345','username','alice','displayName','Alice','text','Community memory deserves context','pageKind','home'),
    'firstSeen', floor(extract(epoch from now() - interval '5 seconds') * 1000),
    'lastSeen', floor(extract(epoch from now()) * 1000), 'visibleMs', 4000
  ));
  assert public.record_private_reading(old_epoch, payload) = 1;
  assert public.record_private_reading(old_epoch, payload) = 1;
  select count(*) into n from public.private_reading_events;
  assert n = 1, 'retry must be idempotent';
  result := public.summarize_private_reading();
  assert (result->>'visibleMs')::integer = 4000, 'retries must not inflate attention';
  select count(*) into n from public.search_private_reading('memory');
  assert n = 1, 'history must be searchable';
  begin
    update public.private_reading_events set owner_id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
    raise exception 'owner reassignment was allowed';
  exception when insufficient_privilege then null; end;
  perform public.configure_private_reading(false);
  assert public.record_private_reading(old_epoch, payload) = 0, 'paused writes must be rejected';
  prefs := public.configure_private_reading(true);
  assert public.record_private_reading(old_epoch, payload) = 0, 'old queue must stay invalid after resume';
  perform public.configure_private_reading(false, true);
  select count(*) into n from public.private_reading_events;
  assert n = 0, 'clear must delete account history';
  assert public.record_private_reading((prefs->>'epoch')::uuid, payload) = 0, 'clear must prevent resurrection';
  prefs := public.configure_private_reading(true);
  assert public.record_private_reading((prefs->>'epoch')::uuid, payload) = 1;
end $$;

set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
do $$
declare n integer;
begin
  select count(*) into n from public.private_reading_events; assert n = 0, 'other account can read history';
  select count(*) into n from public.search_private_reading(); assert n = 0, 'search leaks other account';
  assert (public.summarize_private_reading()->>'tweets')::integer = 0, 'summary leaks other account';
  update public.private_reading_events set full_text = 'hacked'; get diagnostics n = row_count; assert n = 0;
  delete from public.private_reading_events; get diagnostics n = row_count; assert n = 0;
  begin
    insert into public.private_reading_preferences(owner_id, enabled) values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
    raise exception 'other account preference write allowed';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set role anon;
set request.jwt.claim.sub = '';
do $$
begin
  begin perform * from public.private_reading_events; raise exception 'anonymous history read allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.configure_private_reading(true); raise exception 'anonymous configuration allowed';
  exception when insufficient_privilege then null; end;
  begin perform public.search_private_reading(); raise exception 'anonymous search allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
do $$ begin assert (select count(*) = 0 from public.private_reading_events), 'account deletion must cascade'; end $$;
