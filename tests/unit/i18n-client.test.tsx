import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import bn from '../../messages/bn.json';
import en from '../../messages/en.json';
import { formatMessage, I18nProvider, useLocale, useTranslations } from '@/lib/i18n/client';

/** P4.20: the in-house client formatter must render every message the way next-intl did. */
describe('formatMessage', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(formatMessage('Answered {x}/{n}', { x: 3, n: 10 }, 'en')).toBe('Answered 3/10');
    expect(formatMessage('Hi {name}', {}, 'en')).toBe('Hi {name}');
  });

  it('handles ICU plural with # (the one plural in en.json)', () => {
    const msg = en.errors.invalidCredentials;
    expect(formatMessage(msg, { attemptsLeft: 1 }, 'en')).toContain('1 attempt ');
    expect(formatMessage(msg, { attemptsLeft: 4 }, 'en')).toContain('4 attempts');
    expect(formatMessage('{n, plural, =0 {none} other {# items}}', { n: 0 }, 'en')).toBe('none');
  });

  it('keeps Latin digits in Bangla (UI Spec §8)', () => {
    expect(formatMessage(bn.errors.invalidCredentials, { attemptsLeft: 4 }, 'bn')).toContain('4');
  });
});

describe('useTranslations', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider locale="bn" messages={bn}>
      {children}
    </I18nProvider>
  );

  it('scopes by namespace, supports has(), and returns the path for a missing key', () => {
    const { result } = renderHook(() => ({ t: useTranslations('examPage'), locale: useLocale() }), { wrapper });
    expect(result.current.locale).toBe('bn');
    expect(result.current.t('answeredCount', { x: 2, n: 5 })).toBe(bn.examPage.answeredCount.replace('{x}', '2').replace('{n}', '5'));
    expect(result.current.t.has('submit')).toBe(true);
    expect(result.current.t.has('nope')).toBe(false);
    expect(result.current.t('nope' as never)).toBe('examPage.nope');
  });

  it('throws without a provider', () => {
    expect(() => renderHook(() => useTranslations('common'))).toThrow(/I18nProvider/);
  });
});
