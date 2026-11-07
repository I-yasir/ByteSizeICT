# 03 — UI Specification & Design System

Status: **Locked for R1.** All values below are tokens. Components must use tokens (Tailwind theme utilities generated from CSS variables). **Never** hard-code hex values, px font sizes or arbitrary spacing in components.
Implementation file: `src/app/globals.css` (Tailwind v4 `@theme` + CSS variables). Theme switching: `next-themes` with `attribute="class"` (`.dark` on `<html>`), default `system`.

---

## 1. Design Principles → Rules

| Principle | Enforceable rule |
| --- | --- |
| Mobile-first | Author base styles for 360 px; add `sm:`/`md:`/`lg:` overrides only. Test at 360, 768, 1280. |
| One primary action per screen | At most **one** `Button variant="primary"` visible per viewport region (sticky bars count as their own region). |
| Large touch targets | Interactive elements ≥ **48×48 px** hit area (option rows ≥ 56 px tall). Spacing between adjacent targets ≥ 8 px. |
| High contrast | Body text ≥ 4.5:1, large text/icons ≥ 3:1 against their background, in **both** themes (validated values below). |
| Calm | Motion ≤ 200 ms for UI feedback, ≤ 300 ms for sheets/dialogs. No parallax, no autoplay media. `prefers-reduced-motion` disables all non-essential motion. |
| Status colours | Green = done/active/correct, Amber = pending/upcoming/warning, Red = missed/expired/incorrect/critical, Blue = skipped/info, Teal = accuracy, Grey = locked/disabled. |

---

## 2. Colour Tokens

Semantic tokens are defined as CSS variables on `:root` (light) and `.dark` (dark) and exposed to Tailwind via `@theme inline` (e.g., `bg-surface`, `text-fg-muted`, `border-border`, `bg-success-soft`).

### 2.1 Neutrals & surfaces
| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--bg` | `#F6F7FB` | `#0B0F17` | Page background |
| `--surface` | `#FFFFFF` | `#121826` | Cards, sheets, inputs |
| `--surface-2` | `#EEF1F6` | `#1A2233` | Subtle fills, table header, skeleton base |
| `--surface-3` | `#E2E7EF` | `#232C40` | Hover fill on neutral rows, skeleton shimmer |
| `--border` | `#DDE2EA` | `#273246` | Default borders, dividers |
| `--border-strong` | `#C3CAD6` | `#3A4760` | Input borders, option row borders |
| `--fg` | `#0F172A` | `#E7EAF0` | Primary text |
| `--fg-muted` | `#475569` | `#A6B0C3` | Secondary text |
| `--fg-subtle` | `#5B687B` | `#8792A8` | Captions, placeholders (≥ 4.5:1 on surface) |
| `--fg-inverse` | `#FFFFFF` | `#0B0F17` | Text on strong colour fills |
| `--overlay` | `rgba(15,23,42,0.50)` | `rgba(0,0,0,0.60)` | Dialog/sheet backdrop |

### 2.2 Brand
| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--primary` | `#4338CA` | `#8B93F8` | Primary buttons, selected option, links, progress |
| `--primary-hover` | `#3730A3` | `#A5ACFB` | Hover/pressed |
| `--primary-soft` | `#EEF0FF` | `#1F1D4D` | Selected option background, answered navigator cell bg (dark), chips |
| `--primary-soft-border` | `#C7CBFB` | `#3F3D8F` | Selected option border (with 2 px `--primary` ring) |
| `--on-primary` | `#FFFFFF` | `#0B0F17` | Text/icons on `--primary` |
| `--focus-ring` | `#6366F1` | `#A5ACFB` | 2 px focus outline + 2 px offset |

### 2.3 Status
| Token | Light | Dark | Soft bg (Light / Dark) | Usage |
| --- | --- | --- | --- | --- |
| `--success` | `#15803D` | `#4ADE80` | `#DCFCE7` / `#0B2E1A` | Correct, active, completed |
| `--danger` | `#B91C1C` | `#F87171` | `#FEE2E2` / `#3A1010` | Incorrect, expired, missed, errors, critical timer |
| `--warning` | `#B45309` | `#FBBF24` | `#FEF3C7` / `#3A2A06` | Pending, upcoming, ≤ 5 min timer, marked-for-review |
| `--info` | `#1D4ED8` | `#60A5FA` | `#DBEAFE` / `#0E2145` | Skipped, informational banners |
| `--teal` | `#0F766E` | `#2DD4BF` | `#CCFBF1` / `#06302D` | Accuracy card |
| `--neutral-status` | `#5B687B` | `#8792A8` | `#EEF1F6` / `#1A2233` | Locked, disabled, archived |

Soft tokens are named `--success-soft`, `--danger-soft`, etc. Text on a soft background uses the matching strong token (e.g., `text-success` on `bg-success-soft`); all such pairs are ≥ 4.5:1.

### 2.4 Special surfaces
| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--solution-bg` | `#ECFDF3` | `#0D2A1C` | Solution box background |
| `--solution-border` | `#A7F3D0` | `#1F5A3C` | Solution box border |
| `--correct-option-bg` | `#F0FDF4` | `#0F2A1B` | Review: correct option row |
| `--wrong-option-bg` | `#FEF2F2` | `#2E1214` | Review: student's wrong choice row |
| `--stat-bar-track` | `#E2E7EF` | `#232C40` | Option statistics bar track |
| `--whatsapp` | `#1FA855` | `#25D366` | WhatsApp FAB (icon colour `#FFFFFF` / `#0B0F17`) |

### 2.5 Chart / data palette (R1 uses only the stat bar)
Option stat bars: correct option = `--success`, student's wrong pick = `--danger`, other options = `--fg-subtle` at 60% opacity, Skipped = `--info`.

---

## 3. Typography

### 3.1 Families (loaded with `next/font/google`, `display: swap`, self-hosted by Next)
| Token | Family | Weights | Subsets | Usage |
| --- | --- | --- | --- | --- |
| `--font-sans` | **Hind Siliguri** | 400, 500, 600, 700 | `bengali`, `latin` | All UI and content text, both languages |
| `--font-num` | **Inter** | 500, 600, 700 | `latin` | Numeric displays: timer, marks, stat values, countdowns, TrxID (`font-variant-numeric: tabular-nums`) |
| `--font-mono` | system `ui-monospace, SFMono-Regular, Menlo, monospace` | — | — | Code snippets inside questions (C/HTML chapters) |

Fallback stack: `"Hind Siliguri", "Noto Sans Bengali", system-ui, sans-serif`. KaTeX ships its own fonts (CSS loaded only on routes that render questions).

### 3.2 Type scale (rem based on 16 px root; Bangla needs taller line-heights)
| Token | Size / line-height | Weight | Usage |
| --- | --- | --- | --- |
| `text-xs` | 0.75rem / 1.125rem (12/18) | 500 | Badges, legends, captions |
| `text-sm` | 0.875rem / 1.375rem (14/22) | 400–500 | Secondary text, table cells, helper text |
| `text-base` | 1rem / 1.625rem (16/26) | 400 | Body, option text, inputs (inputs **never** < 16 px to prevent iOS zoom) |
| `text-question` | 1.0625rem / 1.75rem (17/28) | 500 | Question stem |
| `text-lg` | 1.125rem / 1.75rem (18/28) | 600 | Card titles, section subtitles |
| `text-xl` | 1.25rem / 1.875rem (20/30) | 600 | Page titles (mobile) |
| `text-2xl` | 1.5rem / 2.125rem (24/34) | 700 | Page titles (desktop), section headings (mobile) |
| `text-3xl` | 1.875rem / 2.5rem (30/40) | 700 | Section headings (desktop) |
| `text-4xl` | 2.25rem / 2.875rem (36/46) | 700 | Hero title (mobile), Marks Obtained figure |
| `text-display` | 3rem / 3.5rem (48/56) | 700 | Hero title (≥ 1024 px) |
| `text-timer` | 1.25rem / 1.5rem (20/24), `--font-num` 700 | 700 | Exam timer |

Rules: max 2 weights per component; paragraphs max-width 68ch; never use all-caps for Bangla; letter-spacing 0 for Bangla (only `text-xs` English badges may use +0.02em).

---

## 4. Spacing, Layout, Shape, Elevation

### 4.1 Spacing (4 px base; Tailwind default spacing scale where `1` = 4 px)
Allowed steps: `0, 0.5 (2px), 1 (4), 1.5 (6), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64), 20 (80), 24 (96)`. No arbitrary values (`p-[13px]` is forbidden).

| Context | Rule |
| --- | --- |
| Page gutter | 16 px (< 640), 24 px (≥ 640), 32 px (≥ 1024) |
| Card padding | 16 px mobile, 20 px ≥ 768 |
| Stack gap inside cards | 12 px; between cards 12 px (exam), 16 px (elsewhere) |
| Section vertical rhythm (marketing) | 48 px mobile, 80 px ≥ 1024 |
| Form field gap | 16 px; label → input 6 px; input → helper 4 px |

### 4.2 Containers & breakpoints
Breakpoints = Tailwind defaults: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
| Container | Max width |
| --- | --- |
| Marketing | 1120 px |
| Student app pages | 960 px |
| Exam & review column | 720 px (centred) |
| Auth/forms (login, enroll form, change PIN) | 440 px |
| Admin content | 1280 px (sidebar 248 px fixed at ≥ 1024) |

### 4.3 Radius
`--radius-sm 6px` (chips, badges), `--radius-md 10px` (inputs, buttons, option rows), `--radius-lg 14px` (cards), `--radius-xl 20px` (sheets' top corners, dialogs), `--radius-full 9999px` (FABs, pills, circled letters).

### 4.4 Elevation (light; in dark mode shadows are replaced by 1 px `--border` + a slightly lighter surface)
`--shadow-sm: 0 1px 2px rgba(15,23,42,.06)` (cards) · `--shadow-md: 0 4px 12px rgba(15,23,42,.08)` (sticky bars, dropdowns) · `--shadow-lg: 0 12px 32px rgba(15,23,42,.14)` (dialogs, sheets, FABs).

### 4.5 Z-index scale
`base 0` · `sticky-bars 30` · `fab 40` · `dropdown 50` · `sheet/dialog 60` · `toast 70` · `submit-overlay 80`.

### 4.6 Motion
`--ease-out: cubic-bezier(.2,.8,.2,1)`. Durations: `fast 120ms` (hover, press), `base 180ms` (selection, toggles), `slow 280ms` (sheets, dialogs). Option selection: background/border colour transition 120 ms + check scale 0.8 → 1 (180 ms). Timer critical pulse: opacity 1 → 0.7, 1 s loop (disabled under reduced motion).

---

## 5. Theme Rules (Light/Dark)

1. Every colour comes from a semantic token. Components never branch on theme in JS; CSS variables switch under `.dark`.
2. The default is `system`. The toggle cycles System → Light → Dark (icon: monitor / sun / moon) and persists in `localStorage` (`theme`) through next-themes. The `<html>` gets `suppressHydrationWarning`.
3. A `<meta name="theme-color">` per scheme: light `#FFFFFF`, dark `#121826`.
4. Images: question images get a `--surface` (white in light) padding box in dark mode (`bg-white rounded-md p-1` exception token `--image-matte: #FFFFFF` in both themes) so diagrams with transparent backgrounds stay legible.
5. KaTeX inherits `currentColor`.
6. Dark mode uses no pure black (`#000`) and no pure white text; use `--bg` and `--fg`.
7. Focus rings are visible in both themes (`--focus-ring`, 2 px solid, 2 px offset, never removed).

---

## 6. Iconography & Illustration
- Icon set: **lucide-react** (stroke 1.75, sizes 16 / 20 / 24). Icons that carry meaning get `aria-label` or adjacent text; decorative icons are `aria-hidden`.
- Payment method logos: local SVGs in `public/payment/{bkash,nagad,rocket,bank}.svg` (≤ 4 KB each, provided by the owner; placeholders = coloured letter badges).
- Illustrations: inline SVG using `currentColor` + tokens, ≤ 8 KB each. No stock photos.

---

## 7. Core Components & States

Location: `src/components/ui/*` (primitives), `src/components/exam/*`, `src/components/review/*`, `src/components/marketing/*`, `src/components/admin/*`. Primitives are hand-built with Tailwind + Radix primitives where noted (no component library theme overrides).

State legend: **D** default · **H** hover (pointer devices only, `@media (hover:hover)`) · **A** active/pressed · **F** focus-visible · **X** disabled · **L** loading · **E** error · **S** selected.

### 7.1 Button (`ui/button.tsx`)
Sizes: `md` h-12 (48 px) px-5 `text-base` font-600 · `sm` h-10 (40 px, admin dense tables only) px-4 `text-sm` · `lg` h-14 (56 px) px-6 `text-lg` (Start Exam, Submit). Full-width on mobile when it is the screen's primary action.
| Variant | D | H | A | F | X | L |
| --- | --- | --- | --- | --- | --- | --- |
| primary | bg `--primary`, text `--on-primary` | bg `--primary-hover` | scale .98 | focus ring | opacity .5, `cursor-not-allowed`, no hover | spinner (16 px) replaces leading icon, label stays, `aria-busy`, disabled |
| secondary | bg `--surface`, 1 px `--border-strong`, text `--fg` | bg `--surface-2` | scale .98 | ring | opacity .5 | spinner |
| ghost | transparent, text `--primary` | bg `--primary-soft` | — | ring | opacity .5 | spinner |
| danger | bg `--danger`, text `--fg-inverse` | darken 8% (`color-mix`) | scale .98 | ring | opacity .5 | spinner |
| success | bg `--success`, text `--fg-inverse` | darken 8% | scale .98 | ring | opacity .5 | spinner |

### 7.2 Input / Textarea / Select (`ui/input.tsx`, …)
h-12, radius-md, 1 px `--border-strong`, bg `--surface`, `text-base`, px-4. Label above (`text-sm` 500 `--fg`), helper below (`text-sm --fg-subtle`).
States: **F** border `--primary` + 3 px ring `--primary-soft` · **E** border `--danger`, helper replaced by error text `--danger` with a 16 px alert icon, `aria-invalid`, `aria-describedby` · **X** bg `--surface-2`, text `--fg-subtle` · Read-only: no border, bg `--surface-2`.
PIN input: `inputmode="numeric"`, `autocomplete="current-password"` (login) / `"new-password"` (change), letter-spacing .3em, eye toggle button (44 px) inside the right edge.
Mobile input: `type="tel"`, `autocomplete="tel-national"`, `inputmode="numeric"`.

### 7.3 Copy field (`ui/copy-field.tsx`)
Monospace-number value (`--font-num`) + **Copy** ghost button. After copy: icon → check, label "Copied" for 2 s, toast. Fallback when the Clipboard API is unavailable: select the text and show "Press and hold to copy".

### 7.4 Card (`ui/card.tsx`)
bg `--surface`, radius-lg, `--shadow-sm` (light) / 1 px `--border` (dark), padding per §4.1. Interactive card: H border `--border-strong`, F ring, whole card is a link with one inner primary button at most.

### 7.5 Badge / StatusTag (`ui/badge.tsx`)
h-6, px-2, radius-sm, `text-xs` 600, soft bg + strong text. Variants: `success | danger | warning | info | teal | neutral | primary`. Exam card tags: Upcoming=warning, **Live Now**=danger with an 8 px pulsing dot, Completed=success, Missed=danger outline variant (transparent bg, 1 px border), Locked=neutral with a lock icon. Review tags: Correct=success, Incorrect=danger, Skipped=info.

### 7.6 Exam top bar (`exam/exam-top-bar.tsx`)
Height 56 px, sticky top-0, bg `--surface` at 95% + `backdrop-blur-sm`, bottom border, `--shadow-md` after scroll > 0. Contents: title (`text-base` 600, truncate) · sync icon (16 px) · Timer chip · Answered counter (`text-sm`, `--font-num`). Progress bar 3 px at the bottom edge: track `--surface-3`, fill `--primary`, width transition 180 ms.
**Timer chip states:** normal → bg `--surface-2`, text `--fg` · warning (≤ 300 s) → bg `--warning-soft`, text `--warning` · critical (≤ 60 s) → bg `--danger-soft`, text `--danger`, pulse · expired → "00:00" danger. `role="timer"`, `aria-live="off"`; screen-reader announcements at 5 min and 1 min via a separate polite live region.

### 7.7 Question card (`exam/question-card.tsx`)
Card with padding 16; header row: "Question {N}" (`text-sm` 600 `--fg-muted`) + ★ toggle (44×44 hit area). Stem `text-question` `--fg`; image max-height 280 px, `loading="lazy"`, `decoding="async"`, intrinsic width/height to prevent CLS, matte per §5 rule 4. Options stack gap 8.
| State | Visual |
| --- | --- |
| unanswered | default card |
| answered | 3 px left border `--primary` + small "Answered" check chip in the header (`text-xs`, `--primary`) |
| marked | ★ filled `--warning`; 3 px left border `--warning` if unanswered (answered+marked keeps primary border, star stays amber) |
| focused (keyboard nav) | focus ring on the card |
| exam closed (submitting) | options disabled (pointer-events none, opacity .7) |

### 7.8 Option row (`exam/option-row.tsx`)
`<button role="radio" aria-checked>` inside a `role="radiogroup"` per question (deselect is supported by re-tapping the checked radio, which is documented in the instructions). Min-height 56 px, full width, radius-md, 1 px `--border-strong`, bg `--surface`, padding 12/16, gap 12. Circled letter: 32 px circle, 1.5 px border `--border-strong`, `text-sm` 600.
| State | Container | Circle |
| --- | --- | --- |
| D | as above | outline, text `--fg-muted` |
| H | bg `--surface-2` | — |
| A | scale .99 | — |
| F | focus ring | — |
| **S** (selected) | bg `--primary-soft`, border `--primary-soft-border` + 2 px inset ring `--primary` | filled `--primary`, letter `--on-primary` |
| X | opacity .6 | — |
**Review variants** (`review/review-option-row.tsx`, non-interactive): `correct` → bg `--correct-option-bg`, border `--success`, circle filled `--success` with ✓ icon; `wrong-selected` → bg `--wrong-option-bg`, border `--danger`, circle filled `--danger` with ✗; `selected-neutral` (answers not yet published) → selected style without colour semantics; `neutral` → default.

### 7.9 Navigator FAB & sheet (`exam/question-navigator.tsx`)
FAB: 56 px circle, bg `--primary`, grid icon + small counter badge (unanswered count, `--danger` bg). Position: bottom 88 px (above the bottom bar) right 16 px; desktop bottom 24 right 24. Sheet: Radix Dialog styled as a bottom sheet (max-height 75vh, radius-xl top, drag handle 36×4 `--border-strong`), grid `grid-cols-6` (≥ 400 px: 8, desktop drawer: 5), cells 44×44, radius-md, `text-sm --font-num`.
Cell states: unanswered → 1 px `--border-strong`, text `--fg` · answered → bg `--primary`, text `--on-primary` · marked → 2 px ring `--warning` + tiny ★ corner (combinable) · current (closest card to viewport top) → 2 px `--fg` outline · review variants: correct `--success` fill, incorrect `--danger` fill, skipped `--info-soft` bg with `--info` text.

### 7.10 Bottom sticky bar (`exam/exam-bottom-bar.tsx`)
Height 72 px + `env(safe-area-inset-bottom)`, bg `--surface`, top border, `--shadow-md`. Left: "{x}/{n} answered"; right: **Submit** (`lg` primary, min-width 140). Hidden ≥ 1024 px.

### 7.11 Dialog & Sheet (`ui/dialog.tsx`, `ui/sheet.tsx`; Radix Dialog)
Dialog: max-width 440, radius-xl, padding 24, `--shadow-lg`, backdrop `--overlay`. On < 640 px dialogs render as bottom sheets. Focus trapped, Esc closes (except blocking modals: submit overlay, session-revoked modal), initial focus on the least destructive button. Title `text-lg` 600, body `text-base --fg-muted`, actions right-aligned (stacked full-width on mobile, primary last/bottom).

### 7.12 Toast (`ui/toast.tsx`; `sonner`)
Position bottom-center on mobile (above sticky bars), top-right on desktop. Variants success/error/warning/info with a left 4 px bar in the status colour; durations per `02_AppFlow.md` §7.

### 7.13 Banner (`ui/banner.tsx`)
Full-width strip, `text-sm`, icon + message + optional action. Variants: `offline` (warning-soft), `info`, `danger`. Offline banner sticks under the exam top bar (top 56 px).

### 7.14 Stat card (`review/stat-card.tsx`) & Marks figure
Stat card: soft bg of its status colour, radius-lg, padding 16, label `text-sm` 600 status colour, value `text-2xl --font-num` 700 status colour, 20 px icon. Grid: 2×2 on mobile, 4×1 ≥ 768.
Marks figure: `text-4xl --font-num` `{score}` + `text-xl --fg-muted` `/{total}`, inside a 120 px ring (SVG circle progress, stroke 10, colour by the percentage band per AppFlow §5.5).

### 7.15 Option statistics bar (`review/option-stats.tsx`)
Rows per option: letter (24 px) · track (h-2, radius-full, `--stat-bar-track`) with fill per §2.5 · percentage `text-xs --font-num` (right, 40 px). A final "Skipped" row. `aria-label` "Option A: 42 percent chose this".

### 7.16 Solution box (`review/solution-box.tsx`)
bg `--solution-bg`, 1 px `--solution-border`, radius-md, padding 16, header "Solution" (`text-sm` 700 `--success`) with a lightbulb icon; body `text-base --fg`.

### 7.17 Skeleton (`ui/skeleton.tsx`)
bg `--surface-2`, shimmer gradient to `--surface-3` 1.2 s (static under reduced motion), radius matches the target component.

### 7.18 Empty state (`ui/empty-state.tsx`)
Centred, 96 px illustration/icon (`--fg-subtle`), title `text-lg` 600, description `text-sm --fg-muted` max 36ch, optional single action button (secondary unless it is the screen's primary action).

### 7.19 Data table (admin, `admin/data-table.tsx`; TanStack Table headless)
Header `text-xs` 600 uppercase-English / normal-Bangla on `--surface-2`; rows 52 px, H bg `--surface-2`, S bg `--primary-soft`; sticky header; on < 768 px rows collapse into stacked cards (label: value). Pagination bar: "Showing 1–25 of 312" + prev/next.

### 7.20 Countdown (`ui/countdown.tsx`)
Segments DD:HH:MM:SS (drop leading zero units), `--font-num` tabular, each segment in a `--surface-2` tile on the homepage strip. Uses server time offset like the exam timer.

### 7.21 Header & Bottom nav (`layout/*`)
Header 60 px, bg `--surface`, bottom border; logo 28 px tall. Icon buttons 44 px. Bottom nav: 64 px + safe area, 4 equal tabs, icon 24 + label `text-xs`; active: icon/label `--primary` + 3 px top indicator; inactive `--fg-subtle`.

### 7.22 Sticky Enroll bar & FABs (marketing)
Enroll bar: 64 px + safe area, bg `--surface`, top border, full-width primary **Enroll Now** (lg). WhatsApp FAB: 56 px circle `--whatsapp`, positioned bottom 80 (above the bar) right 16; `aria-label="Chat on WhatsApp"`.

---

## 8. Content & Rich Text Rendering
- Question/option/explanation text format: **plain text with line breaks** + inline math `$…$` and display math `$$…$$` (KaTeX, `throwOnError:false`, `strict:"ignore"`, `trust:false`) + inline code with backticks and fenced code blocks (```) rendered in `--font-mono` on `--surface-2`. **No HTML, no Markdown headings, links or images in text** (images are separate fields). The renderer is `src/components/content/rich-text.tsx` and is shared by the exam, the review, the admin preview and the sample exam.
- Bangla and English may mix within one string; no special handling beyond the font stack.
- Numbers (timer, marks, counts, dates) use Latin digits in both locales.
- Date format: `bn` → `৭ নভেম্বর, রাত ৮:০০` is **not** used; both locales use Latin digits with localized month names via `Intl.DateTimeFormat(locale, {timeZone:'Asia/Dhaka', numberingSystem:'latn'})`, e.g. `bn`: "7 নভেম্বর, 8:00 PM", `en`: "7 Nov, 8:00 PM".
- Masked mobile format: `017XX-XXX-890` (first 3, last 3).

## 9. Accessibility Checklist (enforced in Phase 4)
- Every page has one `<h1>`; landmarks `header`, `nav`, `main`, `footer`.
- `lang` attribute on `<html>` follows the locale (`bn` / `en`).
- All interactive elements are reachable by keyboard; visible focus.
- Colour is never the only signal: correctness uses ✓/✗ icons and text tags; timer states also change the icon (clock → alarm).
- Live regions: autosave status changes (polite, throttled to 1 per 10 s), toasts, timer milestones.
- Touch targets ≥ 48 px; text resizes to 200% without loss of content.
- axe-core: 0 serious/critical violations on all public, student and exam pages.
