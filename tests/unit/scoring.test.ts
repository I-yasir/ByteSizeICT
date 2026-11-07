import { describe, expect, it } from 'vitest';
import { computeScore } from '@/features/sample/service';

/** P4.12 scoring table (TRD §8.5); the same rows run in SQL in supabase/tests/scoring.test.sql. */
const rows: [string, { correct: number; incorrect: number; marksPerQuestion: number; negativeMark: number }, number][] = [
  ['no negative marking', { correct: 1, incorrect: 1, marksPerQuestion: 1, negativeMark: 0 }, 1],
  ['−0.25 per wrong', { correct: 1, incorrect: 2, marksPerQuestion: 1, negativeMark: 0.25 }, 0.5],
  ['−0.5 per wrong, net negative', { correct: 1, incorrect: 3, marksPerQuestion: 1, negativeMark: 0.5 }, -0.5],
  ['−1 per wrong', { correct: 1, incorrect: 1, marksPerQuestion: 1, negativeMark: 1 }, 0],
  ['all skipped', { correct: 0, incorrect: 0, marksPerQuestion: 1, negativeMark: 0.25 }, 0],
  ['all wrong is negative, not clamped', { correct: 0, incorrect: 4, marksPerQuestion: 1, negativeMark: 0.25 }, -1],
  ['fractional marks round to 2 dp', { correct: 2, incorrect: 2, marksPerQuestion: 0.75, negativeMark: 0.33 }, 0.84],
  ['float noise: 3 × 0.1 wrong', { correct: 0, incorrect: 3, marksPerQuestion: 1, negativeMark: 0.1 }, -0.3],
  ['2 marks per question', { correct: 3, incorrect: 1, marksPerQuestion: 2, negativeMark: 0.5 }, 5.5],
];

describe('computeScore', () => {
  it.each(rows)('%s', (_label, tally, expected) => {
    expect(computeScore(tally)).toBe(expected);
  });
});
