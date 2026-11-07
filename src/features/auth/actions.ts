'use server';

import { getAdminAuth, getStudentAuth } from '@/lib/auth/guards';
import { safeNextPath } from '@/lib/auth/next-path';
import { clearSessionCookie, revokeSession, setSessionCookie } from '@/lib/auth/session';
import { type ActionResult, fail, failFromZod, getRequestContext, ok } from '@/lib/http';
import { adminLoginSchema, changePinForcedSchema, changePinSchema, studentLoginSchema } from './schemas';
import * as service from './service';

/** Auth Server Actions (TRD §7.2). The client navigates to `redirectTo` on success. */
type Redirect = { redirectTo: string };

export async function studentLogin(raw: unknown): Promise<ActionResult<Redirect>> {
  const parsed = studentLoginSchema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);

  const result = await service.loginStudent(parsed.data, await getRequestContext());
  if (!result.ok) return result;

  await setSessionCookie('student', result.data.session);
  const { mustChangePin, accessState } = result.data;
  const redirectTo = mustChangePin
    ? '/change-pin'
    : accessState === 'active'
      ? safeNextPath(parsed.data.next, '/dashboard')
      : '/renew';
  return ok({ redirectTo });
}

export async function studentLogout(): Promise<ActionResult<Redirect>> {
  const auth = await getStudentAuth();
  if (auth.ok) await revokeSession(auth.context.sessionId, 'logout');
  await clearSessionCookie('student');
  return ok({ redirectTo: '/login' });
}

export async function changePinForced(raw: unknown): Promise<ActionResult<Redirect>> {
  const auth = await getStudentAuth();
  if (!auth.ok) return fail(auth.code);
  const parsed = changePinForcedSchema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);

  const { student, sessionId, accessState } = auth.context;
  const result = await service.changePinForced(student.id, sessionId, parsed.data.newPin);
  if (!result.ok) return result;
  return ok({ redirectTo: accessState === 'active' ? '/dashboard' : '/renew' });
}

export async function changePin(raw: unknown): Promise<ActionResult<{ changed: true }>> {
  const auth = await getStudentAuth();
  if (!auth.ok) return fail(auth.code);
  const parsed = changePinSchema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);

  const { student, sessionId } = auth.context;
  return service.changePin(student.id, sessionId, parsed.data.currentPin, parsed.data.newPin);
}

export async function adminLogin(raw: unknown): Promise<ActionResult<Redirect>> {
  const parsed = adminLoginSchema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);

  const result = await service.loginAdmin(parsed.data, await getRequestContext());
  if (!result.ok) return result;

  await setSessionCookie('admin', result.data.session);
  return ok({ redirectTo: safeNextPath(parsed.data.next, '/admin') });
}

export async function adminLogout(): Promise<ActionResult<Redirect>> {
  const auth = await getAdminAuth();
  if (auth.ok) await revokeSession(auth.context.sessionId, 'logout');
  await clearSessionCookie('admin');
  return ok({ redirectTo: '/admin/login' });
}
