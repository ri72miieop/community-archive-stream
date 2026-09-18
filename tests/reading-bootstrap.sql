-- Only for the disposable database created by scripts/test-reading-db.sh.
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{"is_anonymous":false}'::jsonb $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
insert into auth.users values ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb');
