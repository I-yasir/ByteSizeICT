/**
 * TS mirror of SQL `exam_phase()` (docs/05_Schema.md §8.1, docs/02_AppFlow.md §3.4). Isomorphic.
 * Keep in sync with the SQL; tests/unit/exam-status.test.ts pins the behaviour.
 */
export type ExamPhase = 'draft' | 'archived' | 'scheduled' | 'live' | 'late_window' | 'closed';

export type PhaseSubject = {
  status: 'draft' | 'published' | 'archived';
  is_sample: boolean;
  access_mode: 'fixed' | 'window' | 'always';
  starts_at: string | null;
  live_ends_at: string | null;
  late_until: string | null;
};

export function computeExamPhase(exam: PhaseSubject, at: Date = new Date()): ExamPhase {
  if (exam.status === 'archived') return 'archived';
  if (exam.status === 'draft') return 'draft';
  if (exam.is_sample) return 'live';
  const now = at.getTime();
  if (exam.starts_at && now < Date.parse(exam.starts_at)) return 'scheduled';
  if (exam.live_ends_at && now < Date.parse(exam.live_ends_at)) return 'live';
  if (exam.access_mode === 'always') return 'late_window';
  if (exam.access_mode === 'window' && exam.late_until && now < Date.parse(exam.late_until)) return 'late_window';
  return 'closed';
}

/** Publish-time defaults (docs/02_AppFlow.md §6.8): fixed → live end, window → late_until, always → immediate. */
export function defaultPublishAt(exam: Pick<PhaseSubject, 'access_mode' | 'live_ends_at' | 'late_until'>): string | null {
  if (exam.access_mode === 'fixed') return exam.live_ends_at;
  if (exam.access_mode === 'window') return exam.late_until;
  return null;
}
