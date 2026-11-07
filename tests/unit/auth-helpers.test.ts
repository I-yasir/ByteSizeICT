// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeAccessState } from '@/lib/auth/access';
import { safeNextPath } from '@/lib/auth/next-path';
import { errorMessageKey, fail } from '@/lib/errors';
import { isValidMobile, maskMobile, normalizeMobile } from '@/lib/mobile';

describe('safeNextPath', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/exams/abc?x=1', '/exams/abc?x=1'],
    ['//evil.com', '/fallback'],
    ['/\\evil.com', '/fallback'],
    ['https://evil.com', '/fallback'],
    ['javascript:alert(1)', '/fallback'],
    ['/api/attempts/1', '/fallback'],
    ['/a\nb', '/fallback'],
    ['', '/fallback'],
    [undefined, '/fallback'],
    [42, '/fallback'],
  ])('%j → %j', (input, expected) => {
    expect(safeNextPath(input, '/fallback')).toBe(expected);
  });
});

describe('computeAccessState (mirrors SQL student_access_state)', () => {
  const at = new Date('2026-11-07T12:00:00Z');
  const base = { access_starts_at: '2026-11-01T00:00:00Z', access_expires_at: '2026-12-01T00:00:00Z' };

  it.each([
    [{ ...base, status: 'active' as const }, 'active'],
    [{ ...base, status: 'suspended' as const }, 'suspended'],
    [{ ...base, status: 'cancelled' as const }, 'cancelled'],
    [{ ...base, status: 'active' as const, access_expires_at: '2026-11-07T12:00:00Z' }, 'expired'],
    [{ ...base, status: 'active' as const, access_starts_at: '2026-11-08T00:00:00Z' }, 'expired'],
  ])('%#', (student, expected) => {
    expect(computeAccessState(student, at)).toBe(expected);
  });
});

describe('mobile helpers', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['017-1234 5678', '01712345678'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each([
    ['01712345678', true],
    ['01312345678', true],
    ['01212345678', false],
    ['0171234567', false],
    ['017123456789', false],
  ])('validates %s → %s', (input, expected) => {
    expect(isValidMobile(input)).toBe(expected);
  });

  it('masks as 017XX-XXX-678', () => {
    expect(maskMobile('01712345678')).toBe('017XX-XXX-678');
  });
});

describe('error envelope', () => {
  it('maps codes to i18n keys', () => {
    expect(errorMessageKey('TRX_DUPLICATE')).toBe('errors.trxDuplicate');
    expect(errorMessageKey('QUESTION_LOCKED_CORRECT_OPTION')).toBe('errors.questionLockedCorrectOption');
  });

  it('builds failures with optional field and meta', () => {
    expect(fail('INVALID_CREDENTIALS', { meta: { attemptsLeft: 2 } })).toEqual({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'errors.invalidCredentials', meta: { attemptsLeft: 2 } },
    });
  });
});
