import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/en.json';
import { hidesEnrollBar } from '@/components/layout/public-chrome';
import { BottomNav, isTabActive } from '@/components/layout/student-chrome';
import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { countdownSegments, formatDate, formatTaka } from '@/lib/format';
import { I18nProvider } from '@/lib/i18n/client';

const pathname = vi.hoisted(() => ({ value: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

// en.json has the same shape as bn.json (check:i18n); the provider's type is derived from bn.json.
const wrap = (ui: ReactNode) => render(<I18nProvider locale="en" messages={messages as never}>{ui}</I18nProvider>);

describe('Button', () => {
  it('loading disables the button, marks it busy and shows a spinner', async () => {
    const onClick = vi.fn();
    wrap(<Button loading onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asChild renders the child element with button styling', () => {
    wrap(<Button asChild><a href="/enroll">Enroll</a></Button>);
    const link = screen.getByRole('link', { name: 'Enroll' });
    expect(link).toHaveAttribute('href', '/enroll');
    expect(link.className).toContain('bg-primary');
  });
});

describe('Field', () => {
  it('wires label, error and aria attributes', () => {
    wrap(<Field label="Mobile" error="Enter a valid mobile">{(p) => <Input {...p} />}</Field>);
    const input = screen.getByLabelText('Mobile');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid mobile');
  });
});

describe('Dialog', () => {
  it('traps focus inside and closes with Escape', async () => {
    const user = userEvent.setup();
    wrap(
      <>
        <button type="button">Outside</button>
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent title="Submit exam?">
            <button type="button">Confirm</button>
          </DialogContent>
        </Dialog>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit exam?' });
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocking dialogs ignore Escape and have no close button', async () => {
    const user = userEvent.setup();
    wrap(
      <Dialog defaultOpen>
        <DialogContent title="Submitting…" blocking>
          <p>Please wait</p>
        </DialogContent>
      </Dialog>,
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});

describe('BottomNav & chrome rules', () => {
  beforeEach(() => {
    pathname.value = '/dashboard';
  });

  it('highlights the active tab (including nested routes)', () => {
    pathname.value = '/exams/123';
    wrap(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Exams' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(isTabActive('/results', '/results')).toBe(true);
    expect(isTabActive('/resultsx', '/results')).toBe(false);
  });

  it('sticky Enroll bar is hidden on enroll, sample and login routes', () => {
    expect(['/enroll', '/enroll/success', '/sample', '/sample/result', '/login'].every(hidesEnrollBar)).toBe(true);
    expect(['/', '/routine', '/faq', '/enrolled'].some(hidesEnrollBar)).toBe(false);
  });
});

describe('Countdown & formatting', () => {
  it('drops leading zero units', () => {
    expect(countdownSegments(26 * 3600_000 + 61_000)).toEqual([['1', 'd'], ['02', 'h'], ['01', 'm'], ['01', 's']]);
    expect(countdownSegments(3 * 3600_000)).toEqual([['03', 'h'], ['00', 'm'], ['00', 's']]);
    expect(countdownSegments(65_000)).toEqual([['01', 'm'], ['05', 's']]);
    expect(countdownSegments(-5)).toEqual([['00', 'm'], ['00', 's']]);
  });

  it('uses the server clock offset and fires onComplete once', () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-07T12:00:00Z');
    vi.setSystemTime(new Date(now.getTime() + 3_600_000)); // device clock is an hour fast
    const done = vi.fn();
    wrap(<Countdown target="2026-11-07T12:00:05Z" serverNow={now.toISOString()} onComplete={done} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:05');
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    act(() => vi.advanceTimersByTime(3000));
    expect(done).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('formats Bangla dates and money with Latin digits in Dhaka time', () => {
    expect(formatDate('2026-11-07T14:00:00Z', 'bn', 'dateTime')).toMatch(/^7 নভে.*8:00/);
    expect(formatDate('2026-11-07T14:00:00Z', 'en', 'time')).toBe('8:00 pm');
    expect(formatTaka(1500, 'bn')).toBe('৳1,500');
  });
});
