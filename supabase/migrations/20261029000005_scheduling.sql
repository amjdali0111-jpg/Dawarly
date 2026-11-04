-- =============================================================================
-- Scheduling. expire_reports() is idempotent; it can be run by pg_cron (below,
-- when the extension is available) and/or by the /api/cron/expire endpoint.
-- Running both is safe: a report is only transitioned once and notifications
-- are de-duplicated by key.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('dawarly-expire-reports', '*/15 * * * *', 'select public.expire_reports()');
  else
    raise notice 'pg_cron not available; schedule /api/cron/expire instead';
  end if;
end $$;
