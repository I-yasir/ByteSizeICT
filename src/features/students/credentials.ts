import 'server-only';
import { createElement } from 'react';
import CredentialsEmail from '../../../emails/credentials';
import { logAdminAudit } from '@/features/audit/log';
import { getSetting } from '@/features/settings/queries';
import { check, unwrap } from '@/lib/actions';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { formatDhaka } from '@/lib/time';

/**
 * Sends login details with a freshly generated PIN (TRD §9.1). The PIN is passed in memory only and
 * is never stored or enqueued. Delivery is awaited so the admin sees success or failure
 * (docs/02_AppFlow.md §6.3); the outcome is recorded on `students.credentials_status`.
 */
export async function deliverCredentials(input: {
  studentId: string;
  pin: string;
  reason: 'welcome' | 'reset';
  adminId: string | null;
}): Promise<boolean> {
  const [student, brand] = await Promise.all([
    supabaseAdmin
      .from('students')
      .select('mobile, email, access_starts_at, access_expires_at')
      .eq('id', input.studentId)
      .single()
      .then(unwrap),
    getSetting('brand'),
  ]);

  const result = await sendEmail({
    to: student.email,
    subject:
      input.reason === 'welcome'
        ? `${brand.name}: আপনার লগইন তথ্য · Your login details`
        : `${brand.name}: নতুন পিন · Your new PIN`,
    react: createElement(CredentialsEmail, {
      brandName: brand.name,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      mobile: student.mobile,
      pin: input.pin,
      startsAt: formatDhaka(student.access_starts_at),
      expiresAt: formatDhaka(student.access_expires_at),
      reason: input.reason,
    }),
  });

  check(
    await supabaseAdmin
      .from('students')
      .update(
        result.ok
          ? { credentials_status: 'sent', credentials_sent_at: new Date().toISOString() }
          : { credentials_status: 'failed' },
      )
      .eq('id', input.studentId),
  );
  if (!result.ok) {
    await logAdminAudit({
      adminId: input.adminId,
      action: 'student.credentials_email_failed',
      entityType: 'student',
      entityId: input.studentId,
      meta: { error: result.error.slice(0, 300) },
    });
  }
  return result.ok;
}
