-- 0016 — R1.1 (CR3, Plan V2.14): Excel import with images (docs/05_Schema.md §7, §8.5, §8.6; TRD §8.12, §9.3).
-- The admin's browser parses the file and uploads rows JSON to `import-uploads/<batch>/rows.json` and
-- pictures to `question-media/staging/<batch>/` through signed upload URLs; nothing passes through Vercel.

-- Private; no storage.objects policies for anon/authenticated (service_role signs every URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('import-uploads', 'import-uploads', false, 20971520,
        array['application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- The batch id is the client's upload batch id, so cancel/commit can find the staged files.
-- images: staged pictures of the valid rows ([{path, row, column}]); staged_paths: every staged file
-- of the batch (removed after commit or cancel).
alter table public.question_import_batches
  add column images       jsonb  not null default '[]'::jsonb,
  add column staged_paths text[] not null default '{}';

-- Staged import files older than p_older_than. Read-only on storage.objects: deletion goes through the
-- Storage API (the internal cleanup route), never through SQL, so Storage keeps its files consistent.
create or replace function public.stale_import_uploads(p_older_than interval, p_limit integer default 1000)
returns table (bucket_id text, name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.created_at < now() - p_older_than
     and (o.bucket_id = 'import-uploads' or (o.bucket_id = 'question-media' and o.name like 'staging/%'))
   order by o.created_at
   limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

-- Same pattern as kick_outbox (0012): a silent no-op without Vault secrets or without stale files.
create or replace function public.kick_import_cleanup()
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
  if not exists (select 1 from public.stale_import_uploads(interval '24 hours', 1)) then
    return null;
  end if;
  return net.http_post(
    url     := v_url || '/api/internal/imports/cleanup',
    body    := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret));
end $$;

revoke all on function public.stale_import_uploads(interval, integer) from public, anon, authenticated;
grant execute on function public.stale_import_uploads(interval, integer) to service_role;
revoke all on function public.kick_import_cleanup() from public, anon, authenticated;
grant execute on function public.kick_import_cleanup() to service_role;

select cron.schedule('import-cleanup-kick', '20 * * * *', $$select public.kick_import_cleanup()$$);
