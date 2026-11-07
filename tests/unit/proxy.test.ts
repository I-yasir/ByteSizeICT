// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

function run(path: string, cookie?: string) {
  const request = new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return proxy(request);
}

describe('proxy (cookie-presence redirects)', () => {
  it('redirects a student route without a cookie to /login with next', () => {
    const response = run('/dashboard?tab=1');
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/dashboard?tab=1');
  });

  it.each(['/exams/x', '/attempts/y/result', '/results', '/profile', '/renew', '/change-pin'])(
    'guards %s',
    (path) => {
      expect(new URL(run(path).headers.get('location') ?? '').pathname).toBe('/login');
    },
  );

  it('lets a student route through with a session cookie', () => {
    expect(run('/dashboard', 'bsi_session=abc').headers.get('location')).toBeNull();
  });

  it('redirects admin routes to /admin/login and keeps the login page open', () => {
    expect(new URL(run('/admin/students').headers.get('location') ?? '').pathname).toBe('/admin/login');
    expect(run('/admin/login').headers.get('location')).toBeNull();
  });

  it('does not accept a student cookie for admin routes', () => {
    expect(run('/admin', 'bsi_session=abc').headers.get('location')).not.toBeNull();
    expect(run('/admin', 'bsi_admin=abc').headers.get('location')).toBeNull();
  });

  it('ignores lookalike paths', () => {
    expect(run('/dashboards').headers.get('location')).toBeNull();
  });
});
