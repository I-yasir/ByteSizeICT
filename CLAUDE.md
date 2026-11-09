# CLAUDE.md — Agent Operating Rules for ByteSizeICT

ByteSizeICT is a mobile-first, Bangla-first ICT MCQ exam platform: public marketing site + manual-payment enrollment, a single-scrolling-page exam with local-first autosave and server-side scoring, and an admin panel (admissions, students, question bank, exam builder, results). Stack: **Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase Postgres (RLS) · custom session auth · Resend · Google Sheets mirror**.

## 0. Mandatory pre-flight (EVERY task, no exceptions)

Before you write, edit or delete any file, or run any mutating command, **read all seven context documents in full**, in this order:

1. `docs/01_PRD.md`: scope, user stories, **Non-Goals** (never build these)
2. `docs/02_AppFlow.md`: routes, guards, state machines, screen behaviour, error codes
3. `docs/03_UI_Spec.md`: design tokens and component states (no hard-coded values)
4. `docs/04_TRD.md`: locked stack and versions, folder structure, API contracts, security constraints
5. `docs/05_Schema.md`: DDL, RLS, SQL functions, auth flow
6. `docs/06_Plan.md`: the V1 (R1) checklist and its Decision Log: history, read for context
7. `docs/07_Plan_V2.md`: **the active checklist (R1.1 / V2)**; find the **Current Step**, the owner decisions (§2) and the free-tier constraints (§3)

Then state in one line which plan step you are executing (e.g. "Executing V2.10 — Question deletion migration"). If the user's request does not map to a plan step, say so and ask whether to add a step (via the Decision Log) before proceeding.

The original concept file `docs/ICT MCQ Exam Platform Complete Concept and Specification.md` is background only. Where it differs from docs 01–07, **docs 01–07 win**.

## 1. Plan discipline

- Execute steps **in order**. Do not start a step whose dependencies are not `[x]`.
- One step at a time. Keep diffs scoped to the current step. No drive-by refactors.
- **After completing every step, update the active plan (`docs/07_Plan_V2.md`) immediately**, in the same turn and before you report back:
  1. Tick the step `[x]` (or `[!]` blocked with a reason / `[~]` in progress if you must stop mid-step).
  2. Fill `Done:` with `YYYY-MM-DD — <one-line summary; key files; verification result>`.
  3. Advance **Current Step** to the next unchecked step.
  4. Update the **Progress** table counts.
  5. Add a **Decision Log** row for any deviation from docs 01–05.
- Never tick a step unless its **Verify** check actually passed. Paste or summarise the evidence (command + result) in `Done:`.
- At each phase gate (V1: P1.30, P2.26, P3.30, P4.24; V2: V2.09, V2.13, V2.18, V2.23, V2.29, V2.36), run `pnpm run ci` and stop for user review.

## 2. Conflict & ambiguity protocol

- Precedence for technical questions: `05_Schema` > `04_TRD` > `02_AppFlow` > `03_UI_Spec` > `01_PRD`. For product scope questions, `01_PRD` wins.
- If docs conflict, or something is unspecified **and** the choice is hard to reverse (schema, auth, public API, dependencies), **stop and ask**. For small, reversible details, choose the option most consistent with the docs, then log it in the Decision Log.
- To change a locked decision: propose it, wait for approval, update the affected doc(s) **first**, log it, then implement.

## 3. Hard rules (violations are bugs)

**Scope**
- Do not build anything in PRD §6 Non-Goals (leaderboard page, reminders, announcements, doubts, PDF downloads of results/papers, auto-generated exams, groups other than plans, payment gateway, PWA, retakes, a name field, SMS, social login…). Do not create R2-reserved tables.
- **Free tiers only (R1.1, TRD §13):** nothing may require a paid plan of Vercel (Hobby), Supabase, Resend or Google Cloud. No file uploads through the app server (signed Storage URLs), no long-running server work, no Vercel Cron/Blob/KV, no Supabase image transformations, no new email volume without checking the Resend free limit.

**Stack**
- Use only the packages and **exact versions** in TRD §2 (`pnpm add -E`). No `^`/`~`. Never add a dependency without a Decision Log entry. TRD §2.4 lists forbidden libraries (no ORM, no Supabase Auth/`@supabase/ssr`, no NextAuth, no state libraries, no TanStack Query, no `middleware.ts`; use `src/proxy.ts`).
- pnpm only. Node 22.

**Security (TRD §10)**
- The browser never talks to Supabase directly. `SUPABASE_SERVICE_ROLE_KEY` is used only in `server-only` modules.
- **Never** send `correct_option`, `explanation` or option stats to the client before the attempt is final **and** the publish gate has passed. Student-facing question reads go only through `src/features/attempts/paper.ts` → view `paper_questions`.
- Time and scoring are enforced in SQL functions (`deadline_at` + 15 s grace). Client timers are cosmetic.
- PINs and passwords: argon2id + `AUTH_PEPPER`. Never log, store or return a plaintext PIN (the only exceptions are the credentials email and the one-time manual-PIN dialog). Never put secrets in the outbox.
- Every student query is scoped by `session.studentId`; every admin entry point calls `requireAdmin()`.
- Every new table: RLS enabled + forced, no anon access unless Schema §7 says so, plus a pgTAP test.
- Validate every input with Zod at the boundary. No `dangerouslySetInnerHTML` except server-rendered KaTeX/rich-text output from `src/lib/content/render.ts`.
- Admin mutations write audit rows in the same transaction.

**Database**
- Schema changes go in a **new** numbered migration in `supabase/migrations/`. Never edit a migration once it has been applied to any shared environment (staging/production). Afterwards run `pnpm db:reset && pnpm db:types && pnpm db:test`.
- Multi-row or transactional logic goes in SQL functions (`security definer`, `set search_path = public, pg_temp`, EXECUTE granted only to `service_role`) that raise canonical error codes.
- `src/types/database.ts` is generated. Never hand-edit it.

**Code conventions**
- Follow the TRD §3 folder structure exactly. Business logic lives in `src/features/<domain>/service.ts|queries.ts|actions.ts`, never in components or route files.
- Server Components by default; `'use client'` only for interactive islands.
- Server Actions and Route Handlers return the envelope `{ ok: true, data } | { ok: false, error: { code, message, field?, meta? } }` using the canonical `ErrorCode`s (AppFlow §7.1).
- Use exact route paths, state names, enum values and error codes from the docs. Do not invent synonyms.
- Styling: Tailwind utilities backed by tokens from `03_UI_Spec.md`. No hex literals, no arbitrary values (`p-[13px]`), no inline styles except dynamic widths (e.g., progress bars).
- All user-visible strings go through the message catalogs (`messages/bn.json` + `messages/en.json`, both updated together): `next-intl/server` on the server, `src/lib/i18n/client.tsx` in client components (only `{name}` placeholders and `plural`; `check:i18n` enforces it). Bangla is the default. Use Latin digits; display times in `Asia/Dhaka`.
- Mobile-first (design at 360 px); touch targets ≥ 48 px; one primary action per screen; dark mode via tokens only.
- TypeScript strict; no `any` (use `unknown` + narrowing); no non-null assertions on external data.
- Match the surrounding code's style, naming and comment density. Comments explain *why*, not *what*.

**Testing**
- Every service, action and route has tests (unit or integration against the local Supabase). SQL functions have pgTAP tests. Phase 4 adds the Playwright edge-case suite.
- Before declaring a step done: `pnpm lint && pnpm typecheck && pnpm test` (plus `pnpm db:test` if SQL changed, plus `pnpm check:answer-leak` if exam/paper code changed).

## 4. Commands

```bash
nvm use                   # Node 22 (the system node may be older)
pnpm dev                  # Next.js dev server (Turbopack)
pnpm db:start             # local Supabase stack
pnpm db:reset             # re-apply migrations + seed
pnpm db:types             # regenerate src/types/database.ts
pnpm db:test              # pgTAP
pnpm test                 # vitest
pnpm test:e2e             # playwright
pnpm lint && pnpm typecheck
pnpm run ci               # full gate (`pnpm ci` is reserved by pnpm)
pnpm admin:create --email you@example.com --name "Admin"
```

## 5. Reporting

When you finish a turn, report: the step ID(s) worked on, what changed (files), the verification evidence, the updated Current Step, and any Decision Log entries or open questions. Report failures honestly, with the failing output.

Commits (only when the user asks): one commit per completed plan step, message `P<id>: <summary>` (V1) or `V2.<nn>: <summary>` (V2), unless the user specifies another message.
