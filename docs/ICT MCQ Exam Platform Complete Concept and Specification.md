# ICT MCQ Exam Platform: Complete Concept and Specification

Version 2.0 (includes revisions: no name field, single scrolling exam page, result review modeled on sample screens)

## 1. Vision

A mobile-first, Bangla-friendly exam website where a coach/teacher (the Admin) runs ICT MCQ exams for enrolled students. The site has two jobs:

1. **Convert visitors into students** with a homepage that shows the exam routine, results, and a simple admission process.
2. **Give enrolled students a calm, fast, distraction-free exam experience** with instant results and clear progress tracking.

**Core principle:** every task should take as few taps as possible, and nothing should ever confuse a student.

## 2. User Roles

| Role | Access |
| --- | --- |
| Visitor | Homepage, routine, sample exam, enrollment form |
| Student | Dashboard, assigned exams, results, analytics (only while the subscription is active) |
| Admin | Full control: students, payments, question bank, exams, routine, subscriptions |

## 3. Public Website (Marketing Side)

The homepage must **influence visitors to enroll**. The first screen shows the most persuasive content.

### Homepage structure (top to bottom)

1. **Hero section:** strong headline (e.g., "Master ICT MCQ with Daily Exams"), one line of value, and two buttons: **Enroll Now** and **Try a Free Sample Exam**.
2. **Live exam routine strip:** "Next exam: Chapter 3, Tomorrow 8:00 PM" with a countdown timer. It creates urgency and shows the platform is active.
3. **Exam routine calendar:** a clean weekly/monthly view of upcoming exams (date, time, chapter, marks, duration).
4. **Why join:** 4-6 icon cards (daily practice, chapter-wise exams, instant results, solutions with explanations, rank and progress tracking, missed-exam recovery).
5. **Results and social proof:** top performers, average score improvement, testimonials (with permission).
6. **How it works (3 steps):** Pay, get login details by email, start exams.
7. **Pricing/plans:** simple cards by duration (e.g., 1 month, 3 months, full course).
8. **Free sample exam:** 5-10 questions with no login, used as a conversion tool.
9. **FAQ:** payment, access, missed exams, devices.
10. **Sticky "Enroll Now" button** on mobile, plus a floating WhatsApp/Messenger support button.

## 4. Admission and Payment Flow

Payment is **manually verified**. No payment gateway is needed.

### 4.1 Student side (Enrollment page)

1. The student sees payment instructions: the Admin's **bKash / Nagad / Rocket / Bank** details, each with a copy button and the amount.

2. The student pays through their own app.

3. The student fills in a **4-field form** (there is **no name field**):

   - **Mobile Number** (validated for Bangladesh format, e.g., 01XXXXXXXXX)
   - **Email**
   - **Payment Method** (bKash / Nagad / Rocket / Bank)
   - **Transaction ID (TrxID)**
   - The plan is optional and can be pre-filled if the student arrives from a pricing card.

4. On submit the student sees: "Request received! We'll verify your payment and send your login details to your email shortly."

5. The request is saved with status **Pending**.

### 4.2 Admin side

1. A new entry appears in the **Admissions** queue (with an optional email/SMS alert).
2. The Admin checks the TrxID against their own bKash/Nagad/bank statement.
3. The Admin clicks **Approve** or **Reject** (with a reason).
4. On **Approve**, the system creates the student account, generates a PIN, sets the validity period, sends the welcome email, and writes a row to the Google Sheet.

### 4.3 Safeguards

- **Duplicate TrxID detection:** the same TrxID cannot be submitted twice.
- **Duplicate mobile/email warning** to catch re-enrollments and renewals.
- Statuses: Pending, then Approved or Rejected.
- Clear form validation and friendly error messages.

### 4.4 Effects of having no name

- The welcome email uses a generic greeting ("Welcome to \[Platform Name]!").
- The mobile number is the unique identifier everywhere, including the Google Sheet.
- The Admin finds students by mobile number and email, and can add a private **note or label** (e.g., "Batch A") visible only to the Admin.
- Leaderboards show a **masked mobile number** (e.g., 017XX-XXX-890), or an optional display name the student sets later. The student's own row is highlighted.
- The dashboard greeting is a simple "Welcome back".

## 5. Account Creation and Credentials

- **Username:** the student's mobile number.
- **PIN:** 4-6 digits, auto-generated or set by the Admin, stored **hashed**, never in plain text.
- **Welcome email contains:** the website link, mobile number (login ID), PIN, subscription start and expiry dates, and a short "how to start" guide.
- **Admin can:** reset a PIN, resend the email, and edit student details.
- **Student can:** change the PIN after first login (prompted).

## 6. Student Experience

### 6.1 Login

- Minimal screen: mobile number and PIN, with a show/hide toggle.
- Friendly errors ("Wrong PIN. 2 attempts left").
- **Lockout after repeated failures** (e.g., 5 attempts).
- Optional "Remember me on this device".

### 6.2 Dashboard

- Greeting and **subscription status** ("Active · 42 days left").
- **Today's exam** as a prominent card with a big **Start Exam** button.
- **Upcoming exams** and **Missed exams** lists (with "Take Now" if the Admin allows it).
- Quick stats: exams taken, average score, best score, current streak.
- Recent results.

### 6.3 Exam routine (student view)

Calendar/list view with colored tags: **Upcoming**, **Live Now**, **Completed**, **Missed**, **Locked**.

### 6.4 Taking an Exam: single scrolling page

All questions appear on **one continuous scrolling page**, like a printed question paper. Students can scan, skip, and come back naturally. The layout is inspired by the sample screens provided.

**Layout**

- **Sticky top bar** with the exam title, a **countdown timer**, and an **answered counter** (e.g., "Answered 37/100") with a thin progress bar. The timer turns amber in the last 5 minutes and red in the last 1 minute.

- **Question cards** stacked vertically. Each card contains:

  - A small "Question N" label.
  - The question text (Bangla or English, with math/ICT symbols rendered correctly, plus an optional image).
  - **Four options (A-D)** as full-width tappable rows with circled letters and a large touch area.

- **Tap to select, tap again to deselect.** The selected option is clearly highlighted and the card shows a subtle "answered" indicator.

- **Floating question navigator** (small corner button) opening a **bottom-sheet grid** of question numbers (answered / unanswered / marked) for instant jumping.

- **Scroll-to-top button** appears after scrolling.

- **Sticky bottom bar on mobile** with a **Submit** button.

- **Optional "Mark for review" star** on each card, switched on or off per exam by the Admin.

**Behavior**

- **Auto-save:** every selection is saved instantly (locally and synced to the server). A refresh, crash, or dropped connection loses nothing, and the student returns to the same scroll position with the correct remaining time.
- **Auto-submit** when time ends.
- **Submit confirmation** summarizes answered, unanswered, and marked questions, with a "Review unanswered" shortcut that scrolls to the first unanswered question.
- **Negative marking** is configurable per exam and stated clearly at the top.
- **Performance:** lazy-load images and render questions in chunks so 100+ questions run smoothly on cheap phones and slow networks.
- **Server-side timing and scoring:** correct answers are never sent to the browser during the exam.
- **Optional:** shuffle questions and options per student, and log tab switches for the Admin.
- **Dark and light mode** toggle, since many students study at night.

### 6.5 Results and Review

**Result summary (top of the page)**

- Exam title and program/batch name.
- A large **Marks Obtained** figure (e.g., 4/100) in a color-coded display.
- **Your Position** and **Highest Marks**, which the Admin can **hide until a set time** (e.g., "Will be published after 8:10 AM on 8 Nov"). This keeps live exams fair so late attempters cannot see rankings early.
- A **Download** dropdown: result card (PDF/image) and question paper with solutions (PDF).

**Analysis Report (4 stat cards)**

| Card | Color |
| --- | --- |
| Correct | Green |
| Incorrect | Red |
| Skipped | Blue |
| Accuracy % | Teal |

**Filters:** checkboxes for **Correct / Incorrect / Skipped** let students view only the questions they want, which is very useful for reviewing mistakes quickly.

**Question-by-question review.** Each card shows:

- The "Question N" label with a **status tag** on the right (Correct / Incorrect / Skipped).
- The question and four options, with the **correct option marked by a green tick** and the **student's wrong choice marked in red**.
- A **statistics bar** showing the percentage of all students who chose each option (A, B, C, D, Skipped). This also helps the Admin spot questions that most students get wrong.
- A **Solution box** (soft green panel) with the explanation, supporting Bangla text, formulas, and images.

**Extras**

- Scroll-to-top button and a quick "jump to question" control.
- **Chapter-wise performance** (strong and weak topics).
- **Score trend chart** across exams.
- Optional **"Ask a doubt"** button on each question, sending the question to the Admin.

### 6.6 Missed Exams

The Admin decides per exam whether it is **Fixed-time only**, **Open for a window** (e.g., 3 days), or **Always available**. Missed exams show as "Missed: Take Now" when allowed. Late attempts are flagged "Late attempt" and can be excluded from the live ranking.

### 6.7 Expired or Cancelled Subscription

A friendly screen: "Your access expired on \[date]. Renew to continue," with renewal payment steps. Past results stay visible (configurable by the Admin).

## 7. Admin Panel

A clean dashboard, usable on desktop and mobile.

### 7.1 Overview Dashboard

Total, active, and expired students; pending admissions; revenue this month; exams this week; average score trends; recent activity.

### 7.2 Admissions and Payments

- Queue of pending requests with TrxID, method, amount, mobile, and email.
- One-click **Approve / Reject**, with search and filters (status, date, payment method).
- Payment history per student.

### 7.3 Student Management

- List with search (mobile, email) and filters (active, expired, cancelled).
- Per-student profile: details, private note/label, plan, start and expiry dates, payment record, exam history, scores.
- **Actions:** extend validity, set a custom expiry date, **cancel the subscription instantly**, suspend or reactivate, reset PIN, resend credentials, force logout.
- Bulk actions (e.g., extend all by 7 days, send an announcement).

### 7.4 Question Bank (the heart of the system)

**Hierarchy:** Subject, Chapter, Topic, Question (e.g., ICT, Chapter 3: Number Systems, Topic: Binary Conversion).

**Each question stores:**

- Question text (Bangla/English) with optional image.
- Four options (A-D), each with an optional image.
- Correct answer.
- **Explanation** (the solution shown after the exam).
- **Tags and filters:** chapter, topic, difficulty (Easy/Medium/Hard), question type (knowledge, application, multi-point), source/board year, status (active/draft).
- Usage stats: times used and percentage answered correctly, to identify bad or too-easy questions.

**Admin tools:**

- Add a single question through a simple form with live preview.
- **Bulk import** via Excel/CSV template (essential for a huge bank), with an error report for invalid rows.
- Search and **multi-filter sorting** (chapter, topic, difficulty, tag, unused only).
- Edit, duplicate, archive, and bulk-tag.
- Duplicate-question detection.

### 7.5 Exam Builder

1. Set title, description, date/time, duration, total marks, and negative marking.

2. **Select questions** in three ways:

   - **Manual:** browse and tick questions using filters.
   - **Auto-generate:** e.g., "20 questions from Chapter 3: 10 Hard, 10 Medium", picked randomly from the bank.
   - **Hybrid:** auto-generate, then swap individual questions.

3. **Options:** shuffle questions, shuffle options, retake rules.

4. **Layout:** single scrolling page (default).

5. **Mark-for-review:** show or hide.

6. **Result visibility:** when to publish rank and highest marks; show or hide option-wise percentage statistics; show answers immediately or after a set time.

7. **Access rules:** Fixed time, Open window, or Always available, for selected students or groups.

8. **Preview as a student** before publishing.

9. **Status flow:** Draft, Scheduled, Live, Completed.

### 7.6 Exam Routine Manager

- Drag-and-drop calendar for scheduling exams.
- Publishes automatically to the public homepage and student dashboards.
- A "featured exam" toggle controls what appears in the homepage hero.

### 7.7 Results and Analytics

- Per exam: participation, average, highest and lowest, score distribution, **leaderboard**, and question-level analysis (which questions most students got wrong).
- Per student: performance over time and weak chapters.
- Export results to Excel/PDF.
- Inbox for student doubts (if the "Ask a doubt" feature is enabled).

### 7.8 Notices and Communication

- Announcement banner for the homepage and student dashboard.
- Email templates (welcome, expiry reminder, renewal, new exam) with one-click send.
- Automated reminders: "Your subscription expires in 3 days" and "Exam starts in 1 hour".

### 7.9 Settings

Payment instructions (numbers and amounts), pricing plans, branding (logo, colors), contact info, and email templates.

## 8. Google Sheet Integration

Each approved admission and key student events are appended to a Google Sheet, with **one row per mobile number**.

| Mobile | Email | Payment Method | TrxID | Amount | Plan | Status | Approved On | Start Date | Expiry Date | PIN Sent | Last Login | Exams Taken | Avg Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

- **Sheet 1, Admissions:** all requests, including pending and rejected.
- **Sheet 2, Active Students.**
- **Sheet 3, Exam Results** (optional, one row per attempt).
- Updates run automatically through a server-side connection (Google Sheets API or Apps Script).
- The Sheet is a **mirror and backup** for convenience. The database remains the single source of truth.

## 9. Subscription and Validity Logic

- Every account has a **start date** and **expiry date**, chosen by the Admin at approval (preset plans or a custom date).
- **Automatic enforcement:** after expiry, login still works but exams are locked and a renewal message is shown.
- **Instant cancellation:** the Admin can revoke access at any time, which also ends any active session immediately.
- **Renewal:** the student pays again and submits a new TrxID; on approval the same account is extended (no new account).
- Reminder emails before expiry.
- A full **audit log** of every extension, cancellation, and PIN reset.

## 10. Security and Fair Use

- PINs stored **hashed**; all traffic over HTTPS.
- **Rate-limited login** and temporary lockouts.
- **Single active session per student** (or a limit of 2 devices) to discourage account sharing.
- Server-side timers and scoring; correct answers are never sent during an exam.
- Optional: shuffle per student, disable copy/paste, log tab switches.
- Role-based access: students can never reach admin pages or other students' data.
- Regular database backups.
- A simple privacy policy, since mobile numbers and emails are personal data.

## 11. UX and Design Principles

- **Mobile-first:** every layout is designed for a small screen first.
- **Bangla-first interface** with an English toggle, using readable fonts such as Hind Siliguri or Noto Sans Bengali.
- **Fast on poor networks:** lightweight pages, minimal images, graceful handling of disconnections.
- **Large touch targets**, high contrast, clear typography.
- **One primary action per screen** (e.g., "Start Exam").
- Status colors: green for done/active, amber for pending/upcoming, red for missed/expired.
- Friendly empty states and error messages, never technical jargon.
- Light polish: subtle animations, progress indicators, a celebratory result screen.
- Accessibility: readable font sizes, dark and light mode, keyboard support on desktop.
- **Header:** logo on the left; home, notification, and profile icons on the right.
- **Mobile bottom navigation:** Dashboard, Exams, Results, Profile (extra tabs such as Downloads, Q&A, or Community can be added later).

## 12. Key Pages

- **Public:** Home, Exam Routine, Enroll, Sample Exam, FAQ/Contact, Login.
- **Student:** Dashboard, My Exams, Exam Page, Result and Review, Progress, Profile (change PIN), Renewal.
- **Admin:** Dashboard, Admissions, Students, Question Bank, Exam Builder, Routine Calendar, Results/Analytics, Announcements, Settings.

## 13. Suggested Tech Stack

| Layer | Recommendation |
| --- | --- |
| Frontend | React / Next.js with Tailwind CSS |
| Backend and Auth | Firebase (Auth, Firestore, Cloud Functions) or Supabase |
| Email | Firebase Extensions, Resend, or SendGrid |
| Google Sheets | Google Sheets API via Cloud Functions or Apps Script |
| Hosting | Firebase Hosting or Vercel, with a custom domain |
| Optional | SMS gateway as a backup channel for PIN delivery |

## 14. Development Roadmap

**Phase 1, MVP**

Homepage and routine, enrollment form, admin approval, account and PIN creation with email, student login, question bank (manual entry and CSV import), exam builder, single-page exam, instant results with review, subscription expiry and cancellation, Google Sheet sync.

**Phase 2, Engagement**

Leaderboards, progress analytics, missed-exam windows, automated reminders, result cards, announcements, doubt submission.

**Phase 3, Growth**

Auto-generated exams, question-level analytics, student groups and batches, optional online payment gateway, referral codes, installable PWA.

## 15. Risks and Considerations

- **Manual payment checking** can become time-consuming as enrollment grows. A future option is automated bKash/Nagad API verification.
- **Account sharing** cannot be fully eliminated, but session limits reduce it.
- **Question quality** matters more than quantity; use question-level statistics to retire weak questions.
- **Content protection:** the question bank is the biggest asset, so keep it behind secure server-side access.
- **Live hosting** requires a backend (login, email, Google Sheet connection) set up on the owner's side; a prototype alone cannot send emails or store real data.

## 16. Next Step

Build a working prototype beginning with the **exam page** and **result review page** (the core of the sample screens), followed by the homepage, enrollment flow, and admin panel with sample data.
