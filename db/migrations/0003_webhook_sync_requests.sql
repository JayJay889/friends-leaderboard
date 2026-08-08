-- Lets a provider webhook hand work off instead of doing it inline.
--
-- WHOOP expects a 2XX inside roughly a second, and a sync is three API calls
-- plus a token refresh. So the webhook raises this flag and returns; the next
-- nudge performs the pull and clears it.

begin;

alter table oauth_tokens add column if not exists sync_requested_at timestamptz;

-- The nudge looks for outstanding requests on every call, so it should not have
-- to scan the table to find none.
create index if not exists oauth_tokens_sync_requested_idx
  on oauth_tokens (sync_requested_at)
  where sync_requested_at is not null;

commit;
