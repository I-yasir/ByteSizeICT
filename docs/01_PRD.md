# 01 — Product Requirements Document (PRD)

| Field | Value |
| --- | --- |
| Product | **ByteSizeICT**: ICT MCQ exam platform (working name; brand is set in Admin → Settings) |
| Source concept | `docs/ICT MCQ Exam Platform Complete Concept and Specification.md` (v2.0) |
| Document status | **R1 live; R1.1 (Update 1.1) approved 2026-11-09.** Changes go through the Decision Log in `07_Plan_V2.md` (R1.1) / `06_Plan.md` (R1). |
| Last updated | 2026-11-09 (R1.1) |

> **Release naming.** To avoid clashing with the *implementation* phases in `06_Plan.md` (Phase 1 to 4) and `07_Plan_V2.md` (V2-0 to V2-G), product releases are named **R1 (MVP)**, **R1.1 (Update 1.1, current)**, **R2 (Engagement)** and **R3 (Growth)**. This document specifies R1 as amended by R1.1 (summary in §9). R2 and R3 items are listed only so that nobody builds them early.

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
| V-01 | As a visitor, I want a persuasive homepage so that I understand the value in 5 seconds. | Hero with headline, one-line value, **Enroll Now** (scrolls to Plans & Pricing, `/#pricing`) and **Trial exam** (`/sample`) buttons. Above the fold at 360×640. LCP < 2.5 s on simulated Fast 3G. *(R1.1: no exam routine or next-exam strip on the homepage.)* |
| V-02 | *(Removed in R1.1.)* The next-exam strip with countdown is no longer public; the next exam is shown only to students (S-04). | — |
| V-03 | As a visitor, I want to see each plan's exam routine so that I can choose a plan. | `/routine` lists every active plan with its **routine PDF** (View + Download); a plan without a PDF shows "Routine coming soon". A logged-in student additionally sees **their personal routine** there (S-16). No exam data is shown to visitors. |
| V-04 | As a visitor, I want to see why to join, results, how it works, pricing and FAQ. | Static sections driven by Admin Settings (testimonials, top performers, plans, FAQ). The Plans & Pricing section has the anchor `#pricing`; each plan card shows **View routine** (when the plan has a PDF) above **Choose this plan** (primary colour, same as Enroll Now) → `/enroll?plan=<code>`. |
| V-05 | As a visitor, I want to try a free **trial exam** without logging in. | `/sample` runs the single published trial (sample) exam (5–10 questions) with the same exam UI. It is scored on the server and shows a result with explanations and an **Enroll Now** CTA (→ `/#pricing`). Nothing is stored per visitor. All UI labels call it "Trial exam" (bn "ট্রায়াল পরীক্ষা"). |
| V-06 | As a visitor, I want to enroll by paying manually and submitting a short form. | `/enroll?plan=<code>` shows **only the chosen plan** (no plan selector), the active payment accounts (bKash/Nagad/Rocket/Bank) with copy buttons and the amount. Without a valid active plan code it redirects to `/#pricing`. The form has exactly **4 required fields** (Mobile, Email, Payment Method, TrxID). There is **no name field**. |
| V-07 | As a visitor, I want clear validation and confirmation. | Mobile must match `^01[3-9]\d{8}$` after normalisation. A duplicate TrxID is rejected with a friendly message. On success the visitor is sent to `/enroll/success`: "Request received! We'll verify your payment and send your login details to your email shortly." |
| V-08 | As a visitor on a phone, I want quick help. | A sticky **Enroll Now** bar on mobile for public pages (except `/enroll` and `/sample`) that goes to `/#pricing`, and a floating WhatsApp/Messenger button (links from Settings). Every Enroll Now button on the site goes to `/#pricing`. |

### 4.2 Student

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| S-01 | As a student, I want to log in with my mobile number and PIN. | Minimal form with a PIN show/hide toggle. A wrong PIN shows "Wrong PIN. N attempts left". After **5 consecutive failures** the account is locked for **15 minutes**. "Remember me" keeps the session for 30 days, otherwise it lasts for the browser session (12 h max). |
| S-02 | As a new student, I must change my PIN at first login. | If `must_change_pin` is true, every student route redirects to `/change-pin` until a new 4–6 digit PIN is set. The new PIN cannot equal the old one. |
| S-03 | As a student, I want only one active session so that my account can't be shared easily. | A new login revokes all other sessions of that student (configurable `auth.maxDevices`, default 1). A revoked device sees "You were logged out because your account was used on another device." |
| S-04 | As a student, I want a dashboard that shows what to do now. | "Welcome back" greeting, subscription status ("Active · 42 days left"), **Today's / Live exam** card with a big **Start Exam** button, **Next exam** with countdown, **Routine** (upcoming exams, date-grouped), Missed list (with **Take Now** when allowed), quick stats (exams taken, average %, best %, current streak), and the 5 most recent results. Only exams whose audience includes the student are shown (A-10). |
| S-05 | As a student, I want to see all my exams with clear status. | `/exams` lists the exams available to me (audience "all active students", or my current plan), each tagged **Upcoming / Live Now / Completed / Missed / Locked**. A Missed exam that is still available shows **Take Now**. |
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
| S-16 | As a student, I want my personal routine. | `/routine` (when logged in) and the dashboard show my upcoming exams (only those whose audience includes me), grouped by date in Asia/Dhaka time, above the plan routine PDFs. |

### 4.3 Admin

| ID | User story | Acceptance criteria |
| --- | --- | --- |
| A-01 | As the admin, I want a secure separate login. | `/admin/login` with email and password (argon2id hashed), lockout after 5 failures for 15 min. Admin accounts are created only by the CLI script `pnpm admin:create`. |
| A-02 | As the admin, I want an overview. | Total / active / expired / cancelled students, pending admissions count, revenue this month (sum of approved admissions' `amount_bdt`), exams this week, and the last 10 audit events. |
| A-03 | As the admin, I want to process admissions quickly. | Queue filtered by status (default Pending), method and date, with search by mobile/email/TrxID. Each row shows TrxID, method, amount, plan, mobile, email, submitted time and **duplicate flags** (mobile exists / email exists / other pending request). **Approve** opens a dialog prefilled with plan dates (editable start/expiry). **Reject** requires a reason. |
| A-04 | As the admin, approving should do everything automatically. | Approve (new) creates the student, generates a 6-digit PIN, stores only its hash, sets validity, writes an audit row, emails credentials, and queues a Google Sheet upsert. Approve (renewal) extends the existing account (`new_expiry = max(now, current_expiry) + plan duration`, editable), reactivates a cancelled account, and emails a confirmation without a new PIN. |
| A-05 | As the admin, I want to manage students. | List with search (mobile/email), filters (active / expired / cancelled / suspended, label) and pagination. Profile shows details, private label and note, plan, dates, payment history (admissions), exam history and scores. **Actions:** extend validity by N days, set a custom expiry, cancel (instantly revokes sessions), suspend/reactivate, reset PIN (and email it), resend credentials (generates a new PIN), force logout, edit email/label/note. **Bulk:** extend selected students by N days. Every action is audited. |
| A-06 | As the admin, I want a structured question bank. | Hierarchy Subject → Chapter → Topic → Question. Each question has stem (Bangla/English, LaTeX via `$…$`), optional image, 4 options each with optional image, correct option, explanation (optional image), status (draft / active / archived), and usage stats (times used, % correct). *(R1.1: difficulty, type, source, board year and tags are removed.)* |
| A-07 | As the admin, I want to add questions fast. | Single-question form with a live preview identical to the student rendering. Duplicate detection warns when normalised content matches an existing question (`content_hash`). Duplicate, edit, archive and **delete** (A-17) are available. |
| A-08 | As the admin, I want bulk import. | Upload `.xlsx` or `.csv` (template downloadable, max 2,000 rows, max 20 MB). **Excel files may contain pictures** for the stem, each option and the explanation (image columns; PNG/JPG/WebP ≤ 1 MB each; an option may be image-only); CSV is text-only. The file is parsed in the browser and uploaded directly to storage (no size-limited server upload). The system validates every row and shows a preview with a per-row (and per-image) error report. The admin imports the valid rows. Duplicates are skipped by default. Old templates with the removed columns (difficulty, type, source, board year, tags) still import; those columns are ignored with a warning. |
| A-09 | As the admin, I want to find questions. | Multi-filter search: chapter, topic, status, "unused only", and text search. Sort by newest, most used, or lowest % correct. Deleted questions never appear. |
| A-10 | As the admin, I want to build an exam. | Set title, description, subject, start time, duration, marks per question, negative mark, access mode (Fixed / Open window / Always available), late-until (window mode), shuffle questions/options, mark-for-review on/off, results publish time, answers publish time, option-stats on/off, rank late attempts on/off, and **audience: all active students, or the students of one or more selected plans** (a plan is a student group; a student belongs to the group of their current plan). Select questions **manually** with the bank filters, then reorder. |
| A-11 | As the admin, I want to preview and publish safely. | "Preview as student" renders the exam page in read-only mode. Publishing validates the exam (≥ 1 question, all questions active, valid times). Once any attempt exists, the question set, marks and negative marking are **locked**. |
| A-12 | As the admin, I want exam results. | Per exam: participants, average, highest, lowest, a ranked table (mobile, score, correct/incorrect/skipped, late flag, submitted time), question-level % correct, and CSV export. |
| A-13 | As the admin, I want routine control. | Published exams automatically appear on the dashboards and personal routines of the students in their audience. *(R1.1: no homepage routine and no featured exam.)* Each plan carries a routine PDF for visitors (A-14). |
| A-14 | As the admin, I want to configure the site. | Settings: brand name and logo, contact links (WhatsApp, Messenger, phone, email), payment accounts, pricing plans (**each plan requires a routine PDF when created**: PDF only, ≤ 5 MB; active plans without one show a warning), FAQ items, testimonials and top performers, auth policy (max devices), and result visibility for inactive students. |
| A-15 | As the admin, I want a Google Sheet mirror. | Approved and rejected admissions append or update **Admissions**; student create/extend/cancel upserts **Active Students** (one row per mobile); every submitted attempt appends to **Exam Results**. Sheet failures never block the admin; they retry automatically and show in Settings → Integrations. |
| A-16 | As the admin, I want an audit log. | Every extension, expiry change, cancellation, suspension, PIN reset, credentials resend, force logout, approval and rejection writes an immutable audit row. `/admin/audit` lists them with filters. |
| A-17 | As the admin, I want to delete questions. | Delete from the editor or in bulk from the list. A question in any **current or upcoming** exam (draft, scheduled, live, or open late window; an "always available" exam counts until archived) cannot be deleted: the admin sees which exams block it. A question used only in past exams is **hidden** permanently (it stays in those exams' results and reviews). A never-used question is **erased** together with its images. Every deletion is audited. |

## 5. Success Metrics

Measured from DB queries and Vercel Analytics. "Week" means a rolling 7 days.

| Area | Metric | R1 target |
| --- | --- | --- |
| Conversion | Visitor → enrollment-submit rate (unique visitors to `/` vs. admissions created) | ≥ 3% |
| Conversion | Trial exam completion → Enroll Now (`/#pricing`) click-through | ≥ 15% |
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
- Student **groups/batches** as separate entities. (R1.1 uses **plans** as the student groups for exam audiences; no other grouping.)
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
- **Free tiers only (R1.1):** Vercel Hobby, Supabase Free, Resend Free and Google Cloud free usage. No feature may require a paid plan; consequences (no PITR → manual `pg_dump`, uploads go straight to Supabase Storage because of the 4.5 MB request cap, ~100 emails/day) are listed in `04_TRD.md` §13.

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
| Group | (R1.1) The set of students whose current plan is X. Exams are targeted to all active students or to one or more plans. |
| Trial exam | (R1.1 label) The free sample exam at `/sample` (`exams.is_sample`). |
| Routine PDF | (R1.1) A plan's exam schedule as a PDF, public on the plan card and `/routine`. |
| Soft-deleted question | (R1.1) A deleted question that was used in past exams: hidden everywhere in the admin bank, kept for those exams' results and reviews. |

## 9. R1.1 (Update 1.1) change summary

Approved 2026-11-09 (owner decisions D1–D10, `07_Plan_V2.md` §2). Stories changed: V-01…V-06, V-08, S-04, S-05, A-06…A-10, A-13, A-14; added S-16, A-17.

| # | Change | Stories |
| --- | --- | --- |
| CR1 | Exam audience = all active students or one or more **plans** (plan = group); "selected students" audience removed | A-10, S-04, S-05 |
| CR2 | Admins can delete questions (blocked in current/upcoming exams; hidden if used in past exams; erased if never used) | A-07, A-17 |
| CR3 | Excel import may include pictures (stem, options, explanation); CSV stays text-only | A-08 |
| CR4 | "Try a free sample exam" → "Trial exam" everywhere | V-01, V-05 |
| CR5 | Next exam + routine removed from the homepage; shown only to students (filtered); `/routine` shows plan routine PDFs (+ personal routine for students); featured exam removed | V-02, V-03, A-13, S-16 |
| CR6 | Each plan has a routine PDF (required on create), shown on its card | V-04, A-14 |
| CR7 | "Choose this plan" uses the same (primary) colour as Enroll Now | V-04 |
| CR8 | Every Enroll Now button goes to `/#pricing` | V-01, V-05, V-08 |
| CR9 | `/enroll` shows only the plan chosen on the homepage | V-06 |
| CR10 | Question fields difficulty, type, source, board year and tags removed with all related features | A-06, A-08, A-09 |

