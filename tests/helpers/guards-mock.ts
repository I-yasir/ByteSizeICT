import type { AdminAuth, StudentAuth } from '@/lib/auth/guards';
import { authState } from './mocks';

/** Replacement for '@/lib/auth/guards' driven by `authState`. */
export async function getAdminAuth(): Promise<AdminAuth> {
  return authState.admin ? { ok: true, context: authState.admin } : { ok: false, code: 'UNAUTHENTICATED', reason: null };
}

export async function getStudentAuth(): Promise<StudentAuth> {
  return authState.student ? { ok: true, context: authState.student } : { ok: false, code: 'UNAUTHENTICATED', reason: null };
}

export async function requireAdmin() {
  if (!authState.admin) throw new Error('NEXT_REDIRECT /admin/login');
  return authState.admin;
}

export async function requireStudent() {
  if (!authState.student) throw new Error('NEXT_REDIRECT /login');
  return authState.student;
}

export const requireActiveStudent = requireStudent;
export async function getOptionalStudent() {
  return authState.student;
}
