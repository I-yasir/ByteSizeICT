# 04 — Technical Requirements Document (TRD)

Status: **Locked for R1.** The stack, versions, folder layout and security constraints are binding. Any deviation requires a Decision Log entry in `06_Plan.md` **before** the change.

---

## 1. Architecture Overview

```
 Browser (mobile Chrome, Next.js RSC + small client islands)
   │  HTTPS, httpOnly session cookies (bsi_session | bsi_admin)
   ▼
 Next.js 16 on Vercel (region sin1, Node.js runtime only)
   ├─ Server Components  → read data through src/features/*/queries.ts
   ├─ Server Actions     → admin + enrollment + auth mutations (src/features/*/actions.ts)
   ├─ Route Handlers     → exam runtime JSON API + internal cron + CSV/template downloads (src/app/api/**)
   ├─ proxy.ts           → cookie-presence redirects only (no DB)
   └─ after()            → post-response work (credentials email, outbox drain kick)
   │  supabase-js (service_role, server-only)          │ supabase-js (anon, public pages only)
   ▼                                                    ▼
 Supabase Postgres 17 (ap-southeast-1 Singapore) — RLS ON everywhere, default deny
   ├─ SQL functions (security definer, service_role-only EXECUTE) for every multi-row transaction
   ├─ pg_cron: finalize overdue attempts (1 min), outbox kick via pg_net (2 min), cleanup (daily)
   └─ Storage: question-media (private, signed URLs) · public-assets (public)
 External: Resend (email) · Google Sheets API v4 (service account, write-only mirror)
```

**Core architectural decisions (ADR summary)**

| # | Decision | Rationale |
| --- | --- | --- |
| ADR-01 | **Backend-for-Frontend:** the browser never talks to Supabase directly. All reads and writes go through Next.js server code. | Correct answers must never reach the client; server-side timing and scoring are required; one auth model. |
| ADR-02 | **Custom session auth** (opaque random token, SHA-256 hash stored in `sessions`) for both students and admins. **Supabase Auth is not used.** | Login by mobile+PIN, instant revocation, single-session policy, lockouts, force-logout and suspend are first-class; Supabase Auth's email/phone/OTP model fits poorly. |
| ADR-03 | **RLS enabled on every table with default deny**; only narrow public `SELECT` policies + column grants for the `anon` role. Server code uses the `service_role` key, which lives only in `server-only` modules. | Defense in depth: a leaked anon key exposes only public routine/plan/settings data. |
| ADR-04 | Multi-step writes (start/save/submit attempt, approve admission, scoring) are **Postgres functions** called through `rpc()`. | Atomicity and race safety (`FOR UPDATE`, unique constraints) without an app-level transaction manager. |
| ADR-05 | **Transactional outbox** for Google Sheets and non-secret emails. Credentials emails (which contain a PIN) are sent directly in `after()` and never persisted. | Third-party failures never block admins; secrets are never stored. |
| ADR-06 | Exam autosave is **local-first** (localStorage) with a sequenced sync queue; the server applies changes only when `seq` is newer. | Zero answer loss on flaky mobile networks; idempotent and order-independent. |
| ADR-07 | No ORM. SQL migrations via Supabase CLI; generated TypeScript types; `supabase-js` query builder + RPC. | RLS, functions and triggers are first-class in SQL; one migration system. |
| ADR-08 | Cookie-based locale (no URL prefix) with `next-intl`; `bn` default. | Simplest routing; the public SEO surface is small. |
| ADR-09 | `export const revalidate = 60` + `revalidatePath()` after admin mutations are kept, but because the root layout reads the locale cookie every page renders dynamically in R1. `cacheComponents` / `"use cache"` are **not** enabled. | Predictable behaviour; revisit if P4.20 shows TTFB problems. |

---

## 2. Locked Tech Stack & Exact Versions

Install with **exact** versions (`pnpm add -E`). `package.json` must contain no `^` or `~`. If an exact version below fails to resolve, use the **latest patch of the same minor**, then record it in the Decision Log and update this table.

### 2.1 Runtime & tooling
| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | **22.x LTS** (`.nvmrc` = `22`; `engines.node` = `>=22.12 <23`) | Vercel project Node version 22.x |
| pnpm | **10.18.0** (`"packageManager": "pnpm@10.18.0"`) | Only package manager allowed |
| TypeScript | **5.9.3** | `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: false` |
| Supabase CLI | **2.54.11** (devDependency `supabase`) | Local stack, migrations, type generation, `supabase test db` |
| PostgreSQL | **17** (Supabase managed) | Extensions: `citext`, `pg_trgm`, `pg_cron`, `pg_net`, `pgcrypto` |

### 2.2 Application dependencies
| Package | Version | Purpose |
| --- | --- | --- |
| `next` | **16.0.1** | App Router, RSC, Server Actions, Turbopack (default) |
| `react`, `react-dom` | **19.2.0** | |
| `tailwindcss`, `@tailwindcss/postcss` | **4.1.16** | CSS-first config in `globals.css` (`@theme`); no `tailwind.config.js` |
| `@supabase/supabase-js` | **2.76.1** | Server-only DB client (no `@supabase/ssr`: no Supabase Auth) |
| `zod` | **4.1.12** | All input validation (shared client/server schemas) |
| `next-intl` | **4.4.0** | i18n without routing (cookie locale) |
| `next-themes` | **0.4.6** | Light/Dark/System |
| `@node-rs/argon2` | **2.0.2** | argon2id hashing for PINs and admin passwords |
| `resend` | **6.1.2** | Transactional email |
| `@react-email/components` | **0.5.7** | Email templates (`emails/*.tsx`) |
| `google-auth-library` | **10.4.0** | Service-account JWT for the Sheets REST API (no `googleapis` mega-package) |
| `katex` | **0.16.25** | Math rendering |
| `exceljs` | **4.4.0** | `.xlsx` import parsing + template generation |
| `papaparse` | **5.5.3** | `.csv` import parsing |
| `radix-ui` | **1.4.3** | Headless Dialog, DropdownMenu, Tabs, Checkbox, Popover, Tooltip, RadioGroup |
| `lucide-react` | **0.548.0** | Icons |
| `sonner` | **2.0.7** | Toasts |
| `@tanstack/react-table` | **8.21.3** | Admin tables (headless) |
| `@dnd-kit/core` / `@dnd-kit/sortable` | **6.3.1** / **10.0.0** | Exam question reordering |
| `clsx` / `tailwind-merge` / `class-variance-authority` | **2.1.1** / **3.3.1** / **0.7.1** | `cn()` and variant styling |
| `date-fns` / `@date-fns/tz` | **4.1.0** / **1.4.1** | Date math in `Asia/Dhaka` |
| `server-only` | **0.0.1** | Guards server modules from client import |
| `@vercel/analytics` | **1.5.0** | Page analytics (conversion metrics) |

### 2.3 Dev & test dependencies
| Package | Version |
| --- | --- |
| `vitest` | **3.2.4** |
| `@vitejs/plugin-react` | **5.0.4** |
| `@testing-library/react` / `@testing-library/user-event` / `@testing-library/jest-dom` | **16.3.0** / **14.6.1** / **6.9.1** |
| `jsdom` | **27.0.1** |
| `@playwright/test` | **1.56.1** |
| `@axe-core/playwright` | **4.11.0** |
| `eslint` / `eslint-config-next` | **9.38.0** / **16.0.1** |
| `prettier` / `prettier-plugin-tailwindcss` | **3.6.2** / **0.7.1** |
| `react-email` | **4.3.2** (email preview: `pnpm email:dev`) |
| `tsx` | **4.20.6** (scripts) |
| `@types/node` / `@types/react` / `@types/react-dom` / `@types/papaparse` | **22.18.12** / **19.2.2** / **19.2.2** / **5.3.16** |

### 2.4 Explicitly forbidden
Prisma, Drizzle or any ORM · `@supabase/ssr` / Supabase Auth · NextAuth/Auth.js · Redux/Zustand/Jotai (use React state + context; server state comes from RSC) · TanStack Query (not needed; the exam sync queue is custom) · component kits with their own theme (MUI, Chakra, Mantine, Ant) · CSS-in-JS · moment.js · axios (use `fetch`) · `xlsx` from npm (stale/vulnerable) · any client-side analytics other than Vercel Analytics · `middleware.ts` (Next 16 uses `proxy.ts`).

---

## 3. Folder Structure (canonical)

```
ByteSizeICT/
├── CLAUDE.md                     # agent operating rules (read first)
├── .cursorrules                  # same rules for Cursor
├── docs/                         # 01_PRD … 06_Plan (source of truth) + RUNBOOK.md (production setup & operations)
├── .env.example                  # every env var from §5, no values
├── .nvmrc  package.json  pnpm-lock.yaml  tsconfig.json  next.config.ts
├── postcss.config.mjs  eslint.config.mjs  .prettierrc  vitest.config.ts  playwright.config.ts
├── vercel.json                   # region sin1 (headers live in next.config.ts)
├── public/
│   ├── payment/{bkash,nagad,rocket,bank}.svg
│   └── templates/                # (generated at runtime instead; folder kept empty)
├── supabase/
│   ├── config.toml
│   ├── migrations/               # 0001_…sql ordered; never edit an applied migration
│   ├── seed.sql                  # local/dev seed (subjects, chapters, plans, sample questions/exam, settings)
│   ├── bootstrap.prod.sql        # production reference data only (subject/chapters/topics, plans, settings); see docs/RUNBOOK.md
│   └── tests/                    # pgTAP: rls.test.sql, attempts.test.sql, admissions.test.sql, …
├── emails/                       # React Email templates
│   ├── credentials.tsx  renewal-approved.tsx  admission-rejected.tsx  admin-new-admission.tsx
├── scripts/
│   ├── create-admin.ts           # pnpm admin:create --email --name (prompts for password)
│   └── gen-types.sh              # supabase gen types typescript --local > src/types/database.ts
├── messages/
│   ├── bn.json                   # default
│   └── en.json
├── src/
│   ├── proxy.ts                  # cookie-presence redirects for /dashboard…, /admin…
│   ├── app/
│   │   ├── layout.tsx            # fonts, ThemeProvider, NextIntlClientProvider, Toaster, Analytics
│   │   ├── globals.css           # Tailwind v4 + tokens (03_UI_Spec)
│   │   ├── not-found.tsx  error.tsx  global-error.tsx
│   │   ├── (public)/
│   │   │   ├── layout.tsx        # public header/footer, sticky enroll bar, WhatsApp FAB
│   │   │   ├── page.tsx          # homepage
│   │   │   ├── routine/page.tsx
│   │   │   ├── enroll/page.tsx   enroll/success/page.tsx
│   │   │   ├── sample/result/page.tsx
│   │   │   ├── faq/page.tsx      privacy/page.tsx
│   │   │   └── login/page.tsx
│   │   ├── (account)/change-pin/  # forced first-login PIN change (minimal layout, no app nav)
│   │   ├── (student)/
│   │   │   ├── layout.tsx        # requireStudent(); header + bottom nav
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── exams/page.tsx    exams/[examId]/page.tsx
│   │   │   ├── results/page.tsx  profile/page.tsx  renew/page.tsx
│   │   │   └── attempts/[attemptId]/result/page.tsx
│   │   ├── (exam)/               # chrome-free; client-only exam page (live + sample modes)
│   │   │   ├── attempts/[attemptId]/page.tsx
│   │   │   └── sample/page.tsx
│   │   ├── admin/
│   │   │   ├── login/page.tsx
│   │   │   └── (panel)/
│   │   │       ├── layout.tsx    # requireAdmin(); sidebar
│   │   │       ├── page.tsx      # overview
│   │   │       ├── admissions/  students/[studentId]/  questions/{new,[questionId],import}/
│   │   │       ├── taxonomy/  exams/{new,[examId]/{preview,results}}/  settings/  audit/
│   │   └── api/
│   │       ├── time/route.ts
│   │       ├── exams/[examId]/start/route.ts
│   │       ├── attempts/[attemptId]/route.ts               # GET resume payload
│   │       ├── attempts/[attemptId]/answers/route.ts       # PUT
│   │       ├── attempts/[attemptId]/submit/route.ts        # POST
│   │       ├── sample/score/route.ts                       # POST
│   │       ├── admin/exams/[examId]/results.csv/route.ts   # GET
│   │       ├── admin/questions/template/route.ts           # GET ?format=csv|xlsx
│   │       ├── internal/outbox/drain/route.ts              # POST (x-cron-secret)
│   │       └── internal/dev-mailbox/route.ts               # GET (x-cron-secret; 404 when email is configured or on production) — E2E only
│   ├── components/
│   │   ├── ui/                   # primitives (03_UI_Spec §7)
│   │   ├── layout/               # headers, bottom nav, sidebar, sticky bars
│   │   ├── content/rich-text.tsx # KaTeX + code renderer (single source)
│   │   ├── exam/                 # exam page client islands + useExamSession, sync queue
│   │   ├── review/               # result + review components
│   │   ├── student/              # dashboard exam cards, inline countdown
│   │   ├── admin/                # DataTable, page header/stat tiles, useAction, badges
│   │   ├── marketing/            # homepage sections
│   │   └── admin/                # admin-only widgets
│   ├── features/                 # server-side domain modules (all import 'server-only' except schemas.ts)
│   │   ├── auth/                 { actions.ts, service.ts, schemas.ts }
│   │   ├── admissions/           { actions.ts, queries.ts, service.ts, schemas.ts }
│   │   ├── students/             { actions.ts, queries.ts, service.ts, schemas.ts, credentials.ts }
│   │   ├── questions/            { actions.ts, queries.ts, service.ts, schemas.ts, import.ts }
│   │   ├── taxonomy/             { actions.ts, queries.ts, schemas.ts }
│   │   ├── exams/                { actions.ts, queries.ts, service.ts, schemas.ts, status.ts, student-queries.ts }
│   │   ├── attempts/             { service.ts, paper.ts, schemas.ts, route-helpers.ts }
│   │   ├── results/              { queries.ts, review.ts, admin.ts }   # admin.ts also builds the CSV
│   │   ├── public/               { queries.ts }            # anon-client reads for marketing pages
│   │   ├── dashboard/            { queries.ts }            # student dashboard + admin overview
│   │   ├── sample/               { service.ts }            # free sample paper + stateless scoring
│   │   ├── settings/             { actions.ts, queries.ts, schemas.ts }
│   │   └── audit/                { queries.ts, log.ts }
│   ├── lib/
│   │   ├── supabase/admin.ts     # service_role client (import 'server-only')
│   │   ├── supabase/anon.ts      # anon client for public reads (server-only too)
│   │   ├── auth/session.ts       # create/validate/revoke, cookie helpers
│   │   ├── auth/pin.ts           # generate, validate strength, hash/verify (argon2id + pepper)
│   │   ├── auth/password.ts      # admin password hash/verify
│   │   ├── auth/guards.ts        # requireStudent, requireActiveStudent, requireAdmin, getOptionalStudent
│   │   ├── auth/constants.ts / access.ts / next-path.ts  # isomorphic: cookie names & TTLs / access state / safe ?next=
│   │   ├── rate-limit.ts         # rate_limit_events helpers
│   │   ├── email/send.ts         # Resend wrapper
│   │   ├── sheets/client.ts      # Sheets REST (append, find row by mobile, update row)
│   │   ├── outbox/{enqueue.ts,drain.ts,handlers.ts}
│   │   ├── content/render.ts     # server-side rich text → sanitised HTML (KaTeX renderToString)
│   │   ├── i18n/{request.ts,config.ts}
│   │   ├── errors.ts             # isomorphic: ErrorCode, ActionResult envelope, ok()/fail()
│   │   ├── http.ts               # server-only: re-exports errors.ts + mapDbError, failFromZod, origin check, request IP
│   │   ├── actions.ts            # server-only: adminAction/studentAction/run, ServiceError, unwrap/unwrapMaybe/check, SQL_NULL
│   │   ├── validation.ts / time.ts  # isomorphic Zod building blocks / Asia-Dhaka helpers
│   │   ├── supabase/storage.ts   # signed URLs for question-media, public asset URLs
│   │   ├── time.ts               # Asia/Dhaka formatting, server offset helpers
│   │   ├── mobile.ts             # normalise + mask
│   │   ├── env.ts / env-public.ts / env-schema.ts  # server env (server-only) / client env / pure Zod schemas
│   │   └── utils.ts              # cn()
│   └── types/
│       ├── database.ts           # GENERATED — never hand-edit
│       └── domain.ts             # PaperQuestion, AttemptSession, ResultPayload, ErrorCode …
└── tests/
    ├── unit/                     # vitest: lib/*, scoring tables, schemas, sync queue
    ├── e2e/                      # playwright specs (Phase 4) + global-setup.ts (opt-in reset: E2E_RESET=1)
    ├── integration/              # vitest against the local Supabase stack
    └── helpers/                  # factories (service-role), e2e.ts (fixtures, session minting, mailbox, recorders)
```

**Import rules:** `src/components/**` must not import from `src/lib/supabase/**`, `src/features/**/service.ts|queries.ts|actions.ts` except through Server Actions passed as props or imported action functions. `src/features/*/schemas.ts` are isomorphic. Every file under `src/lib/supabase`, `src/lib/auth` (except types), `src/features/**` (except `schemas.ts`), `src/lib/email`, `src/lib/sheets`, `src/lib/outbox` starts with `import 'server-only'`.

---

## 4. Rendering & Data-Access Rules

1. **Server Components by default.** `'use client'` only for interactive islands (exam page, forms, dialogs, toggles, countdowns).
2. Public pages (`(public)`) read via `src/features/public/queries.ts` using the **anon** client and `export const revalidate = 60`. After any admin mutation affecting them, call `revalidatePath('/')` and `revalidatePath('/routine')` (and `/enroll`, `/faq` for settings/plans).
3. Student and admin pages are dynamic (they read cookies); they use the **service_role** client via feature queries that **always scope by the authenticated principal** (`student_id = session.studentId`).
4. **Mutations:** admin, auth, enrollment and settings use **Server Actions** returning the envelope `{ok, data|error}` (`src/lib/http.ts`). The exam runtime uses **Route Handlers** (needed for `keepalive` fetches and precise status codes).
5. Every Server Action and Route Handler: (a) authenticates through a guard, (b) parses input with Zod, (c) calls a service, (d) returns the envelope. No business logic in components or route files.
6. Every query selecting from `questions` for student-facing purposes goes through `src/features/attempts/paper.ts`, which selects **only** from the view `paper_questions` (no `correct_option`, no `explanation`). A CI grep check fails the build if `correct_option` or `explanation` appears in `src/features/attempts/paper.ts`, `src/app/api/attempts/**`, `src/app/api/exams/**` or `src/components/exam/**`.

---

## 5. Environment Variables (`.env.example`)

| Var | Scope | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | public | e.g., `https://bytesizeict.com` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Anon/publishable key (only reads public policies) |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Service role / secret key. **Never** prefixed `NEXT_PUBLIC_`. |
| `AUTH_PEPPER` | server | 32+ random bytes (base64). argon2id `secret` for PINs/passwords. Rotation invalidates all PINs, so never rotate casually. |
| `SESSION_TOKEN_BYTES` | server | Optional, default `32` |
| `RESEND_API_KEY` | server | |
| `EMAIL_FROM` | server | e.g., `ByteSizeICT <no-reply@mail.bytesizeict.com>` (verified domain) |
| `ADMIN_ALERT_EMAIL` | server | Receives "new admission" alerts (optional; empty = disabled) |
| `GOOGLE_SA_EMAIL` | server | Service account email |
| `GOOGLE_SA_PRIVATE_KEY` | server | PEM with `\n` escapes |
| `GOOGLE_SHEET_ID` | server | Spreadsheet id; empty = Sheets sync disabled (jobs marked `done` with `skipped`) |
| `CRON_SECRET` | server | Shared secret for `/api/internal/outbox/drain` (also stored in Supabase Vault for pg_net) |
| `APP_TIMEZONE` | server | Fixed `Asia/Dhaka` |

Startup validation: `src/lib/env.ts` parses `process.env` with Zod at import time; a missing required var crashes the boot with a clear message.

---

## 6. Authentication & Session Design

### 6.1 Credentials
- **Student PIN:** generated as a cryptographically random 6-digit string (`crypto.randomInt`) that is not in the weak list. Admin-set PINs are 4–6 digits. Hash: **argon2id** (`memoryCost 19456 KiB, timeCost 2, parallelism 1`, `secret = AUTH_PEPPER`). Stored in `students.pin_hash`. The plaintext PIN exists only in memory during approval/reset and inside the email sent at that moment.
- **Admin password:** min 12 chars, argon2id with the same params; created only by `scripts/create-admin.ts`.

### 6.2 Session tokens
- Token = 32 random bytes, base64url. Cookie value = token. DB stores `token_hash = sha256(token)` (bytea).
- Cookies: `bsi_session` (student) and `bsi_admin` (admin); `HttpOnly; Secure; SameSite=Lax; Path=/`. Student "remember me" → `Max-Age=30d` and `expires_at = now()+30d`; otherwise a session cookie and `expires_at = now()+12h`. Admin: session cookie, `expires_at = now()+12h`, sliding (extended on use when < 6 h remain).
- Validation (`getSession`) on every guarded request: hash the token → select the session joined with the student/admin → reject if revoked, expired or the principal is suspended → update `last_seen_at` at most once per 5 minutes.
- **Single-session policy:** on student login, after the new session is created, revoke the oldest active sessions beyond `auth.maxDevices` (setting, default 1) with reason `new_login`.
- Revocation triggers: logout, PIN change (others), admin cancel/suspend/reset/force-logout (all).

### 6.3 Login throttling (`rate_limit_events`)
| Bucket | Key | Limit | Effect |
| --- | --- | --- | --- |
| `login_fail_mobile` | normalised mobile | 5 failures / 15 min (cleared on success) | `LOCKED` until the oldest of those 5 + 15 min; message shows `attempts_left = 5 − failures` |
| `login_ip` | IP | 20 attempts / 10 min | `RATE_LIMITED` |
| `admin_login_fail` | email | 5 failures / 15 min | `LOCKED` |
| `admin_login_ip` | IP | 20 / 10 min | `RATE_LIMITED` |
| `enroll_ip` | IP | 5 submissions / 60 min | `RATE_LIMITED` |
| `sample_ip` | IP | 30 scorings / 60 min | `RATE_LIMITED` |

IP = first entry of `x-forwarded-for` (Vercel sets it). Unknown mobiles still record failures (no account enumeration; same response shape and timing; argon2 verify against a dummy hash for unknown mobiles).

### 6.4 CSRF & origin
Server Actions: built-in Origin check (keep `serverActions.allowedOrigins` empty = same origin). Route Handlers that mutate: require the `Origin` header to equal `NEXT_PUBLIC_SITE_URL` (or localhost in dev) **and** a `SameSite=Lax` cookie; JSON `Content-Type` only. `/api/internal/*` requires `x-cron-secret` (constant-time compare) and ignores cookies.

---

## 7. API Contracts

All runtime routes return 403 `FORBIDDEN` while the student `must_change_pin`. All bodies are JSON; all responses use the envelope `{ ok: true, data } | { ok: false, error: { code, message, field?, meta? } }` with HTTP status as listed. Types live in `src/types/domain.ts`.

### 7.1 Route Handlers (exam runtime & internal)
| Method & path | Auth | Request | Success `data` | Errors (HTTP) |
| --- | --- | --- | --- | --- |
| `GET /api/time` | none | — | `{ serverNow: ISO }` (`Cache-Control: no-store`) | — |
| `POST /api/exams/:examId/start` | student, active | — | `{ attemptId }` (200, idempotent) | `ACCESS_INACTIVE` 403, `EXAM_NOT_AVAILABLE` 404, `EXAM_NOT_STARTED` 409 |
| `GET /api/attempts/:attemptId` | student owner, active | — | `AttemptSession` | `NOT_FOUND` 404, `ATTEMPT_CLOSED` 409 (`meta.resultUrl`), `ACCESS_INACTIVE` 403 |
| `PUT /api/attempts/:attemptId/answers` | student owner, active | `{ changes: AnswerChange[1..200], lastQuestionIndex?: int }` | `{ applied: int, serverNow }` | `ATTEMPT_CLOSED` 409, `ACCESS_INACTIVE` 403, `VALIDATION` 422, `SESSION_REVOKED` 401 |
| `POST /api/attempts/:attemptId/submit` | student owner (access state **not** required, so a cancelled student's in-flight submission still counts) | `{ auto: boolean, changes: AnswerChange[0..500] }` | `{ resultUrl }` | `ATTEMPT_CLOSED` 409 (already final → `meta.resultUrl`; client treats it as success), `SESSION_REVOKED` 401 |
| `POST /api/sample/score` | none | `{ answers: Record<questionId, 'A'\|'B'\|'C'\|'D'\|null> }` | `SampleResultPayload` | `RATE_LIMITED` 429, `NOT_FOUND` 404 |
| `GET /api/admin/exams/:examId/results.csv` | admin | — | `text/csv; charset=utf-8` with BOM | 404 |
| `GET /api/admin/questions/template?format=csv\|xlsx` | admin | — | file | — |
| `POST /api/internal/outbox/drain` | `x-cron-secret` | `{ limit?: int ≤ 50 }` | `{ processed, failed }` | 401 |
| `GET /api/internal/dev-mailbox?to=` | `x-cron-secret`; exists only without `RESEND_API_KEY` and outside `VERCEL_ENV=production` | — | captured dev emails `{to, subject, text, at}[]` (E2E reads emailed PINs) | 401, 404 |

```ts
type OptionKey = 'A' | 'B' | 'C' | 'D';
type AnswerChange = { q: string /* question uuid */; o: OptionKey | null; m: boolean; s: number /* client seq, int ≥ 1 */ };
type PaperQuestion = {
  id: string; n: number;                     // n = 1-based display position
  stem: string; stemImageUrl: string | null;
  options: { key: OptionKey; text: string; imageUrl: string | null }[]; // already in display order
};
type AttemptSession = {
  attemptId: string; status: 'in_progress';
  exam: { id: string; title: string; durationMinutes: number; marksPerQuestion: number;
          negativeMark: number; allowMarkForReview: boolean; questionCount: number; totalMarks: number };
  deadlineAt: string; serverNow: string; lastQuestionIndex: number;
  questions: PaperQuestion[];
  answers: Record<string, { o: OptionKey | null; m: boolean; s: number }>;
};
```

### 7.2 Server Actions (by feature; each returns the envelope)
| Feature | Actions |
| --- | --- |
| auth | `studentLogin({mobile,pin,remember})`, `studentLogout()`, `changePinForced({newPin,confirm})`, `changePin({currentPin,newPin,confirm})`, `adminLogin({email,password})`, `adminLogout()` |
| admissions | `submitAdmission({mobile,email,method,trxId,planId?})` (public) · `approveAdmission({admissionId,planId?,amountBdt,startsAt,expiresAt,note?})` · `rejectAdmission({admissionId,reason,sendEmail})` |
| students | `extendStudents({studentIds[],days})` · `setStudentExpiry({studentId,expiresAt})` · `cancelStudent({studentId,reason})` · `suspendStudent({studentId,reason})` · `reactivateStudent({studentId})` · `resetStudentPin({studentId,mode:'auto'|'manual',pin?,sendEmail})` · `resendCredentials({studentId})` · `forceLogoutStudent({studentId})` · `updateStudent({studentId,email?,adminLabel?,adminNote?})` |
| taxonomy | `upsertSubject`, `upsertChapter`, `upsertTopic`, `upsertTag`, `deleteTopic` (only if unused), `deleteTag` |
| questions | `createQuestion(input, {force?})` · `updateQuestion(id,input,{force?})` · `duplicateQuestion(id)` · `setQuestionStatus(ids[],status)` · `bulkTag(ids[],tagIds[],op:'add'|'remove')` · `createMediaUploadUrl({kind,ext})` (signed upload to `question-media`) · `previewImport(formData)` · `commitImport({importToken,defaultStatus})` |
| exams | `createExam(input)` · `updateExamSettings(id,input)` · `setExamQuestions(id,questionIds[])` (ordered) · `setExamAudience(id,{audience,studentIds[]})` · `publishExam(id)` · `unpublishExam(id)` · `archiveExam(id)` · `setFeaturedExam(id\|null)` |
| settings | `updateSetting(key,value)` · `upsertPlan` · `deletePlan` (soft: `is_active=false`) · `upsertPaymentAccount` · `retryFailedOutbox()` |

### 7.3 Key query payloads
- `getAttemptResult(attemptId, studentId)` → `ResultPayload { exam{title,subject,chapter,totalMarks,…}, attempt{score,correct,incorrect,skipped,accuracy,isLate,submittedAt}, rank: {visible:true, position, participants, highest} | {visible:false, publishAt}, answersVisible: boolean, answersPublishAt, statsVisible, questions: ReviewQuestion[] }`. `ReviewQuestion` includes `correctOption`, `explanation`, `stats` **only when** the respective gates are true; otherwise those fields are `null` (they are not computed at all).
- `getStudentExamCards(studentId)` → list with the status from `02_AppFlow.md` §3.5 computed in SQL (`student_exam_cards` function).

---

## 8. Exam Runtime Technical Design

1. **Start:** `rpc('start_attempt', {p_exam_id, p_student_id})` → validates eligibility (published, not sample, assigned, phase in (`live`, `late_window`), access active), creates or returns the attempt with `question_order` (shuffled if enabled, Fisher-Yates in SQL via `ORDER BY random()`) and `option_order` (`{"<qid>":"CABD"}`), `deadline_at`, `is_late`. A unique `(exam_id, student_id)` makes concurrent starts safe (`ON CONFLICT DO NOTHING` + re-select).
2. **Paper build** (`paper.ts`): read `paper_questions` for the attempt's question ids, order by `question_order`, permute options by `option_order`, sign image URLs (`createSignedUrls`, TTL = seconds until `deadline_at` + 600). No caching: the paper is computed per request (100 questions ≈ 1 query + 1 signing batch).
3. **Save:** `rpc('save_answers', {p_attempt_id, p_student_id, p_changes, p_last_index})` → locks the attempt row `FOR UPDATE`, checks owner, `status='in_progress'`, `now() ≤ deadline_at + interval '15 seconds'`, and that each `q` belongs to the attempt; upserts each change `WHERE excluded.client_seq > attempt_answers.client_seq`. Returns the applied count.
4. **Submit:** `rpc('submit_attempt', {p_attempt_id, p_student_id, p_changes, p_auto})` → applies changes (same grace rule; changes after the grace are ignored, not rejected), scores, sets status, updates question counters, enqueues the `sheet_result_append` outbox job. Idempotent: if already final → raises `ATTEMPT_CLOSED` with the result URL.
5. **Scoring** (SQL, per answer): correct → `+marks_per_question`; wrong → `−negative_mark`; null → 0. `score = Σ`, rounded to 2 decimals. The score **can be negative** and is displayed as is (e.g. `−1.5`); it is never clamped to 0.
6. **Overdue finalization:** `finalize_overdue_attempts()` runs every minute (pg_cron) and finalizes `in_progress` attempts with `deadline_at + 15 s < now()` as `auto_submitted`. `finalize_attempt_if_overdue(attempt_id)` is also called on any read of an attempt or result.
7. **Client timer:** `remainingMs = deadlineAt − (Date.now() + offset)`; ticks every 250 ms via `setInterval` + `visibilitychange` re-sync; never trusts a client-modified deadline (the server enforces it).
8. **Local store:** key `bsi:attempt:<attemptId>`, JSON `{v:1, seq, answers, scrollQ, updatedAt}`; written synchronously on every change; removed after a successful submit; stale keys (> 7 days) are purged on app load.
9. **Sync queue:** single in-flight request; coalesces by question (latest seq wins); 600 ms debounce; exponential backoff 1→30 s; `online` event triggers an immediate flush; `visibilitychange: hidden` → flush with `keepalive: true` (body ≤ 60 KB).
10. **Performance:** render cards in chunks: first 15 immediately, the rest via `requestIdleCallback` batches of 20 (fallback `setTimeout`); cards use `content-visibility: auto; contain-intrinsic-size: 0 320px`. Images `loading="lazy"`. KaTeX CSS loaded only on question routes; math is pre-rendered **server-side** to HTML strings in `paper.ts` (`katex.renderToString`) so the client bundle does not include KaTeX JS on the exam page. The same applies to the review page.

---

## 9. Third-Party Integrations

### 9.1 Resend (email)
- Verified sending domain (SPF, DKIM, DMARC set up by the owner). From = `EMAIL_FROM`.
- Templates (bilingual body: Bangla first, then English): `credentials` (link, mobile, PIN, start/expiry, 3-step guide), `renewal-approved` (new expiry), `admission-rejected` (reason, WhatsApp link), `admin-new-admission` (mobile, method, TrxID, link to the queue).
- `credentials` emails are sent (awaited) right after `approve_admission` / PIN reset commits, so the action can return `emailSent` for the admin toast. On success → `students.credentials_status='sent'`, `credentials_sent_at=now()`; on failure → `'failed'` + audit row `student.credentials_email_failed`. **Never enqueued in the outbox.**
- Other emails go through the outbox (`email_renewal`, `email_rejection`, `email_admin_alert`). Payloads hold recipient + template data only.

### 9.2 Google Sheets API v4
- Auth: `google-auth-library` `JWT` with scope `https://www.googleapis.com/auth/spreadsheets`; the sheet is shared with `GOOGLE_SA_EMAIL` as Editor.
- Tabs (exact names, header row 1, created by the owner from the template in `docs/` §8 of the concept): `Admissions`, `Active Students`, `Exam Results`.
- `Admissions`: append one row per admission on submit (status Pending), update that row (found by TrxID in column D) on approve/reject.
- `Active Students`: upsert by Mobile (column A): find the row via `values.get('Active Students'!A:A)`; update in place or append. Columns per the concept §8.
- `Exam Results`: append `[submitted_at (Dhaka), mobile, exam title, score, total, correct, incorrect, skipped, late]`.
- Outbox handlers for sheets run **sequentially** (one sheet job at a time, ordered by `id`) to avoid upsert races. Quota-safe: ≤ 1 request/sec.

### 9.3 Supabase Storage
- `question-media`: **private**; path `questions/<uuid>.<ext>`; admins upload via signed upload URLs (≤ 1 MB, `image/png|jpeg|webp`); students receive signed read URLs only inside an active paper or a review payload.
- `public-assets`: **public**; logo, testimonial photos; ≤ 512 KB.

### 9.4 Vercel
- Project region `sin1` (`vercel.json`). Security headers are defined **only** in `next.config.ts` `headers()`.
- Vercel Analytics enabled on public pages. Custom events: `enroll_submit`, `sample_complete`, `sample_enroll_click`.
- No Vercel Cron in R1 (pg_cron covers scheduling).

---

## 10. Security Constraints (MUST / MUST NOT)

1. MUST hash PINs and passwords with argon2id + pepper; MUST NOT log, persist, or return a plaintext PIN except (a) inside the credentials email and (b) once in the admin PIN-reset dialog response when the PIN was admin-chosen or no email is sent.
2. MUST NOT send `correct_option`, `explanation` or option stats to any client before the attempt is final **and** the relevant publish gate has passed. The paper view excludes them by construction (§4.6).
3. MUST enforce time on the server (`deadline_at` + 15 s grace); the client timer is cosmetic.
4. MUST scope every student query by `session.studentId`; admin data access requires `requireAdmin()`.
5. MUST keep `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PEPPER`, `RESEND_API_KEY`, `GOOGLE_SA_PRIVATE_KEY`, `CRON_SECRET` server-only. A CI check greps the `.next/static` output for their values/prefixes.
6. MUST enable RLS on every table (`05_Schema.md` §7); new tables without RLS fail the pgTAP test `rls_enabled_on_all_tables`.
7. MUST validate all input with Zod at the boundary (max lengths everywhere: stem ≤ 4,000, option ≤ 1,000, explanation ≤ 8,000, note ≤ 2,000).
8. MUST render user/admin text only through React escaping or the KaTeX renderer with `trust:false`; MUST NOT use `dangerouslySetInnerHTML` except for KaTeX output produced server-side from sanitised input.
9. MUST set headers: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, and CSP: `default-src 'self'; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`.
10. MUST write an audit row for every admin mutation listed in PRD A-16 in the **same transaction** (inside the SQL function or via `log_audit()` in the same RPC).
11. MUST mask mobile numbers in student-facing contexts other than the student's own profile.
12. Backups: Supabase Pro daily backups + PITR (7 days) enabled before launch; a monthly manual `pg_dump` is documented in the runbook.
13. Dependencies: `pnpm audit --prod` has no high/critical findings at release; Renovate/Dependabot is not set up in R1 (manual monthly review).
14. Privacy: `/privacy` lists the data collected (mobile, email, payment TrxID, exam results), its purpose, retention (attempt data kept for the account's lifetime + 1 year), and contact for deletion requests.

---

## 11. Non-Functional Requirements
| Area | Requirement |
| --- | --- |
| Performance | See PRD §5. Server p95 for RSC pages < 600 ms; exam paper load (100 Q) < 800 ms server time. |
| Scalability | 1,000 concurrent exam takers saving every ~10 s ≈ 100 req/s peak on `save_answers`; covered by Supabase Pro (pooler, transaction mode, port 6543) + Vercel functions. |
| Availability | Dependent on Vercel + Supabase SLAs; the exam page tolerates up to the full exam duration of backend outage (local-first) as long as the student reconnects before `deadline_at + 15 s`. |
| Browser support | Last 2 versions of Chrome Android, Samsung Internet, Safari iOS 16+, desktop Chrome/Edge/Firefox/Safari. No IE. |
| Observability | Structured `console.log(JSON)` with `requestId`, `route`, `principal`, `durationMs`, `errorCode`; Vercel log drains optional. Errors in Server Actions are caught and mapped to `INTERNAL` with a request id shown to the user. |
| i18n | 100% of UI strings in `messages/{bn,en}.json`; a CI script fails on missing keys in either file. |

## 12. Scripts (`package.json`)
`dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `format`, `test` (vitest), `test:e2e` (playwright), `db:start` (`supabase start`), `db:reset` (`supabase db reset`), `db:test` (`supabase test db`), `db:types` (`scripts/gen-types.sh`), `admin:create`, `email:dev`, `check:secrets` (grep `.next/static`), `check:i18n`, `check:answer-leak` (grep rule §4.6), `ci` (= lint + typecheck + test + db:test + check:i18n + check:answer-leak + test:e2e + check:secrets; run it as **`pnpm run ci`** because `pnpm ci` is a reserved pnpm command). Scripts that import app modules run with `tsx --conditions=react-server` (for `server-only`).
