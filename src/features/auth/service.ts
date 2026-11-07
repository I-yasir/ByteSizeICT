import 'server-only';
import { type AccessState, computeAccessState } from '@/lib/auth/access';
import { MAX_PIN_FAILURES } from '@/lib/auth/constants';
import { verifyPassword } from '@/lib/auth/password';
import { dummyHash, hashSecret, validatePin, verifySecret } from '@/lib/auth/pin';
import { type CreatedSession, createSession, revokeStudentSessions } from '@/lib/auth/session';
import { type ActionResult, fail, ok, type RequestContext } from '@/lib/http';
import { checkLimit, clearHits, consume, recordHit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminLoginInput, StudentLoginInput } from './schemas';

/** Login and PIN flows (docs/05_Schema.md §7.1). Cookie handling stays in actions.ts. */

export type StudentLoginSuccess = {
  session: CreatedSession;
  studentId: string;
  mustChangePin: boolean;
  accessState: AccessState;
};

async function maxDevices(): Promise<number> {
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', 'auth').maybeSingle();
  const value = (data?.value ?? {}) as { maxDevices?: unknown };
  return value.maxDevices === 2 ? 2 : 1;
}

function dhakaDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(date);
}

export async function loginStudent(
  input: Pick<StudentLoginInput, 'mobile' | 'pin' | 'remember'>,
  ctx: RequestContext,
): Promise<ActionResult<StudentLoginSuccess>> {
  const ipStatus = await consume('login_ip', ctx.ip);
  if (ipStatus.limited) return fail('RATE_LIMITED');

  const failures = await checkLimit('login_fail_mobile', input.mobile);
  if (failures.limited) {
    return fail('LOCKED', { meta: { lockedUntil: failures.retryAt?.toISOString() } });
  }

  const { data: student, error } = await supabaseAdmin
    .from('students')
    .select('id, pin_hash, status, must_change_pin, access_starts_at, access_expires_at')
    .eq('mobile', input.mobile)
    .maybeSingle();
  if (error) throw error;

  // Unknown mobiles still pay the argon2 cost and record a failure: no account enumeration.
  const pinOk = student
    ? await verifySecret(student.pin_hash, input.pin)
    : (await verifySecret(await dummyHash(), input.pin)) && false;

  if (!student || !pinOk) {
    await recordHit('login_fail_mobile', input.mobile);
    const attemptsLeft = Math.max(0, MAX_PIN_FAILURES - (failures.count + 1));
    if (attemptsLeft === 0) {
      const locked = await checkLimit('login_fail_mobile', input.mobile);
      return fail('LOCKED', { meta: { lockedUntil: locked.retryAt?.toISOString() } });
    }
    return fail('INVALID_CREDENTIALS', { meta: { attemptsLeft } });
  }

  // Status is disclosed only after a correct PIN.
  if (student.status === 'suspended') return fail('SUSPENDED');

  await clearHits('login_fail_mobile', input.mobile);
  const session = await createSession({
    principal: 'student',
    principalId: student.id,
    remember: input.remember,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const [{ error: limitError }, { error: loginError }, { error: outboxError }] = await Promise.all([
    supabaseAdmin.rpc('enforce_session_limit', { p_student_id: student.id, p_max: await maxDevices() }),
    supabaseAdmin.from('students').update({ last_login_at: new Date().toISOString() }).eq('id', student.id),
    // Sheet "Last Login" mirror, at most once per student per Dhaka day.
    supabaseAdmin.from('outbox').upsert(
      {
        kind: 'sheet_student_upsert',
        payload: { studentId: student.id },
        dedupe_key: `sheet_student_upsert:login:${student.id}:${dhakaDate()}`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    ),
  ]);
  if (limitError) throw limitError;
  if (loginError) throw loginError;
  if (outboxError) throw outboxError;

  return ok({
    session,
    studentId: student.id,
    mustChangePin: student.must_change_pin,
    accessState: computeAccessState(student),
  });
}

/** Shared by the forced and voluntary PIN change. Keeps the current session, revokes the rest. */
async function setOwnPin(
  studentId: string,
  currentHash: string,
  newPin: string,
  currentSessionId: string,
): Promise<ActionResult<{ changed: true }>> {
  const validation = validatePin(newPin);
  if (!validation.ok) {
    return validation.reason === 'weak'
      ? fail('PIN_TOO_WEAK', { field: 'newPin' })
      : fail('VALIDATION', { field: 'newPin' });
  }
  if (await verifySecret(currentHash, newPin)) return fail('PIN_SAME_AS_OLD', { field: 'newPin' });

  const { error } = await supabaseAdmin
    .from('students')
    .update({ pin_hash: await hashSecret(newPin), must_change_pin: false, pin_updated_at: new Date().toISOString() })
    .eq('id', studentId);
  if (error) throw error;

  await revokeStudentSessions(studentId, 'pin_changed', currentSessionId);
  const { error: auditError } = await supabaseAdmin.rpc('log_audit', {
    p_actor: 'student',
    p_action: 'student.pin_changed_by_student',
    p_entity_type: 'student',
    p_entity_id: studentId,
    p_student: studentId,
  });
  if (auditError) throw auditError;
  return ok({ changed: true });
}

async function getPinHash(studentId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.from('students').select('pin_hash').eq('id', studentId).single();
  if (error) throw error;
  return data.pin_hash;
}

export async function changePinForced(
  studentId: string,
  sessionId: string,
  newPin: string,
): Promise<ActionResult<{ changed: true }>> {
  return setOwnPin(studentId, await getPinHash(studentId), newPin, sessionId);
}

export async function changePin(
  studentId: string,
  sessionId: string,
  currentPin: string,
  newPin: string,
): Promise<ActionResult<{ changed: true }>> {
  const currentHash = await getPinHash(studentId);
  if (!(await verifySecret(currentHash, currentPin))) {
    return fail('INVALID_CREDENTIALS', { field: 'currentPin' });
  }
  return setOwnPin(studentId, currentHash, newPin, sessionId);
}

export async function loginAdmin(
  input: Pick<AdminLoginInput, 'email' | 'password'>,
  ctx: RequestContext,
): Promise<ActionResult<{ session: CreatedSession; adminId: string }>> {
  const ipStatus = await consume('admin_login_ip', ctx.ip);
  if (ipStatus.limited) return fail('RATE_LIMITED');

  const failures = await checkLimit('admin_login_fail', input.email);
  if (failures.limited) {
    return fail('LOCKED', { meta: { lockedUntil: failures.retryAt?.toISOString() } });
  }

  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('id, password_hash, is_active')
    .eq('email', input.email)
    .maybeSingle();
  if (error) throw error;

  const passwordOk = admin
    ? (await verifyPassword(admin.password_hash, input.password)) && admin.is_active
    : (await verifyPassword(await dummyHash(), input.password)) && false;

  if (!admin || !passwordOk) {
    await recordHit('admin_login_fail', input.email);
    if (failures.count + 1 >= MAX_PIN_FAILURES) {
      const locked = await checkLimit('admin_login_fail', input.email);
      return fail('LOCKED', { meta: { lockedUntil: locked.retryAt?.toISOString() } });
    }
    // Admins get no attempts-left disclosure (docs/02_AppFlow.md §6.1).
    return fail('INVALID_CREDENTIALS', { message: 'errors.adminInvalidCredentials' });
  }

  await clearHits('admin_login_fail', input.email);
  const session = await createSession({
    principal: 'admin',
    principalId: admin.id,
    remember: false,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  const { error: updateError } = await supabaseAdmin
    .from('admins')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', admin.id);
  if (updateError) throw updateError;

  return ok({ session, adminId: admin.id });
}
