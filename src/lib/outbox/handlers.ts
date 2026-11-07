import 'server-only';
import { createElement } from 'react';
import AdminNewAdmissionEmail from '../../../emails/admin-new-admission';
import AdmissionRejectedEmail from '../../../emails/admission-rejected';
import RenewalApprovedEmail from '../../../emails/renewal-approved';
import { getSetting } from '@/features/settings/queries';
import { computeAccessState } from '@/lib/auth/access';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { type CellValue, SHEET_TABS, type SheetsClient, sheets } from '@/lib/sheets/client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDhaka } from '@/lib/time';
import type { Json } from '@/types/database';
import type { OutboxKind } from './enqueue';

/**
 * One handler per outbox kind (docs/05_Schema.md §6). A handler throws to request a retry and
 * returns normally when the job is done (including "nothing to do", e.g. Sheets disabled).
 */
export type OutboxHandler = (payload: Json) => Promise<void>;

const str = (payload: Json, key: string): string => {
  const value = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload[key] : undefined;
  if (typeof value !== 'string') throw new Error(`outbox payload missing "${key}"`);
  return value;
};
const dhaka = (value: string | null | undefined) => (value ? formatDhaka(value) : '');

async function loadAdmission(id: string) {
  const { data, error } = await supabaseAdmin
    .from('admissions')
    .select('id, kind, mobile, email, payment_method, trx_id, amount_bdt, status, reviewed_at, reject_reason, plan:plans(name_en), student:students(access_starts_at, access_expires_at, credentials_status)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** Concept §8 column order: Mobile, Email, Payment Method, TrxID, Amount, Plan, Status, Approved On,
 *  Start Date, Expiry Date, PIN Sent, Last Login, Exams Taken, Avg Score. */
function admissionRow(a: Awaited<ReturnType<typeof loadAdmission>>): CellValue[] {
  return [
    a.mobile, a.email, a.payment_method, a.trx_id, a.amount_bdt, a.plan?.name_en ?? '', a.status,
    a.status === 'approved' ? dhaka(a.reviewed_at) : '', dhaka(a.student?.access_starts_at),
    dhaka(a.student?.access_expires_at), a.student?.credentials_status ?? '', '', '', '',
  ];
}

async function studentRow(studentId: string): Promise<{ mobile: string; row: CellValue[] }> {
  const [{ data: s, error }, { data: lastAdmission }, { data: attempts }] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('mobile, email, status, access_starts_at, access_expires_at, credentials_status, last_login_at, plan:plans(name_en)')
      .eq('id', studentId)
      .single(),
    supabaseAdmin
      .from('admissions')
      .select('payment_method, trx_id, amount_bdt, reviewed_at')
      .eq('student_id', studentId)
      .eq('status', 'approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('exam_attempts')
      .select('score, exam:exams(question_count, marks_per_question)')
      .eq('student_id', studentId)
      .neq('status', 'in_progress'),
  ]);
  if (error) throw error;
  const percents = (attempts ?? [])
    .map((a) => {
      const total = (a.exam?.question_count ?? 0) * Number(a.exam?.marks_per_question ?? 0);
      return total > 0 ? (Number(a.score) / total) * 100 : null;
    })
    .filter((value): value is number => value !== null);
  const avg = percents.length ? Math.round((percents.reduce((x, y) => x + y, 0) / percents.length) * 10) / 10 : '';
  return {
    mobile: s.mobile,
    row: [
      s.mobile, s.email, lastAdmission?.payment_method ?? '', lastAdmission?.trx_id ?? '', lastAdmission?.amount_bdt ?? '',
      s.plan?.name_en ?? '', computeAccessState(s), dhaka(lastAdmission?.reviewed_at), dhaka(s.access_starts_at),
      dhaka(s.access_expires_at), s.credentials_status, dhaka(s.last_login_at), percents.length, avg,
    ],
  };
}

export function createHandlers(client: SheetsClient = sheets): Record<OutboxKind, OutboxHandler> {
  return {
    async sheet_admission_append(payload) {
      const admission = await loadAdmission(str(payload, 'admissionId'));
      await client.appendRow(SHEET_TABS.admissions, admissionRow(admission));
    },

    async sheet_admission_update(payload) {
      const admission = await loadAdmission(str(payload, 'admissionId'));
      // TrxID is column D on the Admissions tab (TRD §9.2).
      await client.upsertRowByColumn(SHEET_TABS.admissions, 'D', admission.trx_id, admissionRow(admission));
    },

    async sheet_student_upsert(payload) {
      const { mobile, row } = await studentRow(str(payload, 'studentId'));
      await client.upsertRowByColumn(SHEET_TABS.students, 'A', mobile, row);
    },

    async sheet_result_append(payload) {
      const { data: a, error } = await supabaseAdmin
        .from('exam_attempts')
        .select('submitted_at, score, correct_count, incorrect_count, skipped_count, is_late, student:students(mobile), exam:exams(title, question_count, marks_per_question)')
        .eq('id', str(payload, 'attemptId'))
        .single();
      if (error) throw error;
      const total = (a.exam?.question_count ?? 0) * Number(a.exam?.marks_per_question ?? 0);
      await client.appendRow(SHEET_TABS.results, [
        dhaka(a.submitted_at), a.student?.mobile ?? '', a.exam?.title ?? '', Number(a.score), total,
        a.correct_count, a.incorrect_count, a.skipped_count, a.is_late ? 'yes' : 'no',
      ]);
    },

    async email_renewal(payload) {
      const [{ data: s, error }, brand] = await Promise.all([
        supabaseAdmin.from('students').select('mobile, email, access_expires_at').eq('id', str(payload, 'studentId')).single(),
        getSetting('brand'),
      ]);
      if (error) throw error;
      const result = await sendEmail({
        to: s.email,
        subject: `${brand.name}: রিনিউ সম্পন্ন · Renewal complete`,
        react: createElement(RenewalApprovedEmail, {
          brandName: brand.name,
          siteUrl: env.NEXT_PUBLIC_SITE_URL,
          mobile: s.mobile,
          expiresAt: formatDhaka(s.access_expires_at),
        }),
      });
      if (!result.ok) throw new Error(result.error);
    },

    async email_rejection(payload) {
      const [admission, brand, contact] = await Promise.all([
        loadAdmission(str(payload, 'admissionId')),
        getSetting('brand'),
        getSetting('contact'),
      ]);
      const result = await sendEmail({
        to: admission.email,
        subject: `${brand.name}: ভর্তির অনুরোধ · Enrollment request`,
        react: createElement(AdmissionRejectedEmail, {
          brandName: brand.name,
          trxId: admission.trx_id,
          reason: admission.reject_reason ?? '',
          whatsappUrl: contact.whatsapp,
        }),
      });
      if (!result.ok) throw new Error(result.error);
    },

    async email_admin_alert(payload) {
      if (!env.ADMIN_ALERT_EMAIL) return;
      const [admission, brand] = await Promise.all([loadAdmission(str(payload, 'admissionId')), getSetting('brand')]);
      const result = await sendEmail({
        to: env.ADMIN_ALERT_EMAIL,
        subject: `${brand.name}: new ${admission.kind} request (${admission.mobile})`,
        react: createElement(AdminNewAdmissionEmail, {
          brandName: brand.name,
          queueUrl: `${env.NEXT_PUBLIC_SITE_URL}/admin/admissions`,
          mobile: admission.mobile,
          kind: admission.kind,
          method: admission.payment_method,
          trxId: admission.trx_id,
          amountBdt: admission.amount_bdt,
        }),
      });
      if (!result.ok) throw new Error(result.error);
    },
  };
}
