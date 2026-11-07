import 'server-only';
import { logAdminAudit } from '@/features/audit/log';
import { check, ServiceError, SQL_NULL, unwrap } from '@/lib/actions';
import { generatePin, hashSecret, validatePin } from '@/lib/auth/pin';
import { enqueue } from '@/lib/outbox/enqueue';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { deliverCredentials } from './credentials';

/** Admin student operations (PRD A-05). Access changes are audited inside SQL functions. */
type AccessOp = 'extend' | 'set_expiry' | 'cancel' | 'suspend' | 'reactivate';

async function updateAccess(
  adminId: string,
  studentIds: string[],
  op: AccessOp,
  options: { days?: number; expiresAt?: string; reason?: string } = {},
): Promise<{ updated: number }> {
  const updated = unwrap(
    await supabaseAdmin.rpc('admin_update_student_access', {
      p_admin_id: adminId,
      p_student_ids: studentIds,
      p_op: op,
      p_days: options.days ?? SQL_NULL,
      p_expires_at: options.expiresAt ?? SQL_NULL,
      p_reason: options.reason ?? SQL_NULL,
    }),
  );
  return { updated };
}

export const extendStudents = (adminId: string, studentIds: string[], days: number) =>
  updateAccess(adminId, studentIds, 'extend', { days });
export const setStudentExpiry = (adminId: string, studentId: string, expiresAt: string) =>
  updateAccess(adminId, [studentId], 'set_expiry', { expiresAt });
export const cancelStudent = (adminId: string, studentId: string, reason: string) =>
  updateAccess(adminId, [studentId], 'cancel', { reason });
export const suspendStudent = (adminId: string, studentId: string, reason: string) =>
  updateAccess(adminId, [studentId], 'suspend', { reason });
export const reactivateStudent = (adminId: string, studentId: string) =>
  updateAccess(adminId, [studentId], 'reactivate');

export type PinResetResult = {
  emailSent: boolean | null;
  /** Plaintext PIN, returned once only when the admin must see it (manual PIN, or no email sent). */
  pin: string | null;
};

/**
 * Reset PIN / resend credentials (docs/02_AppFlow.md §6.4): new hash, must_change_pin, all sessions
 * revoked. The PIN is shown to the admin only when it was admin-chosen or no email is sent.
 */
export async function resetStudentPin(
  adminId: string,
  input: { studentId: string; mode: 'auto' | 'manual'; pin?: string | undefined; sendEmail: boolean },
  action: 'student.pin_reset' | 'student.credentials_resend' = 'student.pin_reset',
): Promise<PinResetResult> {
  let pin: string;
  if (input.mode === 'manual') {
    const validation = validatePin(input.pin ?? '');
    if (!validation.ok) {
      throw new ServiceError(validation.reason === 'weak' ? 'PIN_TOO_WEAK' : 'VALIDATION', { field: 'pin' });
    }
    pin = input.pin as string;
  } else {
    pin = generatePin();
  }

  check(
    await supabaseAdmin.rpc('admin_set_student_pin', {
      p_admin_id: adminId,
      p_student_id: input.studentId,
      p_pin_hash: await hashSecret(pin),
      p_action: action,
    }),
  );

  const emailSent = input.sendEmail
    ? await deliverCredentials({ studentId: input.studentId, pin, reason: 'reset', adminId })
    : null;
  return { emailSent, pin: input.mode === 'manual' || !input.sendEmail ? pin : null };
}

export const resendCredentials = (adminId: string, studentId: string) =>
  resetStudentPin(adminId, { studentId, mode: 'auto', sendEmail: true }, 'student.credentials_resend');

export async function forceLogoutStudent(adminId: string, studentId: string): Promise<{ revoked: number }> {
  const revoked = unwrap(
    await supabaseAdmin.rpc('revoke_sessions', { p_reason: 'admin_force_logout', p_student_id: studentId }),
  );
  await logAdminAudit({ adminId, action: 'student.force_logout', entityType: 'student', entityId: studentId, meta: { revoked } });
  return { revoked };
}

export async function updateStudent(
  adminId: string,
  input: { studentId: string; email?: string | undefined; adminLabel?: string | null | undefined; adminNote?: string | null | undefined },
): Promise<{ updated: true }> {
  const before = unwrap(
    await supabaseAdmin.from('students').select('email, admin_label, admin_note').eq('id', input.studentId).maybeSingle(),
  );
  if (!before) throw new ServiceError('NOT_FOUND');

  const patch: { email?: string; admin_label?: string | null; admin_note?: string | null } = {};
  if (input.email !== undefined) patch.email = input.email;
  if (input.adminLabel !== undefined) patch.admin_label = input.adminLabel;
  if (input.adminNote !== undefined) patch.admin_note = input.adminNote;
  if (Object.keys(patch).length === 0) return { updated: true };

  check(await supabaseAdmin.from('students').update(patch).eq('id', input.studentId));
  await logAdminAudit({ adminId, action: 'student.update', entityType: 'student', entityId: input.studentId, before, after: patch });
  if (patch.email && patch.email !== before.email) {
    await enqueue('sheet_student_upsert', { studentId: input.studentId });
  }
  return { updated: true };
}
