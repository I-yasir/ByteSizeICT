# Production Runbook — ByteSizeICT

Audience: the person deploying and operating ByteSizeICT. Follow the sections in order for a first launch.
Every command assumes the repository root, Node 22 (`nvm use`) and pnpm 10.18.0.
References: TRD §5 (env vars), §9 (integrations), §10 (security); Schema §7–§8 (RLS, cron, Vault).

> **Before launch, two release blockers are open** (Plan P4.20, P4.22; see §12). Do not go live until they are closed.

---

## 1. Accounts and secrets you need

| Item | Where | Notes |
| --- | --- | --- |
| Supabase organisation on the **Pro** plan | supabase.com | Pro is required for PITR backups and reliable pg_cron. |
| Vercel team (Pro recommended) | vercel.com | Region `sin1` (Singapore) is set in `vercel.json`. |
| Domain with DNS access | your registrar / Cloudflare | e.g. `bytesizeict.com`, mail subdomain `mail.bytesizeict.com`. |
| Resend account | resend.com | Verified sending domain. |
| Google Cloud project | console.cloud.google.com | Sheets API + one service account. |
| Password manager entry | — | Store every secret below; nothing goes into git. |

Generate the two app secrets **once** and store them:

```bash
openssl rand -base64 32   # AUTH_PEPPER  (argon2 secret; NEVER rotate casually: it invalidates every PIN and password)
```

```bash
openssl rand -hex 32      # CRON_SECRET  (shared by Vercel and Supabase Vault)
```

---

## 2. Supabase project

1. **Create the project**: region **Southeast Asia (Singapore) — ap-southeast-1**, Postgres 17, a strong database password (store it).
2. **Plan & backups**: upgrade the organisation to **Pro**. In *Database → Backups* enable **Point-in-Time Recovery** (7-day retention). Confirm that daily backups are listed.
3. **Extensions** (*Database → Extensions*): enable `pg_cron` and `pg_net`. (`citext`, `pg_trgm`, `pgcrypto` are created by migration 0001.)
4. **Auth**: not used (ADR-02). Leave email/phone providers disabled; do not create users there.
5. **Apply migrations** from your machine:

   ```bash
   pnpm exec supabase login
   ```

   ```bash
   pnpm exec supabase link --project-ref <project-ref>
   ```

   ```bash
   pnpm exec supabase db push
   ```

   `db push` applies `supabase/migrations/0001…0013` in order. It never runs `seed.sql`. **From this point on, never edit an applied migration**: add a new numbered file.
6. **Verify** in the SQL editor:

   ```sql
   select count(*) from pg_tables where schemaname = 'public' and rowsecurity;   -- 22 (every table)
   select jobname, schedule from cron.job order by jobname;                         -- cleanup-daily, cleanup-import-batches, finalize-overdue-attempts, outbox-kick
   select id, public from storage.buckets order by id;                             -- public-assets (true), question-media (false)
   ```

7. **Vault secrets** used by the `outbox-kick` cron job (Schema §8.5). Use the production site URL (no trailing slash) and the same `CRON_SECRET` you give Vercel:

   ```sql
   select vault.create_secret('https://bytesizeict.com', 'site_url');
   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
   ```

   To change one later: `select vault.update_secret((select id from vault.secrets where name = 'site_url'), 'https://new-url');`
8. **Reference data**: run `supabase/bootstrap.prod.sql` once (SQL editor, or `psql "$DATABASE_URL" -f supabase/bootstrap.prod.sql`). It inserts only the ICT subject/chapters/topics, three placeholder plans and default settings. **Never run `supabase/seed.sql` against production** (it contains test users with a known PIN).
9. Collect for Vercel: *Project Settings → API*: Project URL, `anon` key, `service_role` key.

---

## 3. Vercel project

1. Import the repository; framework preset **Next.js**; root directory = repo root; install command `pnpm install --frozen-lockfile`; build command `pnpm build`.
2. *Settings → General → Node.js Version*: **22.x**. *Functions → Region*: `sin1` (also pinned by `vercel.json`).
3. **Environment variables** (Production; mirror to Preview with a separate Supabase project if you use previews):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | `https://bytesizeict.com` (no trailing slash; must equal the browser origin, used for Origin checks) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key (**server only**, never `NEXT_PUBLIC_`) |
| `AUTH_PEPPER` | from §1 |
| `CRON_SECRET` | from §1 (same value as the Vault `cron_secret`) |
| `RESEND_API_KEY` | `re_…` (required in production; boot fails without it) |
| `EMAIL_FROM` | `ByteSizeICT <no-reply@mail.bytesizeict.com>` |
| `ADMIN_ALERT_EMAIL` | the coach's inbox, or empty to disable new-admission alerts |
| `GOOGLE_SA_EMAIL` | service account email (§5) |
| `GOOGLE_SA_PRIVATE_KEY` | the PEM from the JSON key, with literal `\n` escapes |
| `GOOGLE_SHEET_ID` | spreadsheet id; empty disables the mirror |
| `APP_TIMEZONE` | `Asia/Dhaka` |

   `VERCEL_ENV` is set by Vercel; with `production` the env validation requires `RESEND_API_KEY` and `EMAIL_FROM`, and the dev mailbox route (`/api/internal/dev-mailbox`) answers 404.
4. Add the domain, set it as primary, and redirect `www` → apex (or the reverse; keep `NEXT_PUBLIC_SITE_URL` equal to the primary).
5. Enable **Vercel Analytics** for the project (public pages send `enroll_submit`, `sample_complete`, `sample_enroll_click`).
6. Deploy, then check headers:

   ```bash
   curl -sI https://bytesizeict.com | grep -iE 'strict-transport|content-security|x-frame|nosniff|referrer-policy|permissions-policy'
   ```

---

## 4. Resend (email)

1. *Domains → Add domain*: `mail.bytesizeict.com` (a subdomain keeps the apex reputation separate). Region: the closest offered.
2. Create the DNS records **exactly as Resend shows them** (values are account-specific). Typically:

| Type | Name | Value (example shape) | Purpose |
| --- | --- | --- | --- |
| MX | `send.mail` | `feedback-smtp.<region>.amazonses.com` (priority 10) | bounces |
| TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | SPF |
| TXT | `resend._domainkey.mail` | `p=MIGfMA0GCSq…` | DKIM |
| TXT | `_dmarc` (apex) | `v=DMARC1; p=none; rua=mailto:dmarc@bytesizeict.com` | DMARC (move to `quarantine` after 2–4 clean weeks) |

3. Wait for **Verified** on every record, then create an API key with *Sending access* only → `RESEND_API_KEY`.
4. Test: approve a test admission in production (§7) and check that the credentials email arrives (inbox, not spam) and shows Bangla first, then English.

---

## 5. Google Sheets mirror

1. Google Cloud console → new project (or existing) → *APIs & Services → Enable APIs* → **Google Sheets API**.
2. *IAM & Admin → Service accounts → Create*: name `bytesizeict-sheets`, no roles needed. *Keys → Add key → JSON*. From the JSON: `client_email` → `GOOGLE_SA_EMAIL`, `private_key` → `GOOGLE_SA_PRIVATE_KEY` (keep the `\n` escapes as one line). Delete the downloaded JSON afterwards.
3. Create a spreadsheet with **three tabs named exactly** `Admissions`, `Active Students`, `Exam Results`, header row 1 per the concept doc §8 (TRD §9.2). Admissions uses TrxID in **column D**; Active Students uses Mobile in **column A**; Exam Results columns: submitted_at (Dhaka), mobile, exam title, score, total, correct, incorrect, skipped, late.
4. *Share* the spreadsheet with `GOOGLE_SA_EMAIL` as **Editor**. Copy the id from the URL (`/spreadsheets/d/<id>/`) → `GOOGLE_SHEET_ID`.
5. Verify after launch: *Admin → Settings → Integrations* shows the last sync, and pending/failed counts stay near 0. Sheet failures never block admins; jobs retry with backoff (1 m → 24 h, 8 attempts) and *Retry failed* re-queues them.

---

## 6. First admin account

Admins are created only by the CLI (PRD A-01). Use a temporary env file that is **never committed** and delete it afterwards:

```bash
vercel env pull .env.production.local --environment=production
```

```bash
set -a; source .env.production.local; set +a; pnpm admin:create --email coach@example.com --name "Coach"
```

```bash
rm .env.production.local
```

The script prompts for a password (min 12 chars; hidden input). Up to 3 admins, equal rights.

---

## 7. Launch smoke test (Plan P4.24)

1. Log in at `/admin/login`; fill in *Settings*: brand, contact links, **payment accounts** (real numbers), plans/prices, FAQ, testimonials (real ones only).
2. In a private window: `/` renders, `/sample` works end to end, `/enroll` shows the payment accounts.
3. Enroll with a **test mobile** you control and a real inbox; approve it in `/admin/admissions`; the credentials email arrives; log in; forced PIN change; dashboard.
4. Build a 2-question exam starting in 2 minutes, publish, take it with the test student, submit; check the result page, `/admin/exams/<id>/results`, the CSV, and the `Exam Results` sheet row.
5. Delete the test data:

   ```sql
   -- replace the mobile; removes the student, their attempts/sessions (cascade) and admissions
   delete from exam_attempts where student_id = (select id from students where mobile = '01XXXXXXXXX');
   delete from admissions where mobile = '01XXXXXXXXX';
   delete from students where mobile = '01XXXXXXXXX';
   ```

   Archive or delete the test exam (delete only if it has no attempts left).

---

## 8. Backups and restore

- **Automatic**: Supabase Pro daily backups + PITR (7 days). Check *Database → Backups* monthly.
- **Monthly manual dump** (keep 12, store off-site, encrypted). Use the *session* connection string (port 5432), not the transaction pooler:

  ```bash
  pg_dump "postgresql://postgres.<ref>:<db-password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" --format=custom --no-owner --file "bytesizeict-$(date +%Y-%m).dump"
  ```

- **Restore drill** (quarterly, into a scratch project, never production):

  ```bash
  pg_restore --no-owner --clean --if-exists --dbname "<scratch-connection-string>" bytesizeict-YYYY-MM.dump
  ```

  Storage objects (question images, logo) are **not** in `pg_dump`; download the `question-media` and `public-assets` buckets with the Supabase CLI/S3 API alongside the dump.
- PITR restore: *Database → Backups → Point in time* (restores the whole project; announce downtime).

---

## 9. Operations checklist

| When | Check |
| --- | --- |
| Daily (first 2 weeks) | `/admin` pending admissions; *Settings → Integrations* failed outbox jobs; Vercel function errors. |
| Weekly | `select status, count(*) from outbox group by 1;` (no growing `pending`/`failed`); cron runs: `select jobname, status, count(*) from cron.job_run_details where start_time > now() - interval '7 days' group by 1, 2;` |
| Monthly | `pnpm audit --prod` (no high/critical), `pg_dump` (§8), dependency review (no Renovate in R1). |
| On secret leak | Rotate the leaked key (Supabase service key / Resend / Google key / CRON_SECRET in Vercel **and** Vault). Rotating `AUTH_PEPPER` forces every student PIN to be reset — last resort only. |

---

## 10. PRD §5 metrics (SQL snippets)

Run in the Supabase SQL editor (read-only). "Week" = last 7 days.

```sql
-- Conversion: admissions created per day (divide by unique visitors to / from Vercel Analytics; target ≥ 3%)
select date_trunc('day', created_at at time zone 'Asia/Dhaka') as day, count(*) from admissions
where created_at > now() - interval '7 days' group by 1 order by 1;

-- Operations: median submit → approval time (target < 12 h)
select percentile_cont(0.5) within group (order by reviewed_at - created_at) as median_approval
from admissions where status = 'approved' and reviewed_at > now() - interval '7 days';

-- Operations: credentials email delivery success (target ≥ 99%)
select round(100.0 * count(*) filter (where credentials_status = 'sent')
       / nullif(count(*) filter (where credentials_status in ('sent', 'failed')), 0), 2) as pct_sent
from students where created_at > now() - interval '30 days';

-- Engagement: share of active students attempting each live exam on time (target ≥ 70%; all_active audiences)
select e.title, e.starts_at,
       count(a.id) filter (where not a.is_late) as on_time_attempts,
       (select count(*) from students s where s.status = 'active'
          and e.starts_at >= s.access_starts_at and e.starts_at < s.access_expires_at) as active_students
from exams e left join exam_attempts a on a.exam_id = e.id and a.status <> 'in_progress'
where e.status = 'published' and not e.is_sample and e.audience = 'all_active'
  and e.live_ends_at between now() - interval '7 days' and now()
group by e.id order by e.starts_at;

-- Reliability proxy: attempts finalized by cron/auto-submit vs manual submit
select status, count(*) from exam_attempts where submitted_at > now() - interval '7 days' group by 1;
```

Not in the database: sample → enroll click-through (Vercel Analytics events `sample_complete` / `sample_enroll_click`), answer-save success rate and p95 latency of `PUT /api/attempts/:id/answers` (Vercel function logs / observability; `requestId`, `route`, `durationMs`, `errorCode` are logged as JSON).

---

## 11. Staging dry run (Plan P4.23 verify)

Repeat §2–§6 on a separate Supabase project + Vercel preview environment named *staging*, with `GOOGLE_SHEET_ID` pointing at a copy of the sheet, then run the §7 smoke test against staging by hand. (The Playwright suite, `pnpm test:e2e`, runs against a local production build and the local Supabase stack; it is not pointed at staging.) Record the date and any deviations in `docs/06_Plan.md` (P4.23 Done note).

---

## 12. Open release blockers (as of 2026-11-07)

1. **Dependency vulnerabilities (P4.22)**: `pnpm audit --prod` reports critical/high advisories in `next@16.0.1` (incl. an RCE in the React flight protocol fixed in 16.0.7; later fixes up to 16.4.1), `zod@4.1.12` (≥ 4.6.6), and transitive `sharp`/`postcss`. Upgrading changes locked TRD §2 versions and needs owner approval, then a full `pnpm run ci` + `pnpm test:e2e`.
2. **Performance budget (P4.20)**: exam route ships 209.5 KB gzipped JS vs the 180 KB budget; Lighthouse CI and the 200-VU k6 run need a staging deployment.
