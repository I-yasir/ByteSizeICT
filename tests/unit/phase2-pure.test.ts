// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeStreak } from '@/features/dashboard/queries';
import type { ExamCard } from '@/features/exams/student-queries';
import { computeExamPhase, defaultPublishAt, type PhaseSubject } from '@/features/exams/status';
import { submitAdmissionSchema } from '@/features/admissions/schemas';
import { questionInputSchema } from '@/features/questions/schemas';
import { renderRichText } from '@/lib/content/render';
import { dhakaDateKey, startOfDhakaDay, startOfDhakaMonth } from '@/lib/time';
import { emailSchema, mobileSchema, sanitizeSearch, trxIdSchema } from '@/lib/validation';

describe('shared schemas (P2.01)', () => {
  it.each([
    ['+8801712345678', '01712345678'],
    ['01712 345-678', '01712345678'],
  ])('mobile %s → %s', (input, out) => expect(mobileSchema.parse(input)).toBe(out));

  it.each(['0171234567', '01212345678', 'abc'])('rejects mobile %s with the i18n key', (input) => {
    const result = mobileSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('errors.mobileInvalid');
  });

  it('normalises email and TrxID', () => {
    expect(emailSchema.parse('  Rafi@Example.COM ')).toBe('rafi@example.com');
    expect(trxIdSchema.parse(' 8N7A 6B5C-4D ')).toBe('8N7A6B5C-4D');
    expect(trxIdSchema.safeParse('ab12').success).toBe(false);
    expect(trxIdSchema.safeParse('AB12$%34').success).toBe(false);
  });

  it('enrollment form has exactly four required fields (no name)', () => {
    const result = submitAdmissionSchema.parse({ mobile: '01712345678', email: 'a@b.co', method: 'bkash', trxId: 'ABC123' });
    expect(result).toEqual({ mobile: '01712345678', email: 'a@b.co', method: 'bkash', trxId: 'ABC123', planId: null });
    expect(submitAdmissionSchema.safeParse({ mobile: '01712345678', email: 'a@b.co', trxId: 'ABC123' }).success).toBe(false);
  });

  it('question input requires text or image for every option', () => {
    const base = { chapterId: crypto.randomUUID(), stem: 'Q', optionA: 'a', optionB: 'b', optionC: 'c', optionD: '', correctOption: 'A' };
    expect(questionInputSchema.safeParse(base).error?.issues[0]?.path).toEqual(['optionD']);
    expect(questionInputSchema.safeParse({ ...base, optionDImagePath: `questions/${crypto.randomUUID()}.png` }).success).toBe(true);
  });

  it('sanitizes PostgREST search input', () => {
    expect(sanitizeSearch('017),status.eq.active')).toBe('017status.eq.active');
    expect(sanitizeSearch('রাফি@mail.com')).toBe('রাফি@mail.com');
  });
});

describe('renderRichText (P2.11)', () => {
  it('escapes HTML', () => {
    const html = renderRichText('<script>alert(1)</script> & <img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders math with KaTeX and keeps Bangla', () => {
    const html = renderRichText('$(1011)_2$ এর মান কত?');
    expect(html).toContain('class="katex"');
    expect(html).toContain('এর মান কত?');
  });

  it('does not allow script URLs or raw HTML through math', () => {
    const html = renderRichText('$\\href{javascript:alert(1)}{x}$ $<img src=x onerror=alert(1)>$');
    expect(html).not.toMatch(/href="javascript/i);
    expect(html).not.toContain('<img');
  });

  it('renders code, display math, line breaks and escaped dollars', () => {
    const html = renderRichText('Price \\$5\nUse `<br>`\n$$a^2$$\n```\nint x = 1;\n```');
    expect(html).toContain('Price $5<br>');
    expect(html).toContain('<code class="rt-code">&lt;br&gt;</code>');
    expect(html).toContain('katex-display');
    expect(html).toContain('<pre class="rt-pre"><code>int x = 1;</code></pre>');
  });
});

describe('computeExamPhase (mirrors SQL exam_phase)', () => {
  const at = new Date('2026-11-07T12:00:00Z');
  const base: PhaseSubject = {
    status: 'published', is_sample: false, access_mode: 'fixed',
    starts_at: '2026-11-07T11:00:00Z', live_ends_at: '2026-11-07T13:00:00Z', late_until: null,
  };
  it.each([
    [{ ...base, status: 'draft' as const }, 'draft'],
    [{ ...base, status: 'archived' as const }, 'archived'],
    [{ ...base, starts_at: '2026-11-07T12:30:00Z' }, 'scheduled'],
    [base, 'live'],
    [{ ...base, live_ends_at: '2026-11-07T11:30:00Z' }, 'closed'],
    [{ ...base, live_ends_at: '2026-11-07T11:30:00Z', access_mode: 'always' as const }, 'late_window'],
    [{ ...base, live_ends_at: '2026-11-07T11:30:00Z', access_mode: 'window' as const, late_until: '2026-11-08T00:00:00Z' }, 'late_window'],
    [{ ...base, is_sample: true, starts_at: null, live_ends_at: null }, 'live'],
  ])('%#', (exam, phase) => expect(computeExamPhase(exam, at)).toBe(phase));

  it('publish-time defaults', () => {
    expect(defaultPublishAt({ access_mode: 'fixed', live_ends_at: 'L', late_until: null })).toBe('L');
    expect(defaultPublishAt({ access_mode: 'window', live_ends_at: 'L', late_until: 'W' })).toBe('W');
    expect(defaultPublishAt({ access_mode: 'always', live_ends_at: 'L', late_until: null })).toBeNull();
  });
});

describe('Dhaka time helpers', () => {
  it('uses UTC+6 day and month boundaries', () => {
    const lateNightUtc = new Date('2026-11-07T19:30:00Z'); // 01:30 on 8 Nov in Dhaka
    expect(dhakaDateKey(lateNightUtc)).toBe('2026-11-08');
    expect(startOfDhakaDay(lateNightUtc).toISOString()).toBe('2026-11-07T18:00:00.000Z');
    expect(startOfDhakaMonth(new Date('2026-11-30T19:00:00Z')).toISOString()).toBe('2026-11-30T18:00:00.000Z');
  });
});

describe('computeStreak (dashboard)', () => {
  const card = (startsAt: string, attempt: 'on_time' | 'late' | 'none'): ExamCard => ({
    examId: crypto.randomUUID(), title: 't', chapterLabel: null, startsAt,
    liveEndsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(), lateUntil: null, accessMode: 'fixed',
    durationMinutes: 30, questionCount: 1, totalMarks: 1, negativeMark: 0, phase: 'closed', status: 'completed',
    attemptId: attempt === 'none' ? null : crypto.randomUUID(),
    attemptStatus: attempt === 'none' ? null : 'submitted', score: 1, isLate: attempt === 'none' ? null : attempt === 'late',
  });
  const now = new Date('2026-11-10T00:00:00Z');

  it('counts consecutive on-time attempts from the newest closed window', () => {
    const cards = [card('2026-11-09T10:00:00Z', 'on_time'), card('2026-11-08T10:00:00Z', 'on_time'), card('2026-11-07T10:00:00Z', 'none'), card('2026-11-06T10:00:00Z', 'on_time')];
    expect(computeStreak(cards, '2026-11-01T00:00:00Z', now)).toBe(2);
  });

  it('a late attempt breaks the streak; exams before access started are ignored', () => {
    expect(computeStreak([card('2026-11-09T10:00:00Z', 'late')], '2026-11-01T00:00:00Z', now)).toBe(0);
    expect(computeStreak([card('2026-11-09T10:00:00Z', 'on_time'), card('2026-10-01T10:00:00Z', 'none')], '2026-11-01T00:00:00Z', now)).toBe(1);
  });
});
