// @vitest-environment node
// Requires the local Supabase stack. P4.19: third-party failures never block the admin (TRD §9, ADR-05).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as admissionActions from '@/features/admissions/actions';
import * as settingsActions from '@/features/settings/actions';
import * as studentActions from '@/features/students/actions';
import type * as EmailModule from '@/lib/email/send';
import { sendEmail } from '@/lib/email/send';
import { drainOutbox } from '@/lib/outbox/drain';
import { enqueue } from '@/lib/outbox/enqueue';
import { createHandlers, type OutboxHandler } from '@/lib/outbox/handlers';
import { randomIp, randomMobile, testDb } from '../helpers/db';
import { cleanup, makeAdmin, trackMobile, trackStudent } from '../helpers/fixtures';
import { authState, flushAfter, requestState } from '../helpers/mocks';

vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => import('../helpers/next-server-mock'));
vi.mock('next/headers', () => import('../helpers/next-headers-mock'));
vi.mock('@/lib/email/send', async (importOriginal) => {
  const actual = await importOriginal<typeof EmailModule>();
  return { ...actual, sendEmail: vi.fn(actual.sendEmail) };
});

let admin: Awaited<ReturnType<typeof makeAdmin>>;
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeAll(async () => {
  admin = await makeAdmin();
});
beforeEach(() => {
  requestState.ip = randomIp();
  authState.admin = null;
});
afterAll(async () => {
  await flushAfter();
  await cleanup();
});

describe('Resend failure (P4.19)', () => {
  it('approval succeeds with emailSent=false, credentials_status=failed + audit; Resend credentials then works', async () => {
    const mobile = randomMobile();
    trackMobile(mobile);
    const submitted = await admissionActions.submitAdmission({ mobile, email: `${mobile}@x.test`, method: 'bkash', trxId: `RF${Date.now()}` });
    expect(submitted.ok).toBe(true);
    const admission = (await testDb.from('admissions').select('id').eq('mobile', mobile).single()).data;

    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, error: 'Resend is down' });
    authState.admin = admin;
    const approved = await admissionActions.approveAdmission({ admissionId: admission?.id, amountBdt: 500, startsAt: iso(0), expiresAt: iso(30) });
    expect(approved).toMatchObject({ ok: true, data: { emailSent: false } });

    const student = (await testDb.from('students').select('id, credentials_status').eq('mobile', mobile).single()).data;
    trackStudent(student?.id ?? '');
    expect(student?.credentials_status).toBe('failed');
    const audit = await testDb.from('audit_log').select('action').eq('entity_id', student?.id ?? '').eq('action', 'student.credentials_email_failed');
    expect(audit.data).toHaveLength(1);

    const resent = await studentActions.resendCredentials({ studentId: student?.id });
    expect(resent.ok).toBe(true);
    const after = (await testDb.from('students').select('credentials_status').eq('id', student?.id ?? '').single()).data;
    expect(after?.credentials_status).toBe('sent');
  });
});

describe('Google Sheets failure (P4.19)', () => {
  it('a 500 from Sheets backs the job off, keeps other kinds flowing, and Retry failed re-queues it', async () => {
    const key = `p419:${crypto.randomUUID()}`;
    const studentId = crypto.randomUUID();
    await enqueue('sheet_student_upsert', { studentId }, `${key}:sheet`);
    await enqueue('email_admin_alert', { admissionId: crypto.randomUUID() }, `${key}:email`);
    // Only this job sees the 500; other queued jobs (local backlog) go through the real handler.
    const real = createHandlers().sheet_student_upsert;
    const sheets500: OutboxHandler = async (payload) => {
      if ((payload as { studentId?: string }).studentId === studentId) throw new Error('Sheets API 500: Internal error');
      await real(payload);
    };

    const attempted = async () => (await testDb.from('outbox').select('attempts').eq('dedupe_key', `${key}:sheet`).single()).data?.attempts ?? 0;
    for (let round = 0; round < 10 && (await attempted()) === 0; round++) {
      await drainOutbox({ limit: 50, handlers: { sheet_student_upsert: sheets500 } });
    }
    const rows = (await testDb.from('outbox').select('dedupe_key, status, attempts, next_attempt_at, last_error').like('dedupe_key', `${key}%`)).data ?? [];
    const sheet = rows.find((r) => r.dedupe_key?.endsWith(':sheet'));
    expect(sheet).toMatchObject({ status: 'pending', attempts: 1, last_error: 'Sheets API 500: Internal error' });
    expect(Date.parse(sheet?.next_attempt_at ?? '')).toBeGreaterThan(Date.now() + 50_000);
    expect(rows.find((r) => r.dedupe_key?.endsWith(':email'))?.status).toBe('done');

    // Exhaust the retries → failed; the admin's Retry failed puts it back in the queue.
    await testDb.from('outbox').update({ status: 'failed', attempts: 8 }).eq('dedupe_key', `${key}:sheet`).throwOnError();
    authState.admin = admin;
    const retried = await settingsActions.retryFailedOutbox({});
    expect(retried.ok && retried.data.requeued).toBeGreaterThanOrEqual(1);
    const requeued = (await testDb.from('outbox').select('status, attempts').eq('dedupe_key', `${key}:sheet`).single()).data;
    expect(requeued).toMatchObject({ status: 'pending', attempts: 0 });
    await testDb.from('outbox').delete().like('dedupe_key', `${key}%`);
  });
});
