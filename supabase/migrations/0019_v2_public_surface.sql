-- 0019 — R1.1 (CR5, D5, Plan V2.31): exams are no longer public (docs/05_Schema.md §5, §7).
-- Visitors see plan routine PDFs only; students see their exams through the server (service role).
drop policy if exists exams_public_routine on public.exams;
revoke all on public.exams from anon;

-- "Feature on homepage" is gone with the homepage exam strip (D5).
drop index if exists public.exams_one_featured;
alter table public.exams drop column if exists is_featured;
