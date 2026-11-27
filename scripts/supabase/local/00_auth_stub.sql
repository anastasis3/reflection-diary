-- LOCAL TESTING ONLY. Not part of the migrations.
-- On Supabase the auth schema, auth.users and auth.uid() already exist.
-- This stub lets the same migrations run on a plain PostgreSQL instance.
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique not null
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

do $$ begin
  create role authenticated;
exception when duplicate_object then null; end $$;

do $$ begin
  create role anon;
exception when duplicate_object then null; end $$;
