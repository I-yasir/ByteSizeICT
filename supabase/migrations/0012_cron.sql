-- 0012 — Scheduled jobs (docs/05_Schema.md §8.5)
-- Vault secrets `site_url` and `cron_secret` are created per environment (runbook; local: seed.sql).

-- POSTs to the outbox drain endpoint only when there is due work and the secrets exist, so a
-- missing configuration (e.g. local dev without the app running) is a silent no-op.
create or replace function public.kick_outbox()
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  if not exists (select 1 from public.outbox
                  where (status = 'pending' and next_attempt_at <= now())
                     or (status = 'processing' and locked_at < now() - interval '5 minutes')) then
    return null;
  end if;
  return net.http_post(
    url     := v_url || '/api/internal/outbox/drain',
    body    := '{"limit":25}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret));
end $$;

revoke all on function public.kick_outbox() from public, anon, authenticated;
grant execute on function public.kick_outbox() to service_role;

select cron.schedule('finalize-overdue-attempts', '* * * * *',   $$select public.finalize_overdue_attempts()$$);
select cron.schedule('outbox-kick',               '*/2 * * * *', $$select public.kick_outbox()$$);
-- 20:30 UTC = 02:30 Asia/Dhaka
select cron.schedule('cleanup-daily',             '30 20 * * *', $$
  delete from public.rate_limit_events where created_at < now() - interval '2 days';
  delete from public.sessions where expires_at < now() - interval '30 days';
  delete from public.outbox where status = 'done' and done_at < now() - interval '30 days';
$$);
