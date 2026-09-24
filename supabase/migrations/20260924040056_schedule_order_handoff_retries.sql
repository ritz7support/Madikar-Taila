-- Expects a Vault secret named 'project_url' holding https://<project-ref>.supabase.co
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'retry-order-handoffs',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/retry-order-handoffs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

select cron.schedule(
  'prune-cron-run-history',
  '30 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days'; $$
);
