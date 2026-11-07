import { type NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, STUDENT_COOKIE } from '@/lib/auth/constants';

/**
 * Cheap cookie-presence redirects only (TRD §1, docs/02_AppFlow.md §1.4). No DB access here:
 * the guards in src/lib/auth/guards.ts are authoritative.
 */
const STUDENT_PREFIXES = ['/dashboard', '/exams', '/attempts', '/results', '/profile', '/renew', '/change-pin'];

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const next = `${pathname}${search}`;

  if (matchesPrefix(pathname, '/admin') && !matchesPrefix(pathname, '/admin/login')) {
    if (!request.cookies.has(ADMIN_COOKIE)) {
      const url = new URL('/admin/login', request.url);
      url.searchParams.set('next', next);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (STUDENT_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix)) && !request.cookies.has(STUDENT_COOKIE)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/exams/:path*',
    '/attempts/:path*',
    '/results/:path*',
    '/profile/:path*',
    '/renew/:path*',
    '/change-pin/:path*',
    '/admin/:path*',
  ],
};
