/**
 * TS mirror of SQL `student_access_state()` (docs/05_Schema.md §8.1, docs/02_AppFlow.md §3.2).
 * Keep both in sync; tests/unit/access.test.ts pins the behaviour.
 */
export type AccessState = 'active' | 'expired' | 'cancelled' | 'suspended';

export type AccessSubject = {
  status: 'active' | 'suspended' | 'cancelled';
  access_starts_at: string;
  access_expires_at: string;
};

export function computeAccessState(student: AccessSubject, at: Date = new Date()): AccessState {
  if (student.status === 'suspended') return 'suspended';
  if (student.status === 'cancelled') return 'cancelled';
  const now = at.getTime();
  if (now < Date.parse(student.access_starts_at) || now >= Date.parse(student.access_expires_at)) {
    return 'expired';
  }
  return 'active';
}
