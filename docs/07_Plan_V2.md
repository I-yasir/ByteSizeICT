# 07 — Implementation Plan V2 (Update 1.1)

> **Status: APPROVED (decisions D1–D10 recorded 2026-11-09).** Coding starts at V2.01 (docs first, per CLAUDE.md §2).
> Source: owner change request `update1.1.txt` (2026-11-09). Baseline: V1 live at bytesizeict.me (`main` @ 9a7abd5). `06_Plan.md` stays the V1 record (its P4.23/P4.24 are closed by this rollout, see V2.40).
> Protocol: same as `06_Plan.md` — top to bottom, tick `[x]` with `Done:` + evidence, Decision Log for deviations, `pnpm run ci` at each gate.
> **Hard constraint (owner):** everything must work on the **free tiers** of Vercel (Hobby), Supabase, Resend and Google Cloud (§3).

## Current Step
`V2.04` — Migration `0014_v2_drop_question_meta.sql` (start of V2-A; begins only when the owner says so).

## Progress
| Phase | Steps | Done |
| --- | --- | --- |
| V2-0 Decisions, docs, safety | 4 | 4 |
| V2-A Question model cleanup | 6 | 0 |
| V2-B Question deletion | 4 | 0 |
| V2-C Excel import with images | 5 | 0 |
| V2-D Plan routines (PDF) + plan buttons | 5 | 0 |
| V2-E Exam audiences by plan | 6 | 0 |
| V2-F Public site, routine & enrollment flow | 7 | 0 |
| V2-G Regression & rollout | 4 | 0 |
| **Total** | **41** | **4** |

---

## 1. Change requests → impact

| # | Request | Impact | DB migration | Breaking? |
| --- | --- | --- | --- | --- |
| CR1 | Exams for different student groups; one exam → many groups | **Group = plan (D1).** Audience becomes `all_active` \| `plans` (exam → 1..n plans). The "selected students" audience is **removed (D2)**: `exam_assignees` table, student picker and `searchStudentsForAudience` go. `student_is_assigned`, `student_exam_cards`, `start_attempt` (via `student_is_assigned`) and `set_exam_audience` change; builder Audience tab; publish checklist. Lifts the PRD §6.2 non-goal "groups". | **Yes** (enum type swap, new table, drop table, functions) | Yes — existing `selected` exams become `all_active` |
| CR2 | Admins can delete questions | **D3:** blocked while the question is in a *current or upcoming* exam (phase `draft`, `scheduled`, `live`, `late_window`). Used only in past exams (`closed`/`archived`) or has answers → **soft delete** (hidden from bank, builder, search and duplicate checks; still shown in those exams' results and student reviews). Never used → **hard delete** + Storage images removed. Audit `question.delete`; error `QUESTION_IN_USE`. | **Yes** (`deleted_at`, function) | No |
| CR3 | Import with images (Excel; CSV if possible) | CSV cannot carry images → **Excel only (D7)**; CSV stays text-only. Free-tier design: the **browser** parses the file and uploads images directly to Storage via signed URLs; the server only validates rows and links staged images (§3). Also fixes the existing 1 MB Server Action limit (V1 imports of 1–5 MB files fail). | **Yes** (bucket, batch columns) | Template gains image columns |
| CR4 | Hero "Try a free sample exam" → "Trial exam" | **D8:** hero `ট্রায়াল পরীক্ষা দিন` / `Trial exam`; every other free/sample-exam label renamed to "Trial exam" (header link, homepage card, exam badge, `/sample` and result titles, admin "is sample" label). The URL `/sample` is unchanged. | No | No |
| CR5 | Next exam + routine off the homepage; exams visible only on the student dashboard, filtered to the student's plan | Homepage strip + routine section removed; dashboard keeps Next exam + Routine (plan-filtered via CR1). Anonymous read of `exams` revoked. **D5:** "Feature on homepage" removed (`is_featured`). **D4:** `/routine` becomes the public **plan routines** page (view/download each plan's PDF); a logged-in student additionally sees **their personal routine** (assigned exams, date-grouped) there. | **Yes** (revoke grant/policy, drop column) | Public `/routine` content changes |
| CR6 | "View/download routine" above "Choose this plan"; PDF required when creating a plan | **D6:** `plans.routine_pdf_path`; public bucket `plan-routines` (PDF ≤ 5 MB); required on create; existing plans get an admin warning only. The card button is hidden when there is no PDF. | **Yes** (column, bucket) | No |
| CR7 | "Choose this plan" same colour as "Enroll Now" | All plan buttons `primary` (documented exception to UI Spec §1 "one primary per region") | No | No |
| CR8 | Every "Enroll Now" → homepage Plans & Pricing | Hero, header, sticky mobile bar, sample-result CTA, login "enroll" link, footer → `/#pricing` | No | `/enroll` without a plan → `/#pricing` |
| CR9 | Enroll page shows only the chosen plan | `/enroll?plan=<code>` renders that plan only; unknown/inactive → `/#pricing`; `/renew` keeps `&kind=renewal` | No | Behaviour change |
| CR10 | Remove difficulty, type, source, board_year, tags | Drop columns/tables/enums/functions + all related UI (~24 files). **D9:** old spreadsheets with those columns still import (columns ignored, preview warning). | **Yes** (destructive) | Data in those fields is deleted |

### 1.1 Breaking changes & risks
1. **Destructive migrations (CR1, CR5, CR10)** delete data (question meta/tags, `exam_assignees`, `is_featured`). **D10/D11:** V1 was a trial with no active users and production restarts clean → no staged expand/contract and no data migration; backups are taken first anyway (V2.03 done, again at V2.38).
2. **Single clean-start cut-over (D11):** production is reset to the full migration history without the dev seed and the V2 app is deployed right after (V2.38). Danger to avoid: `supabase db reset --linked` loads `supabase/seed.sql` unless `--no-seed` is passed — the dev seed has test accounts with a known PIN and must never reach production.
3. **Enum type swap (CR1):** removing `'selected'` from `exam_audience` needs a new enum type swapped in and the functions that use it recreated — one migration, covered by pgTAP and by a rehearsal on restored production data (V2.37).
4. **Excel picture types (CR3):** pictures "placed over cells" (anchored drawings) are supported; Excel 365 **"Place in Cell"** pictures are not readable by exceljs → detected and reported per cell; the template's Instructions sheet explains it.
5. **Soft-deleted questions (CR2)** stay in the DB because past exams' reviews need them. The bank and duplicate detection ignore them; their Storage images are kept.
6. **Students without a plan** (`plan_id` null, e.g. legacy/admin-created) see only `all_active` exams. **Renewal into another plan** moves the student to that plan's exams; past results stay visible.
7. **Exam-route JS budget** (< 180 KB, enforced by `perf.spec.ts`): V2 changes are mostly admin/public; the builder and import page may grow (admin-only, lazy-loaded).

---

## 2. Owner decisions (recorded 2026-11-09)

| # | Decision |
| --- | --- |
| D1 | Group = plan. A student belongs to the group of their current plan (`students.plan_id`, set at approval/renewal). |
| D2 | Remove the "selected students" audience (and `exam_assignees`). |
| D3 | A question can be deleted only if it is in no **current or upcoming** exam. *Interpretation:* current/upcoming = phase `draft`, `scheduled`, `live`, `late_window` (an `always` exam stays current until archived). Used only in past exams → soft delete; never used → hard delete. |
| D4 | `/routine` lets visitors view and download each plan's routine PDF; logged-in students also get their personalised routine. |
| D5 | Remove "Feature on homepage". |
| D6 | Routine PDF: PDF only, ≤ 5 MB, required on plan create; existing plans get an admin warning, not a block. |
| D7 | Excel image columns `stem_image`, `option_a_image`…`option_d_image`, `explanation_image`; PNG/JPG/WebP ≤ 1 MB; image-only options allowed. |
| D8 | Hero `ট্রায়াল পরীক্ষা দিন` / `Trial exam`; all other free/sample-exam labels renamed to "Trial exam". |
| D9 | Old import files with the removed columns: accepted, columns ignored, warning shown. |
| D10 | Ship immediately (no active users; V1 was a trial). Any change is fine as long as nothing breaks. |
| D11 | (2026-11-09) **V2 is a clean start in production:** V1 data does not need to be preserved or migrated. Cut-over resets the production database to the full migration history (0001–0019, no seed), loads `bootstrap.prod.sql`, re-creates Vault secrets, empties old Storage files, and creates the two initial admins before release. The V1 backup (V2.03) is kept only as a safety net. |

---

## 3. Free-tier constraints (Vercel Hobby · Supabase Free · Resend Free · Google Cloud free)

Nothing in V2 may require a paid plan. Design rules that follow:

| Limit | Applies to | V2 rule |
| --- | --- | --- |
| Vercel request body ≤ 4.5 MB; Next Server Action body 1 MB by default | uploads | Files never pass through Vercel: **signed upload URLs → Supabase Storage** for import files, images and PDFs. Server Actions receive paths/JSON only. |
| Vercel Hobby function duration is short | import, deletes | **Heavy work runs in the admin's browser**: the Excel/CSV file is parsed client-side (exceljs/papaparse, dynamically imported on the import page only) and images upload directly to Storage. Server requests stay small (validate rows, link paths); signed-URL issuance and commits are batched (≤ 50 items per request). |
| No Vercel Cron / Blob / KV | scheduling, storage | Keep pg_cron + Supabase Storage. Cleanup of abandoned staged files: pg_cron → the existing `kick` pattern → an internal route (cron secret) that deletes via the **Storage API** (never `delete from storage.objects`). |
| Supabase Free: 500 MB DB, 1 GB Storage, 50 MB max file, ~5 GB egress/month, no PITR, no image transformations, pauses after ~1 week idle | storage, backups | Images ≤ 1 MB, PDFs ≤ 5 MB, import files ≤ 20 MB (staged, auto-deleted within 24 h); no Storage image transformations; `pg_dump` before every migration (RUNBOOK §8). |
| Resend Free: ~100 emails/day, 3,000/month, 1 domain | email | V2 adds **no new emails**. |
| Google Sheets API free quota | mirror | Unchanged (sequential, ≤ 1 request/s). |
| Vercel Analytics on Hobby | analytics | Page views only; existing `track()` custom events are harmless if not recorded. No new analytics. |

---

## 4. Checklist

### V2-0 Decisions, docs, safety
- [x] **V2.00 Owner decisions** D1–D10 + free-tier constraint.
  Verify: every decision answered. Done: 2026-11-09 — recorded in §2/§3 from the owner's reply.
- [x] **V2.01 Docs first**: PRD (release **R1.1**; stories for plan audiences, question delete, Excel images, plan routines, trial exam, enroll flow; remove "groups" from §6.2; A-13 featured removed; V-02/V-03 replaced by the plan-routines page), AppFlow (§1 routes, §3.5 cards, §4.1 homepage, §4.2 `/routine`, §4.3 enroll single plan, §5.2 dashboard, §6.5–6.8, §6.11 plans, §7.1 new codes `QUESTION_IN_USE`, `IMPORT_IMAGE_INVALID`, `IMPORT_IMAGE_UNSUPPORTED`, `ROUTINE_PDF_REQUIRED`), UI Spec (plan card routine button, all-primary plan buttons, delete dialog), TRD (§3 tree, §7 upload flow, §9.3 buckets, free-tier table), Schema (§4–§8, migrations 0014–0019, `exam_assignees` removed, R2-reserved list).
  Verify: owner reviews the doc diff. Done: 2026-11-09 — Verified: owner approved the doc changes ("approved", 2026-11-09). PRD: release R1.1, V-01…V-06/V-08, S-04/S-05, A-06…A-10/A-13/A-14 amended, new S-16 + A-17, glossary, free-tier assumption, §9 change summary. AppFlow: routes (`/routine`, `/enroll`, `/sample`, lobby guard), header/sticky bar → `/#pricing`, §4.1 homepage (no exam data), §4.2 plan routines + personal routine, §4.3 single-plan enroll, §4.5 Trial exam, §5.2 dashboard audience + Next exam/Routine, §6.5 delete rules, §6.6 fields, §6.7 Excel images + direct upload, §6.8 audience by plan (no featured), §6.11 routine PDF, §7.1 four new codes. UI Spec: primary-button exception, sticky bar, §7.23 plan card, §7.24 delete dialog. TRD: ADR-10, buckets, actions table, §8.11 delete + §8.12 import design, §9.3 buckets, §12 scripts, §13 free-tier table, exceljs/papaparse roles. Schema: R1.1 end-state DDL (dropped meta/tags/featured/assignees marked, `deleted_at/deleted_by`, `routine_pdf_path`, `exam_audience_plans`, enum), RLS (anon `exams` revoked), §8.1/§8.6 functions, new §8.7 `delete_questions`, migrations 0014–0019, R2-reserved list. Consistency grep: no unmarked references to removed features left in 01–05.
- [x] **V2.02 CLAUDE.md / .cursorrules** point to `07_Plan_V2.md` as the active checklist and add the free-tier rule to §3 Hard rules.
  Verify: diff reviewed. Done: 2026-11-09 — Verified: owner approved the doc changes ("approved", 2026-11-09). CLAUDE.md + `.cursorrules`: seven-doc pre-flight with `07_Plan_V2.md` as the active checklist (06 = V1 history), V2 phase gates, free-tier hard rule (TRD §13), groups = plans only, client translations via `src/lib/i18n/client.tsx`, V2 commit message format.
- [x] **V2.03 Safety net**: production `pg_dump` + download of `question-media`/`public-assets`; restore into an isolated local stack (as in the P4.23 rehearsal).
  Verify: restored row counts match production. Done: 2026-11-09 — Verified: owner ran `pnpm backup:db` on production (`backups/20261109T010355Z`: 22 public tables, 140 rows) and `backup-storage.ts` (`question-media` 5 files / 350 KB, `public-assets` 0; saved in `backups/2026-9-11/storage`); `pnpm restore:check backups/20261109T010355Z` → **RESTORE OK: 22 public tables, 140 rows match the backup.** Found & fixed during the drill: Supabase-managed schemas (`auth`, `storage`, `supabase_functions`) differ between cloud and the local stack (`auth.audit_log_entries.ip_address`), so `backup-db.sh` now dumps data from `public` only and `restore-check.sh` restores/compares `public` only (also works for the first backup). Tooling: `scripts/backup-db.sh` (`pnpm backup:db`), `scripts/backup-storage.ts`, `scripts/restore-check.sh` (`pnpm restore:check`); `/backups/` git-ignored; RUNBOOK §8 rewritten. Per D11 the backup is a safety net only.

### V2-A Question model cleanup (CR10)
- [ ] **V2.04 Migration `0014_v2_drop_question_meta.sql`**: drop `questions.difficulty/qtype/source/board_year`, tables `question_tags`, `tags`, enums `difficulty_level`/`question_type`, function `set_question_tags`; update pgTAP; `db:types`.
  Verify: `db:reset && db:types && db:test` green. Done:
- [ ] **V2.05 Server code**: questions schemas/service/queries/actions (create, update, duplicate, search, sort, bulk), `searchBank`, taxonomy (tags removed), exam builder bank filters, seed + test fixtures.
  Verify: `pnpm typecheck` + integration tests green; `grep` finds no references. Done:
- [ ] **V2.06 Admin UI**: editor fields, list filters/chips/columns, bulk tag bar, taxonomy tag manager, builder difficulty filter; bn + en keys removed.
  Verify: E2E admin/editor specs green; `check:i18n` green. Done:
- [ ] **V2.07 Import template + parser**: columns reduced; legacy columns (difficulty, type, source, board_year, tags) accepted and ignored with a preview warning (D9).
  Verify: legacy 15-column fixture and the new template import with exact counts. Done:
- [ ] **V2.08 RUNBOOK/admin-guide touch-ups** for the removed fields.
  Verify: reviewed. Done:
- [ ] **V2.09 Gate A** `pnpm run ci`.
  Verify: CI output in Done. Done:

### V2-B Question deletion (CR2)
- [ ] **V2.10 Migration `0015_v2_question_delete.sql`**: `questions.deleted_at`, `deleted_by`; partial indexes exclude deleted rows; `delete_questions(p_admin, p_ids uuid[])` → `QUESTION_IN_USE` (detail lists exam ids/titles) if any id is in an exam with phase `draft|scheduled|live|late_window`; otherwise soft delete when referenced by any exam or answer, hard delete when unreferenced; one audit row per question (`question.delete`, mode soft/hard); returns hard-deleted image paths. Duplicate-hash checks and `set_exam_questions` ignore/reject deleted questions. pgTAP.
  Verify: pgTAP: unused → hard; past-only → soft; in upcoming/live/always/draft → error; audit rows; deleted rows invisible to search helpers. Done:
- [ ] **V2.11 Service/action** `deleteQuestions(ids)`; Storage cleanup of returned paths via the Storage API (logged, best effort); queries exclude `deleted_at is not null` (bank, builder, search, duplicates, admin counts); reviews/results still read them.
  Verify: integration tests incl. image removal, soft-delete visibility in a past exam's review, auth failure. Done:
- [ ] **V2.12 UI**: Delete in the editor and bulk Delete in the list (confirm dialog with count; type-to-confirm for bulk); `QUESTION_IN_USE` lists the blocking exams with links.
  Verify: E2E: delete unused; blocked when in an upcoming exam; a past-exam question disappears from the bank but its review still renders. Done:
- [ ] **V2.13 Gate B** `pnpm run ci`.
  Verify: CI output. Done:

### V2-C Excel import with images (CR3; after V2-A)
- [ ] **V2.14 Migration `0016_v2_import_uploads.sql`**: private bucket `import-uploads` (≤ 20 MB; xlsx/csv/json); `question-media` staging prefix `staging/<batch>/`; `question_import_batches` gains `images jsonb`, `staged_paths text[]`; RLS/pgTAP.
  Verify: anon has no access; `db:test` green. Done:
- [ ] **V2.15 Client-side parsing** on the import page (exceljs + papaparse, dynamically imported there only): rows → JSON; Excel pictures via `worksheet.getImages()` → anchor cell → (row, image column); one picture per cell; PNG/JPEG/WebP magic-byte check and ≤ 1 MB in the browser; "Place in Cell" pictures detected → `IMPORT_IMAGE_UNSUPPORTED`. Rows JSON → `import-uploads`; images → `question-media/staging/<batch>/` via batched signed URLs.
  Verify: unit tests with generated XLSX fixtures (anchored, oversized, wrong type, two pictures in one cell, image-only option, in-cell picture); a 15 MB workbook works against `next start`. Done:
- [ ] **V2.16 Server preview/commit** (Zod on every row as today): preview reads the rows JSON from Storage, checks each referenced staged image exists (Storage list; size/type from metadata), duplicates (excluding soft-deleted), returns counts + per-cell errors; commit moves staged images to `questions/<uuid>.<ext>` (Storage `move`) and inserts rows in batches; image-only options allowed when that option has a picture.
  Verify: integration: commit with images → images render in the editor, admin preview and exam; each request < 5 s locally for 300 rows / 100 images. Done:
- [ ] **V2.17 Cleanup + template**: cancel deletes the batch's staged files; pg_cron → internal cleanup route deletes staged files and import uploads older than 24 h (Storage API); the `.xlsx` template gains image columns + an **Instructions** sheet ("Insert → Pictures → Place over cells", one per cell, ≤ 1 MB).
  Verify: integration: abandoned batch files removed; template opens in Excel/LibreOffice with the instructions sheet. Done:
- [ ] **V2.18 Wizard UI + Gate C**: upload progress, image counts, per-cell image errors (table + error CSV); `pnpm run ci`.
  Verify: E2E `import.spec.ts` with an image workbook; CI output. Done:

### V2-D Plan routines (CR6) + plan buttons (CR7)
- [ ] **V2.19 Migration `0017_v2_plan_routines.sql`**: `plans.routine_pdf_path text`; public bucket `plan-routines` (`application/pdf`, ≤ 5 MB). pgTAP (anon reads plan rows incl. the path; cannot write the bucket).
  Verify: `db:test` green. Done:
- [ ] **V2.20 Settings → Plans**: signed upload of the PDF; required on create (`ROUTINE_PDF_REQUIRED`); replace on edit; warning badge on active plans without a PDF (D6).
  Verify: integration + E2E: create without PDF rejected; with PDF saved; warning shown for legacy plans. Done:
- [ ] **V2.21 Plan card**: "রুটিন দেখুন / View routine" (new tab) + download link above "Choose this plan"; hidden without a PDF; every "Choose this plan" button `primary` (CR7, Decision Log exception to UI §1).
  Verify: E2E: button only with a PDF; PDF URL returns 200 `application/pdf`; axe green in both themes. Done:
- [ ] **V2.22 Public `/routine` (D4, visitor part)**: every active plan with its routine (view + download); plans without a PDF show "Routine coming soon".
  Verify: E2E as a visitor. Done:
- [ ] **V2.23 Gate D** `pnpm run ci`.
  Verify: CI output. Done:

### V2-E Exam audiences by plan (CR1)
- [ ] **V2.24 Migration `0018_v2_exam_audience_plans.sql`**: new enum `('all_active','plans')` swapped in for `exam_audience` (existing `selected` → `all_active`); table `exam_audience_plans(exam_id → exams cascade, plan_id → plans restrict, PK)` with RLS forced; drop `exam_assignees`; rewrite `student_is_assigned` (`all_active` → true; `plans` → the student's `plan_id` is among the exam's plans) and `set_exam_audience(p_exam_id, p_audience, p_plan_ids)`; recreate dependants (`student_exam_cards`, `start_attempt`); grants. pgTAP.
  Verify: pgTAP: both modes, null plan, plan switch, start honours the audience, cards filtered. Done:
- [ ] **V2.25 Server code**: exams schemas/service/actions (`setExamAudience({audience, planIds})`, publish check "≥ 1 plan when audience = plans"); remove `searchStudentsForAudience` and assignee code; builder queries.
  Verify: integration tests per mode + auth failure. Done:
- [ ] **V2.26 Builder Audience tab**: "All active students" / "Students of these plans" (multi-select; inactive plans labelled); exams list shows audience chips.
  Verify: E2E: a plan-A exam is visible to an A-student and a 404 for a B-student. Done:
- [ ] **V2.27 Student side**: dashboard Next exam + Routine, `/exams`, lobby, start and results respect the audience (via `student_is_assigned`); update the access-mode/authorization specs (P4.14/P4.15) from "selected" to "plans".
  Verify: E2E access matrix by plan. Done:
- [ ] **V2.28 Regression**: admin results, ranks, CSV and the Sheets mirror unchanged.
  Verify: existing specs green. Done:
- [ ] **V2.29 Gate E** `pnpm run ci`.
  Verify: CI output. Done:

### V2-F Public site, routine & enrollment flow (CR4, CR5, CR8, CR9)
- [ ] **V2.30 Homepage**: remove the next-exam strip + routine section; hero label "Trial exam" (D8); plans section `id="pricing"` with scroll margin.
  Verify: E2E homepage; axe. Done:
- [ ] **V2.31 Migration `0019_v2_public_surface.sql`**: revoke anon `select` on `exams` + drop `exams_public_routine`; drop `exams.is_featured` + `exams_one_featured` (D5); remove the routine/next-exam public queries and the builder "Feature" toggle.
  Verify: RLS-over-HTTP spec: anon `exams` denied; pgTAP; builder has no feature toggle. Done:
- [ ] **V2.32 Enroll entry points** → `/#pricing` (hero, header, sticky bar, sample-result CTA, login link, footer); smooth scroll on `/` (reduced-motion aware).
  Verify: E2E: each button lands on `/#pricing`. Done:
- [ ] **V2.33 Enroll page single plan**: `/enroll?plan=<code>` shows only that plan + payment accounts + form; missing/unknown/inactive → `/#pricing`; renewal path intact.
  Verify: E2E P4.02/P4.03 updated; renewal green. Done:
- [ ] **V2.34 `/routine` student part (D4)**: a logged-in student sees "Your routine" (assigned exams, date-grouped, Dhaka time) above the plan routines; the dashboard keeps Next exam + Routine.
  Verify: E2E: a student sees only their plan's exams; a visitor sees only the plan PDFs. Done:
- [ ] **V2.35 Copy (D8)**: all free/sample-exam labels → "Trial exam" (bn `ট্রায়াল পরীক্ষা`); new strings for routines/delete/import; `check:i18n`.
  Verify: `check:i18n` green; grep finds no "ফ্রি স্যাম্পল"/"free sample" in UI strings. Done:
- [ ] **V2.36 Gate F** `pnpm run ci` (incl. exam-route JS < 180 KB).
  Verify: CI output. Done:

### V2-G Regression & rollout (D10: single cut-over)
- [ ] **V2.37 Clean-start rehearsal (D11)**: on an isolated empty local stack, apply 0001–0019 with **no seed**, `bootstrap.prod.sql`, Vault secrets, two admins via `create-admin.ts`, then run the V2 app against it with the full E2E suite (as in the P4.23 rehearsal).
  Verify: all green on the fresh database. Done:
- [ ] **V2.38 Production clean-start cut-over (D11)**: fresh backup (`pnpm backup:db` + `backup-storage.ts`) → reset the production database to migrations 0001–0019 **without the dev seed** (`supabase db reset --linked --no-seed`, or a new empty Supabase project + `supabase db push`; never load `seed.sql`) → verify extensions, cron jobs, buckets, RLS (RUNBOOK §2.6) → `bootstrap.prod.sql` → Vault `site_url`/`cron_secret` (re-create if missing) → empty the old files in `question-media` → create the two initial admins (RUNBOOK §6) → push to GitHub (Vercel deploys) → admin enters plans with routine PDFs, payment accounts, settings → RUNBOOK §7 smoke incl. the new flows (plan audience, routine PDFs, Excel image import, delete, enroll flow).
  Verify: smoke checklist in Done; `select count(*) from students` = 0 before the first real enrollment; Vercel logs clean. Done:
- [ ] **V2.39 Free-tier check**: Supabase usage (DB < 500 MB, Storage < 1 GB), Vercel Hobby usage, Resend daily volume — all within free limits.
  Verify: numbers in Done. Done:
- [ ] **V2.40 Close-out**: RUNBOOK (routine PDFs, Excel image import guide, delete rules), Plan 06 P4.23/P4.24 marked done via this rollout, Plan 07 ticked.
  Verify: owner sign-off. Done:

---

## 5. Migrations (in build order)

| File | Contents | Destructive |
| --- | --- | --- |
| `0014_v2_drop_question_meta.sql` | drop 4 question columns, `tags`, `question_tags`, 2 enums, `set_question_tags` | **Yes** |
| `0015_v2_question_delete.sql` | `deleted_at`/`deleted_by`, partial indexes, `delete_questions`, audit action | No |
| `0016_v2_import_uploads.sql` | bucket `import-uploads`, batch columns | No |
| `0017_v2_plan_routines.sql` | `plans.routine_pdf_path`, bucket `plan-routines` | No |
| `0018_v2_exam_audience_plans.sql` | enum swap (`selected` removed, `plans` added), `exam_audience_plans`, drop `exam_assignees`, functions rewritten | **Yes** |
| `0019_v2_public_surface.sql` | revoke anon `exams` + policy, drop `is_featured` + index | **Yes** |

Production gets the whole history (0001–0019) at V2.38 on a reset, empty database (D11 clean start), immediately followed by the V2 deploy (D10). The migrations stay separate files so local/dev databases upgrade in place.

---

## Decision Log (V2)
| Date | Step | Decision | Reason | Docs touched |
| --- | --- | --- | --- | --- |
| 2026-11-09 | — | V2 tracked in `07_Plan_V2.md`; `06_Plan.md` kept as the V1 record. | Clean V2 progress; V1 evidence intact. | — |
| 2026-11-09 | V2.00 | Owner decisions D1–D10 and the free-tier-only constraint (§2, §3). | Owner reply. | 07 |
| 2026-11-09 | CR2 | "Current or upcoming" = phases `draft`, `scheduled`, `live`, `late_window`; past-only questions are soft-deleted, never-used ones hard-deleted. | Past exams' reviews/results must keep rendering; FKs from `exam_questions`/`attempt_answers` are RESTRICT. | Schema, AppFlow (V2.01) |
| 2026-11-09 | CR3 | Import parsing and image upload run in the browser; files go straight to Supabase Storage. | Vercel Hobby limits (4.5 MB body, short functions) and the 1 MB Server Action default (which already breaks 1–5 MB imports in V1). | TRD §7 (V2.01) |
| 2026-11-09 | D10 | Single cut-over instead of expand/contract. | No active users; a `pg_dump` keeps it reversible. | 07 |
| 2026-11-09 | V2.03 | Backups use `supabase db dump` (roles/schema/data, COPY) via repo scripts instead of a locally installed `pg_dump`/`pg_restore`; Storage files are downloaded separately with the service role. | Free plan has no PITR/automatic restorable backups; the CLI (already a dev dependency) runs pg_dump in Docker with matching Postgres 17 and handles Supabase roles. pg_cron jobs and Vault secrets are not in dumps (documented in RUNBOOK §8). | TRD §3, §12; RUNBOOK §8 |
| 2026-11-09 | V2.03 | `/backups/` is git-ignored; backup folders are created `chmod 700`. | They contain production data and files. | — |
| 2026-11-09 | V2.02 | Commit messages for V2 steps: `V2.<nn>: <summary>` unless the owner specifies one. | Mirrors the V1 `P<id>` convention. | CLAUDE.md §5 |
| 2026-11-09 | V2.03 | Backups dump `public` data only; restore drill restores/compares `public` only. | The drill on the production backup failed on Supabase-managed `auth` tables whose columns differ between cloud and the local stack; the app does not use those schemas. | RUNBOOK §8 |
| 2026-11-09 | D11 | V2 production starts clean (reset + full migration history, no seed, bootstrap, two admins). | Owner decision: V1 was a trial; no data to keep. | 07 §2, V2.37–V2.38 |
