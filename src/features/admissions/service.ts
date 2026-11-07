import 'server-only';
import { deliverCredentials } from '@/features/students/credentials';
import { check, SQL_NULL, ServiceError, unwrap } from '@/lib/actions';
import { generatePin, hashSecret } from '@/lib/auth/pin';
import { type RequestContext } from '@/lib/http';
import { consume } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ApproveAdmissionInput, REJECT_REASONS, SubmitAdmissionInput } from './schemas';

/** Enrollment and the admin approval flow (PRD V-06/V-07, A-03/A-04; docs/05_Schema.md §8.4). */

export async function submitAdmission(input: SubmitAdmissionInput, ctx: RequestContext): Promise<{ admissionId: string }> {
  if ((await consume('enroll_ip', ctx.ip)).limited) throw new ServiceError('RATE_LIMITED');
  const admissionId = unwrap(
    await supabaseAdmin.rpc('submit_admission', {
      p_mobile: input.mobile,
      p_email: input.email,
      p_method: input.method,
      p_trx: input.trxId,
      p_plan_id: input.planId ?? SQL_NULL,
      p_ip: ctx.ip === '0.0.0.0' ? SQL_NULL : ctx.ip,
    }),
  );
  return { admissionId };
}

export type ApprovalResult = { studentId: string; kind: 'new' | 'renewal'; email: string; emailSent: boolean | null };

/**
 * Approves an admission. For new students a 6-digit PIN is generated, only its hash is stored, and
 * the credentials email is sent before returning (`emailSent`); renewals get an outbox email.
 */
export async function approveAdmission(adminId: string, input: ApproveAdmissionInput): Promise<ApprovalResult> {
  const pin = generatePin();
  const rows = unwrap(
    await supabaseAdmin.rpc('approve_admission', {
      p_admission_id: input.admissionId,
      p_admin_id: adminId,
      p_plan_id: input.planId ?? SQL_NULL,
      p_amount_bdt: input.amountBdt,
      p_starts_at: input.startsAt,
      p_expires_at: input.expiresAt,
      p_pin_hash: await hashSecret(pin),
      p_note: input.note ?? SQL_NULL,
    }),
  );
  const row = rows[0];
  if (!row) throw new Error('approve_admission returned no row');

  const emailSent =
    row.kind === 'new' ? await deliverCredentials({ studentId: row.student_id, pin, reason: 'welcome', adminId }) : null;
  return { studentId: row.student_id, kind: row.kind, email: row.email, emailSent };
}

const REASON_TEXT: Record<(typeof REJECT_REASONS)[number], string> = {
  trx_not_found: 'TrxID not found',
  amount_mismatch: 'Amount mismatch',
  duplicate_payment: 'Duplicate payment',
  other: 'Other',
};

export async function rejectAdmission(
  adminId: string,
  input: { admissionId: string; reason: (typeof REJECT_REASONS)[number]; details: string | null; sendEmail: boolean },
): Promise<{ rejected: true }> {
  // "Other" requires details (schema); the stored reason is what the student sees in the email.
  const reason =
    input.reason === 'other'
      ? (input.details ?? REASON_TEXT.other)
      : input.details
        ? `${REASON_TEXT[input.reason]}: ${input.details}`
        : REASON_TEXT[input.reason];
  check(
    await supabaseAdmin.rpc('reject_admission', {
      p_admission_id: input.admissionId,
      p_admin_id: adminId,
      p_reason: reason,
      p_send_email: input.sendEmail,
    }),
  );
  return { rejected: true };
}
