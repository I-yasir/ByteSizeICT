# 01 — Product Requirements Document (PRD)

| Field | Value |
| --- | --- |
| Product | **ByteSizeICT**: ICT MCQ exam platform (working name; brand is set in Admin → Settings) |
| Source concept | `docs/ICT MCQ Exam Platform Complete Concept and Specification.md` (v2.0) |
| Document status | **Locked for R1 (MVP)**. Changes go through the Decision Log in `06_Plan.md`. |
| Last updated | 2026-11-07 |

> **Release naming.** To avoid clashing with the *implementation* phases in `06_Plan.md` (Phase 1 to 4), product releases are named **R1 (MVP)**, **R2 (Engagement)** and **R3 (Growth)**. This document specifies R1 in full. R2 and R3 items are listed only so that nobody builds them early.

---

## 1. Problem Statement

Bangladeshi HSC students preparing for the ICT MCQ paper need **frequent, timed, chapter-wise practice exams with instant feedback**. Today a solo ICT coach usually runs these exams through WhatsApp groups, Google Forms and spreadsheets. That setup has four problems:

1. **For students:** Google Forms is not built for exams. There is no reliable timer, answers are lost when the connection drops, nobody sees a rank or per-question explanation, and Bangla, math and ICT symbols render badly.
2. **For the coach:** payment verification, account creation, credential delivery, subscription expiry, the question bank and results all sit in separate tools. Every new student takes 10+ minutes of manual work, and the question bank (the coach's main asset) is easy to leak.
3. **For growth:** there is no public page that shows the exam routine, proves results, and turns a visitor into a paying student.

**ByteSizeICT** is one mobile-first, Bangla-first website that (a) turns visitors into students, (b) gives students a calm, fast exam experience that never loses work, and (c) gives the coach one admin panel for admissions, students, questions, exams and results.

## 2. Target Personas

### P1 — "Rafi", the HSC student (primary user)
- 16–18 years old, HSC candidate (Science/Business/Humanities), anywhere in Bangladesh.
- **Device:** mid- or low-end Android phone (2–4 GB RAM, Chrome), often on **slow or intermittent 3G/4G mobile data**. Uses a desktop only sometimes.
- **Language:** reads Bangla most comfortably. Technical ICT terms appear in English.
- **Habits:** studies at night (wants dark mode) and takes exams in one sitting of 20–60 minutes.
- **Goals:** practise daily, see their score and rank right away, learn from explanations, and track weak chapters.
- **Frustrations:** losing answers when the network drops, confusing interfaces, being unsure whether an answer saved.

### P2 — "Sir/Madam", the Admin (coach/teacher)
- Runs an ICT coaching business alone or with one assistant. Manages **50 to 1,000 active students**.
- Uses a laptop for content work (question bank, exam builder) and a **phone** for quick tasks (approving admissions, checking results).
- **Goals:** approve a paid student in under 30 seconds, build an exam in under 5 minutes, protect the question bank, and see who is active or expired.
- **Frustrations:** repetitive manual onboarding, chasing expired students, leaked questions.

### P3 — "Visitor" (prospective student or guardian)
- Arrives from Facebook, a YouTube link or word of mouth, usually on a phone.
- **Goal:** decide quickly whether the platform is worth paying for. Needs the routine, proof of results, the price, and a free sample.

## 3. Product Principles (non-negotiable)

1. **Fewest possible taps.** Every screen has exactly one primary action.
2. **Never lose a student's answer.** Every selection is persisted locally first and synced to the server second.
3. **The server is the authority** for time, scoring and access. The browser never receives correct answers before submission.
4. **Bangla-first and mobile-first.** Layouts are designed at 360 px width first. English is a toggle.
5. **Friendly language.** Messages never use technical jargon. Every empty or error state tells the user what to do next.
6. **The database is the single source of truth.** Google Sheets is only a mirror.

## 4. R1 (MVP) Scope — User Stories

Acceptance criteria (AC) are binding. IDs are referenced from `02_AppFlow.md` and `06_Plan.md`.

### 4.1 Visitor (public site)

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| V-01 | As a visitor, I want a persuasive homepage so that I understand the value in 5 seconds. | Hero with headline, one-line value, **Enroll Now** and **Try a Free Sample Exam** buttons. Above the fold at 360×640. LCP < 2.5 s on simulated Fast 3G. |
| V-02 | As a visitor, I want to see the next exam and a countdown so that I know the platform is active. | Strip shows the next published, non-sample exam (featured exam first, otherwise the earliest upcoming one), its chapter, date/time (Asia/Dhaka), and a live countdown. If there is no upcoming exam, the strip is hidden. |
| V-03 | As a visitor, I want to see the exam routine so that I can plan. | `/routine` and the homepage section list upcoming exams grouped by date: title, chapter, date, time, duration, total marks. |
| V-04 | As a visitor, I want to see why to join, results, how it works, pricing and FAQ. | Static sections driven by Admin Settings (testimonials, top performers, plans, FAQ). Plan cards link to `/enroll?plan=<code>`. |
| V-05 | As a visitor, I want to try a free sample exam without logging in. | `/sample` runs the single published sample exam (5–10 questions) with the same exam UI. It is scored on the server and shows a result with explanations and an **Enroll Now** CTA. Nothing is stored per visitor. |
| V-06 | As a visitor, I want to enroll by paying manually and submitting a short form. | `/enroll` shows active payment accounts (bKash/Nagad/Rocket/Bank) with copy buttons and the amount. The form has exactly **4 required fields** (Mobile, Email, Payment Method, TrxID) and an optional plan. There is **no name field**. |
| V-07 | As a visitor, I want clear validation and confirmation. | Mobile must match `^01[3-9]\d{8}$` after normalisation. A duplicate TrxID is rejected with a friendly message. On success the visitor is sent to `/enroll/success`: "Request received! We'll verify your payment and send your login details to your email shortly." |
| V-08 | As a visitor on a phone, I want quick help. | A sticky **Enroll Now** bar on mobile for public pages (except `/enroll` and `/sample`) and a floating WhatsApp/Messenger button (links from Settings). |

### 4.2 Student

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| S-01 | As a student, I want to log in with my mobile number and PIN. | Minimal form with a PIN show/hide toggle. A wrong PIN shows "Wrong PIN. N attempts left". After **5 consecutive failures** the account is locked for **15 minutes**. "Remember me" keeps the session for 30 days, otherwise it lasts for the browser session (12 h max). |
| S-02 | As a new student, I must change my PIN at first login. | If `must_change_pin` is true, every student route redirects to `/change-pin` until a new 4–6 digit PIN is set. The new PIN cannot equal the old one. |
| S-03 | As a student, I want only one active session so that my account can't be shared easily. | A new login revokes all other sessions of that student (configurable `auth.maxDevices`, default 1). A revoked device sees "You were logged out because your account was used on another device." |
| S-04 | As a student, I want a dashboard that shows what to do now. | "Welcome back" greeting, subscription status ("Active · 42 days left"), **Today's / Live exam** card with a big **Start Exam** button, Upcoming list, Missed list (with **Take Now** when allowed), quick stats (exams taken, average %, best %, current streak), and the 5 most recent results. |
| S-05 | As a student, I want to see all my exams with clear status. | `/exams` lists exams assigned to me, each tagged **Upcoming / Live Now / Completed / Missed / Locked**. A Missed exam that is still available shows **Take Now**. |
| S-06 | As a student, I want to take an exam on one scrolling page. | All questions on one page. Sticky top bar with title, countdown and "Answered X/N" plus a progress bar. Timer turns amber at ≤ 5:00 and red at ≤ 1:00. Four full-width options per question (A–D). Tap to select, tap again to deselect. |
| S-07 | As a student, I never want to lose answers. | Every change is written to local storage immediately and synced to the server within 1 s when online. After a refresh, crash or offline period, the page restores answers, scroll position and the correct remaining time. An offline banner shows while unsynced changes exist. |
| S-08 | As a student, I want to navigate and review quickly. | A floating navigator opens a bottom sheet grid (answered / unanswered / marked / current). Tapping a number scrolls to that question. A scroll-to-top button appears after 600 px of scroll. A Mark-for-review star shows only when the exam allows it. |
| S-09 | As a student, I want to submit safely. | The submit dialog shows answered, unanswered and marked counts, with a "Review unanswered" shortcut that scrolls to the first unanswered question. When time ends the exam **auto-submits**, using whatever was saved locally and on the server. |
| S-10 | As a student, I want my result instantly. | After submitting, the result page shows Marks Obtained (big and colour-coded), Correct / Incorrect / Skipped / Accuracy cards, and **Your Position** and **Highest Marks** (or "Will be published after <time>" if hidden). |
| S-11 | As a student, I want to review each question. | Filters (checkboxes) for Correct / Incorrect / Skipped. Each card shows a status tag, the correct option with a green tick, my wrong choice in red, an option-wise percentage bar (if enabled by the Admin and published), and a Solution box. Review content is gated by `answers_publish_at`. |
| S-12 | As a student, I want to see all past results. | `/results` lists submitted attempts with score, date and a link to the review. |
| S-13 | As an expired or cancelled student, I want to know how to renew. | Login still works. Exam routes are locked and show "Your access expired on <date>. Renew to continue." with the renewal steps (same payment flow, `kind = renewal`). Past results stay visible if `results.visibleWhenInactive` is true (default true). |
| S-14 | As a student, I want dark mode and a Bangla/English toggle. | Theme toggle (system / light / dark) and language toggle in the header/profile. Both persist across sessions. |
| S-15 | As a student, I want to change my PIN later. | `/profile` → Change PIN (current PIN + new PIN twice). Changing the PIN revokes all other sessions. |

### 4.3 Admin

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| A-01 | As the admin, I want a secure separate login. | `/admin/login` with email and password (argon2id hashed), lockout after 5 failures for 15 min. Admin accounts are created only by the CLI script `pnpm admin:create`. |
| A-02 | As the admin, I want an overview. | Total / active / expired / cancelled students, pending admissions count, revenue this month (sum of approved admissions' `amount_bdt`), exams this week, and the last 10 audit events. |
| A-03 | As the admin, I want to process admissions quickly. | Queue filtered by status (default Pending), method and date, with search by mobile/email/TrxID. Each row shows TrxID, method, amount, plan, mobile, email, submitted time and **duplicate flags** (mobile exists / email exists / other pending request). **Approve** opens a dialog prefilled with plan dates (editable start/expiry). **Reject** requires a reason. |
| A-04 | As the admin, approving should do everything automatically. | Approve (new) creates the student, generates a 6-digit PIN, stores only its hash, sets validity, writes an audit row, emails credentials, and queues a Google Sheet upsert. Approve (renewal) extends the existing account (`new_expiry = max(now, current_expiry) + plan duration`, editable), reactivates a cancelled account, and emails a confirmation without a new PIN. |
| A-05 | As the admin, I want to manage students. | List with search (mobile/email), filters (active / expired / cancelled / suspended, label) and pagination. Profile shows details, private label and note, plan, dates, payment history (admissions), exam history and scores. **Actions:** extend validity by N days, set a custom expiry, cancel (instantly revokes sessions), suspend/reactivate, reset PIN (and email it), resend credentials (generates a new PIN), force logout, edit email/label/note. **Bulk:** extend selected students by N days. Every action is audited. |
| A-06 | As the admin, I want a structured question bank. | Hierarchy Subject → Chapter → Topic → Question. Each question has stem (Bangla/English, LaTeX via `$…$`), optional image, 4 options each with optional image, correct option, explanation (optional image), difficulty, type, source/board year, tags, status (draft / active / archived), and usage stats (times used, % correct). |
| A-07 | As the admin, I want to add questions fast. | Single-question form with a live preview identical to the student rendering. Duplicate detection warns when normalised content matches an existing question (`content_hash`). Duplicate, edit, archive and bulk-tag are available. |
| A-08 | As the admin, I want bulk import. | Upload `.csv` or `.xlsx` (template downloadable, max 2,000 rows, max 5 MB). The system validates every row and shows a preview with a per-row error report. The admin imports the valid rows. Duplicates are skipped by default. |
| A-09 | As the admin, I want to find questions. | Multi-filter search: chapter, topic, difficulty, type, tag, status, "unused only", and text search. Sort by newest, most used, or lowest % correct. |
| A-10 | As the admin, I want to build an exam. | Set title, description, subject, start time, duration, marks per question, negative mark, access mode (Fixed / Open window / Always available), late-until (window mode), shuffle questions/options, mark-for-review on/off, results publish time, answers publish time, option-stats on/off, rank late attempts on/off, audience (all active students / selected students), featured toggle. Select questions **manually** with the bank filters, then reorder. |
| A-11 | As the admin, I want to preview and publish safely. | "Preview as student" renders the exam page in read-only mode. Publishing validates the exam (≥ 1 question, all questions active, valid times). Once any attempt exists, the question set, marks and negative marking are **locked**. |
| A-12 | As the admin, I want exam results. | Per exam: participants, average, highest, lowest, a ranked table (mobile, score, correct/incorrect/skipped, late flag, submitted time), question-level % correct, and CSV export. |
| A-13 | As the admin, I want routine control. | Published exams automatically appear on the homepage routine and on student dashboards. One exam can be **featured** (shown in the homepage strip). |
| A-14 | As the admin, I want to configure the site. | Settings: brand name and logo, contact links (WhatsApp, Messenger, phone, email), payment accounts, pricing plans, FAQ items, testimonials and top performers, auth policy (max devices), and result visibility for inactive students. |
| A-15 | As the admin, I want a Google Sheet mirror. | Approved and rejected admissions append or update **Admissions**; student create/extend/cancel upserts **Active Students** (one row per mobile); every submitted attempt appends to **Exam Results**. Sheet failures never block the admin; they retry automatically and show in Settings → Integrations. |
| A-16 | As the admin, I want an audit log. | Every extension, expiry change, cancellation, suspension, PIN reset, credentials resend, force logout, approval and rejection writes an immutable audit row. `/admin/audit` lists them with filters. |

## 5. Success Metrics

Measured from DB queries and Vercel Analytics. "Week" means a rolling 7 days.

| Area | Metric | R1 target |
| --- | --- | --- |
| Conversion | Visitor → enrollment-submit rate (unique visitors to `/` vs. admissions created) | ≥ 3% |
| Conversion | Sample exam completion → `/enroll` click-through | ≥ 15% |
| Operations | Median time from admission submit to approval | < 12 h |
| Operations | Admin time to approve one admission (click to done) | < 30 s |
| Operations | Credentials email delivery success | ≥ 99% |
| Engagement | Active students who attempt each live exam | ≥ 70% |
| Reliability | Answer-loss incidents (an answer recorded locally but missing after submit) | **0** |
| Reliability | Answer-save requests succeeding at the first or retried attempt | ≥ 99.9% |
| Performance | p95 latency of `PUT /api/attempts/:id/answers` (Singapore region) | < 400 ms |
| Performance | Exam page with 100 questions: interactive on a Moto G Power-class device, Fast 3G | < 3.5 s |
| Performance | JS shipped on the exam route (gzipped, excluding KaTeX fonts) | < 180 KB |
| Security | Correct answers or explanations present in any response before submission | **0** (automated test P4) |
| Quality | Lighthouse mobile Accessibility score on public and student pages | ≥ 95 |

## 6. Out of Scope (Non-Goals) for R1

The agent **must not** build, scaffold or stub these unless `06_Plan.md` is updated through the Decision Log. Database tables for these features are also **not** created in R1, except where a column is explicitly listed in `05_Schema.md`.

### 6.1 Deferred to R2 (Engagement)
- Public/student **leaderboard page**. (R1 shows only *Your Position* and *Highest Marks* on the result page, plus an admin-only ranked table.)
- Student-set `display_name` UI and masked-mobile leaderboards. (The column exists but has no UI.)
- **Progress / analytics page**: chapter-wise strengths, score trend charts.
- **Automated reminders**: expiry in 3 days, exam in 1 hour.
- **Announcements** banner and announcement emails; bulk "send announcement".
- **"Ask a doubt"** button and the admin doubts inbox.
- **Downloads**: result card (PDF/image) and question paper with solutions (PDF).
- Tab-switch logging and copy/paste disabling during exams.
- Admin charts (score distribution, average score trends).
- Excel/PDF export of results. (R1 has **CSV only**.)
- Month-grid calendar views. (R1 uses date-grouped lists.)
- Retakes / multiple attempts per exam. (R1 allows exactly **one** attempt per student per exam.)

### 6.2 Deferred to R3 (Growth)
- **Auto-generated** and hybrid exam question selection.
- Student **groups/batches** as entities. (R1 uses a free-text `admin_label` and "selected students" audiences.)
- Online payment gateway or automated bKash/Nagad API verification.
- Referral codes, coupons and discounts.
- Installable PWA, offline-first app shell, push notifications.
- Drag-and-drop routine calendar.

### 6.3 Never (explicitly rejected)
- A **name field** anywhere in enrollment or the student profile.
- SMS delivery of PINs. Email is the only credential channel.
- Student self-registration without an approved payment.
- Storing PINs or passwords in plain text or in any recoverable form (including email outbox payloads and logs).
- Sending correct answers, explanations or option statistics to the browser before the attempt is submitted **and** the publish time has passed.
- Social login (Google/Facebook) and magic links.
- Native mobile apps.
- Multi-tenant support (several coaches on one deployment).
- Using Google Sheets as a data source. It is a write-only mirror.

## 7. Assumptions and Constraints

- All times are stored in UTC and **displayed in `Asia/Dhaka` (UTC+6, no DST)**.
- Currency is BDT, shown as whole taka (`৳1,500`). Digits are shown as **Latin digits** in both languages, for clarity with mobile numbers and TrxIDs.
- There is a single coach organisation. 1 to 3 admin accounts, all with equal rights in R1.
- Expected scale for R1: ≤ 2,000 students in total, ≤ 1,000 concurrent exam takers, ≤ 20,000 questions.
- Hosting budget suits Vercel (Pro recommended) plus Supabase (Pro recommended, for PITR backups and pg_cron reliability).

## 8. Glossary

| Term | Meaning |
| --- | --- |
| Admission | One enrollment or renewal request (payment proof) submitted by a visitor or student. |
| Attempt | One student's single sitting of one exam. |
| Live window | `[starts_at, live_ends_at)`: the official exam time. |
| Late attempt | An attempt started at or after `live_ends_at` (only possible in `window` or `always` access mode). |
| Access state | Derived student state: `active`, `expired`, `cancelled`, or `suspended` (see `05_Schema.md` §6). |
| Exam phase | Derived exam state: `draft`, `scheduled`, `live`, `late_window`, `closed`, `archived`. |
| Paper | The question payload sent to the browser during an attempt. It **never** includes answers. |
