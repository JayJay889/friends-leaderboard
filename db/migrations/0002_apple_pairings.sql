-- Apple Watch pairing (Phase 3).
--
-- 0001 created apple_pairings keyed on token_hash, before the pairing flow was
-- designed. The token is now minted when the phone redeems a short code, so the
-- hash starts out null and cannot be the key. The table has never held a row,
-- so it is replaced outright rather than migrated.

begin;

drop table if exists apple_pairings;

create table apple_pairings (
  id                    text primary key,
  user_id               text not null references users(id) on delete cascade,
  -- Short code typed once on the phone to claim a token. Single use.
  pair_code             text unique,
  pair_code_expires_at  timestamptz,
  -- SHA-256 of the bearer token. The raw token is shown to the phone once and
  -- never stored, so a database leak cannot be replayed as a write credential.
  token_hash            text unique,
  created_at            timestamptz not null default now(),
  last_seen_at          timestamptz,
  revoked_at            timestamptz
);

create index apple_pairings_user_id_idx on apple_pairings (user_id);

commit;
