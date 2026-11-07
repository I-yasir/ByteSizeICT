import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { type AccessState, computeAccessState } from './access';
import type { RevokeReason } from './constants';
import { getSession, revokeSession, type SessionAdmin, type SessionStudent } from './session';

/**
 * Authoritative auth checks (docs/02_AppFlow.md §1.4, docs/05_Schema.md §7.1). proxy.ts only
 * checks cookie presence; every guarded page, action and route calls one of these.
 */

export type StudentContext = {
  sessionId: string;
  student: SessionStudent;
  accessState: AccessState;
};

export type AdminContext = { sessionId: string; admin: SessionAdmin };

export type StudentAuth =
  | { ok: true; context: StudentContext }
  | { ok: false; code: 'UNAUTHENTICATED' | 'SESSION_REVOKED'; reason: RevokeReason | 'expired' | null };

/** Request-memoized student session lookup (no redirects). Suitable for actions and route handlers. */
export const getStudentAuth = cache(async (): Promise<StudentAuth> => {
  const lookup = await getSession('student');
  if (lookup.status === 'none') return { ok: false, code: 'UNAUTHENTICATED', reason: null };
  if (lookup.status === 'expired') return { ok: false, code: 'SESSION_REVOKED', reason: 'expired' };
  if (lookup.status === 'revoked') return { ok: false, code: 'SESSION_REVOKED', reason: lookup.reason };

  const student = lookup.principal;
  if (student.status === 'suspended') {
    await revokeSession(lookup.session.id, 'admin_suspend');
    return { ok: false, code: 'SESSION_REVOKED', reason: 'admin_suspend' };
  }
  return {
    ok: true,
    context: { sessionId: lookup.session.id, student, accessState: computeAccessState(student) },
  };
});

function loginRedirect(base: string, reason: string | null, next?: string): never {
  const params = new URLSearchParams();
  if (reason) params.set('reason', reason);
  if (next) params.set('next', next);
  const query = params.toString();
  redirect(query ? `${base}?${query}` : base);
}

type StudentGuardOptions = { allowMustChangePin?: boolean; currentPath?: string };

/** Server Components / layouts under (student). Redirects instead of returning errors. */
export async function requireStudent(options: StudentGuardOptions = {}): Promise<StudentContext> {
  const auth = await getStudentAuth();
  if (!auth.ok) loginRedirect('/login', auth.reason, options.currentPath);
  if (auth.context.student.must_change_pin && !options.allowMustChangePin) redirect('/change-pin');
  return auth.context;
}

/** Exam routes: additionally require access state `active` (otherwise /renew). */
export async function requireActiveStudent(options: StudentGuardOptions = {}): Promise<StudentContext> {
  const context = await requireStudent(options);
  if (context.accessState !== 'active') redirect('/renew');
  return context;
}

export async function getOptionalStudent(): Promise<StudentContext | null> {
  const auth = await getStudentAuth();
  return auth.ok ? auth.context : null;
}

export type AdminAuth =
  | { ok: true; context: AdminContext }
  | { ok: false; code: 'UNAUTHENTICATED' | 'SESSION_REVOKED'; reason: RevokeReason | 'expired' | null };

export const getAdminAuth = cache(async (): Promise<AdminAuth> => {
  const lookup = await getSession('admin');
  if (lookup.status === 'none') return { ok: false, code: 'UNAUTHENTICATED', reason: null };
  if (lookup.status === 'expired') return { ok: false, code: 'SESSION_REVOKED', reason: 'expired' };
  if (lookup.status === 'revoked') return { ok: false, code: 'SESSION_REVOKED', reason: lookup.reason };
  return { ok: true, context: { sessionId: lookup.session.id, admin: lookup.principal } };
});

export async function requireAdmin(options: { currentPath?: string } = {}): Promise<AdminContext> {
  const auth = await getAdminAuth();
  if (!auth.ok) loginRedirect('/admin/login', null, options.currentPath);
  return auth.context;
}
