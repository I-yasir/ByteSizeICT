-- 0017 — R1.1 (CR6, Plan V2.19): plan routine PDFs (docs/05_Schema.md §4, §7; TRD §9.3; D6).
-- Path `plans/<uuid>.pdf` in the public `plan-routines` bucket. Required when a plan is created
-- (enforced by the app: ROUTINE_PDF_REQUIRED); plans created before R1.1 stay valid without one.
alter table public.plans add column routine_pdf_path text
  check (routine_pdf_path is null or routine_pdf_path ~ '^plans/[0-9a-f-]{36}\.pdf$');

-- Public read (plan cards, /enroll, /routine); uploads only through service-role signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-routines', 'plan-routines', true, 5242880, array['application/pdf'])
on conflict (id) do nothing;
