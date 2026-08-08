-- Multi-device foundations (Phase 0).
--
-- Additive and re-runnable. `users.google_user_id` is kept (nullable) so the
-- running deployment stays valid while this rolls out; it is dropped in a later
-- migration once nothing reads it.
--
-- Rehearse against a LOCAL database first. `.env.local` points DATABASE_URL at
-- production Supabase, so anything run casually from this repo hits prod.

begin;

-- 0. Primary keys are dropped BY LOOKUP, never by name.
--    `drizzle-kit push` names composite keys `<table>_<cols>_pk` while a
--    hand-written `primary key (...)` gets `<table>_pkey`. Guessing the name
--    means `drop constraint if exists` silently matches nothing and the
--    following `add primary key` fails with "multiple primary keys".
create or replace function pg_temp.drop_pk(tbl regclass) returns void as $$
declare name text;
begin
  select conname into name from pg_constraint where conrelid = tbl and contype = 'p';
  if name is not null then
    execute format('alter table %s drop constraint %I', tbl::text, name);
  end if;
end;
$$ language plpgsql;

-- 1. Identities: one row per connected provider account.
create table if not exists identities (
  provider          text not null,
  provider_user_id  text not null,
  user_id           text not null references users(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (provider, provider_user_id)
);

insert into identities (provider, provider_user_id, user_id, created_at)
  select 'google', google_user_id, id, created_at from users
  where google_user_id is not null
on conflict do nothing;

-- 2. Users: legacy column becomes optional, plus the tie-breaker for resolution.
alter table users alter column google_user_id drop not null;
alter table users add column if not exists primary_source text;
update users set primary_source = 'google' where primary_source is null;

-- 3. Tokens: one row per (user, provider).
alter table oauth_tokens add column if not exists provider text not null default 'google';
select pg_temp.drop_pk('oauth_tokens');
alter table oauth_tokens add primary key (user_id, provider);

-- 4. Metrics: one row per (user, day, SOURCE); resolution happens at read time.
alter table daily_metrics add column if not exists source text not null default 'google';
alter table daily_metrics add column if not exists hrv_sdnn real;
alter table daily_metrics add column if not exists strain_native real;
alter table daily_metrics add column if not exists recovery_native integer;
select pg_temp.drop_pk('daily_metrics');
alter table daily_metrics add primary key (user_id, date, source);

-- 5. Apple pairings (push-based ingest; unused until Phase 3).
create table if not exists apple_pairings (
  token_hash   text primary key,
  user_id      text not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

commit;
