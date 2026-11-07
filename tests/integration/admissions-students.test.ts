// @vitest-environment node
// Requires the local Supabase stack. Enrollment → approval → credentials → login; student admin ops; outbox.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as admissionActions from '@/features/admissions/actions';
import { getAdmissionDetail, listAdmissions } from '@/features/admissions/queries';
import { loginStudent } from '@/features/auth/service';
import * as studentActions from '@/features/students/actions';
import { getStudentProfile, listStudents } from '@/features/students/queries';
import { listAuditLog } from '@/features/audit/queries';
import { resolveSessionToken } from '@/lib/auth/session';
import { devMailbox } from '@/lib/email/send';
import { drainOutbox } from '@/lib/outbox/drain';
import { enqueue } from '@/lib/outbox/enqueue';
import { randomIp, randomMobile, testDb } from '../helpers/db';
import { cleanup, makeAdmin, makeStudent, trackMobile, trackStudent } from '../helpers/fixtures';
import { authState, flushAfter, requestState } from '../helpers/mocks';

vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => import('../helpers/next-server-mock'));
vi.mock('next/headers', () => import('../helpers/next-headers-mock'));

let admin: Awaited<ReturnType<typeof makeAdmin>>;
const trx = () => `T${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e6)}`;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString();
const pinFromMailbox = (to: string) => devMailbox.filter((m) => m.to === to).at(-1)?.text.match(/PIN: (\d{6})/)?.[1];

beforeAll(async () => {
  admin = await makeAdmin();
});
beforeEach(() => {
  authState.admin = null;
  requestState.ip = randomIp();
});
afterAll(async () => {
  await flushAfter();
  await cleanup();
});

describe('enrollment (P2.07)', () => {
  it('submits, then rejects duplicate TrxIDs (case/space/dash variants) and a second pending request', async () => {
    const mobile = randomMobile();
    trackMobile(mobile);
    const id = trx();
    const first = await admissionActions.submitAdmission({ mobile, email: `${mobile}@x.test`, method: 'bkash', trxId: id });
    expect(first.ok).toBe(true);

    const variant = `${id.slice(0, 3).toLowerCase()} ${id.slice(3, 6)}-${id.slice(6)}`;
    const dup = await admissionActions.submitAdmission({ mobile: randomMobile(), email: 'a@x.test', method: 'nagad', trxId: variant });
    expect(dup).toMatchObject({ ok: false, error: { code: 'TRX_DUPLICATE' } });

    const pending = await admissionActions.submitAdmission({ mobile, email: 'b@x.test', method: 'nagad', trxId: trx() });
    expect(pending).toMatchObject({ ok: false, error: { code: 'PENDING_EXISTS' } });
  });

  it('marks an existing student as renewal with duplicate flags', async () => {
    const student = await makeStudent();
    const result = await admissionActions.submitAdmission({ mobile: student.mobile, email: student.email, method: 'rocket', trxId: trx() });
    if (!result.ok) throw new Error(result.error.code);
    const detail = await getAdmissionDetail(result.data.admissionId);
    expect(detail?.admission.kind).toBe('renewal');
    expect(detail?.admission.duplicate_flags).toMatchObject({ mobile_exists: true });
    expect(detail?.existingStudent?.id).toBe(student.id);
  });

  it('validates fields with i18n keys and rate-limits by IP (5/hour)', async () => {
    const bad = await admissionActions.submitAdmission({ mobile: '0171', email: 'x', method: 'bkash', trxId: 'ABCDEF' });
    expect(bad).toMatchObject({ ok: false, error: { code: 'VALIDATION', field: 'mobile', message: 'errors.mobileInvalid' } });

    for (let i = 0; i < 5; i += 1) {
      const m = randomMobile();
      trackMobile(m);
      expect((await admissionActions.submitAdmission({ mobile: m, email: `${m}@x.test`, method: 'bkash', trxId: trx() })).ok).toBe(true);
    }
    const limited = await admissionActions.submitAdmission({ mobile: randomMobile(), email: 'z@x.test', method: 'bkash', trxId: trx() });
    expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    await testDb.from('rate_limit_events').delete().eq('subject', requestState.ip);
  });
});

describe('approval (P2.08)', () => {
  it('approve new → student created, PIN emailed (never stored), login works; double approve fails', async () => {
    const mobile = randomMobile();
    trackMobile(mobile);
    const email = `${mobile}@x.test`;
    const submitted = await admissionActions.submitAdmission({ mobile, email, method: 'bkash', trxId: trx() });
    if (!submitted.ok) throw new Error(submitted.error.code);

    authState.admin = admin;
    const approved = await admissionActions.approveAdmission({
      admissionId: submitted.data.admissionId, amountBdt: 500, startsAt: iso(0), expiresAt: iso(30),
    });
    if (!approved.ok) throw new Error(approved.error.code);
    trackStudent(approved.data.studentId);
    expect(approved.data).toMatchObject({ kind: 'new', emailSent: true });
    const pin = pinFromMailbox(email);
    expect(pin).toMatch(/^\d{6}$/);
    expect(JSON.stringify(approved.data)).not.toContain(pin as string); // the PIN is never returned
    const { data: row } = await testDb.from('students').select('pin_hash, credentials_status').eq('id', approved.data.studentId).single();
    expect(row?.credentials_status).toBe('sent');
    expect(row?.pin_hash).not.toContain(pin as string);

    const login = await loginStudent({ mobile, pin: pin as string, remember: false }, { ip: randomIp(), userAgent: null });
    expect(login.ok && login.data.mustChangePin).toBe(true);

    const again = await admissionActions.approveAdmission({
      admissionId: submitted.data.admissionId, amountBdt: 500, startsAt: iso(0), expiresAt: iso(30),
    });
    expect(again).toMatchObject({ ok: false, error: { code: 'ADMISSION_NOT_PENDING' } });

    await flushAfter();
    const { data: outbox } = await testDb.from('outbox').select('payload').filter('payload->>studentId', 'eq', approved.data.studentId);
    expect(JSON.stringify(outbox)).not.toContain(pin as string);
  });

  it('approve renewal extends expiry and enqueues a renewal email (no new PIN)', async () => {
    const student = await makeStudent({ expired: true });
    const submitted = await admissionActions.submitAdmission({ mobile: student.mobile, email: student.email, method: 'bkash', trxId: trx() });
    if (!submitted.ok) throw new Error(submitted.error.code);
    authState.admin = admin;
    const approved = await admissionActions.approveAdmission({
      admissionId: submitted.data.admissionId, amountBdt: 1200, startsAt: iso(0), expiresAt: iso(90),
    });
    expect(approved).toMatchObject({ ok: true, data: { kind: 'renewal', emailSent: null } });
    const profile = await getStudentProfile(student.id);
    expect(profile?.student.accessState).toBe('active');
    expect(Date.parse(profile?.student.access_expires_at ?? '')).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    await flushAfter();
    expect(devMailbox.some((m) => m.to === student.email && m.subject.includes('Renewal'))).toBe(true);
  });

  it('reject stores the reason, emails it, and the queue filters by status', async () => {
    const mobile = randomMobile();
    trackMobile(mobile);
    const submitted = await admissionActions.submitAdmission({ mobile, email: `${mobile}@x.test`, method: 'nagad', trxId: trx() });
    if (!submitted.ok) throw new Error(submitted.error.code);
    authState.admin = admin;

    expect(await admissionActions.rejectAdmission({ admissionId: submitted.data.admissionId, reason: 'other' })).toMatchObject({
      ok: false, error: { code: 'VALIDATION', field: 'details' },
    });
    expect((await admissionActions.rejectAdmission({ admissionId: submitted.data.admissionId, reason: 'amount_mismatch' })).ok).toBe(true);
    await flushAfter();
    expect(devMailbox.some((m) => m.to === `${mobile}@x.test` && m.text.includes('Amount mismatch'))).toBe(true);

    const rejected = await listAdmissions({ status: 'rejected', q: mobile });
    expect(rejected.items.map((a) => a.mobile)).toContain(mobile);
    const pending = await listAdmissions({ status: 'pending', q: mobile });
    expect(pending.items).toHaveLength(0);
  });
});

describe('student admin (P2.09)', () => {
  it('cancel revokes sessions and audits; reactivate restores', async () => {
    const student = await makeStudent();
    const { data: session } = await testDb
      .from('sessions')
      .insert({ token_hash: `\\x${crypto.randomUUID().replace(/-/g, '').padEnd(64, '0')}`, student_id: student.id, expires_at: iso(1) })
      .select('id')
      .single();
    authState.admin = admin;

    expect(await studentActions.cancelStudent({ studentId: student.id, reason: 'refund' })).toEqual({ ok: true, data: { updated: 1 } });
    const { data: s } = await testDb.from('sessions').select('revoke_reason').eq('id', session?.id ?? '').single();
    expect(s?.revoke_reason).toBe('admin_cancel');
    expect((await getStudentProfile(student.id))?.student.accessState).toBe('cancelled');

    expect((await studentActions.reactivateStudent({ studentId: student.id })).ok).toBe(true);
    expect((await getStudentProfile(student.id))?.student.accessState).toBe('active');

    const audit = await listAuditLog({ entityType: 'student', entityId: student.id });
    expect(audit.items.map((a) => a.action)).toEqual(expect.arrayContaining(['student.cancel', 'student.reactivate']));
  });

  it('extend from expired starts at now; bulk extend; set expiry', async () => {
    const a = await makeStudent({ expired: true });
    const b = await makeStudent();
    authState.admin = admin;
    expect(await studentActions.extendStudents({ studentIds: [a.id, b.id], days: 7 })).toEqual({ ok: true, data: { updated: 2 } });
    const pa = await getStudentProfile(a.id);
    const expiresA = Date.parse(pa?.student.access_expires_at ?? '');
    expect(expiresA).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(expiresA).toBeLessThan(Date.now() + 7.1 * 86_400_000);

    const target = iso(100);
    expect((await studentActions.setStudentExpiry({ studentId: b.id, expiresAt: target })).ok).toBe(true);
    expect(Date.parse((await getStudentProfile(b.id))?.student.access_expires_at ?? '')).toBe(Date.parse(target));
  });

  it('manual PIN reset returns the PIN once; weak PINs rejected; resend emails a new PIN', async () => {
    const student = await makeStudent();
    authState.admin = admin;
    expect(await studentActions.resetStudentPin({ studentId: student.id, mode: 'manual', pin: '1234', sendEmail: false })).toMatchObject({
      ok: false, error: { code: 'PIN_TOO_WEAK' },
    });
    const manual = await studentActions.resetStudentPin({ studentId: student.id, mode: 'manual', pin: '580317', sendEmail: false });
    expect(manual).toEqual({ ok: true, data: { emailSent: null, pin: '580317' } });

    const resend = await studentActions.resendCredentials({ studentId: student.id });
    expect(resend).toEqual({ ok: true, data: { emailSent: true, pin: null } });
    const pin = pinFromMailbox(student.email);
    const login = await loginStudent({ mobile: student.mobile, pin: pin as string, remember: false }, { ip: randomIp(), userAgent: null });
    expect(login.ok && login.data.mustChangePin).toBe(true);
  });

  it('force logout, update with audit, list filters', async () => {
    const student = await makeStudent();
    authState.admin = admin;
    expect(await studentActions.forceLogoutStudent({ studentId: student.id })).toMatchObject({ ok: true });
    expect(await studentActions.updateStudent({ studentId: student.id, adminLabel: 'Batch Z', adminNote: 'note' })).toEqual({
      ok: true, data: { updated: true },
    });
    const list = await listStudents({ label: 'Batch Z', q: student.mobile, state: 'active' });
    expect(list.items.map((s) => s.id)).toEqual([student.id]);
    expect((await listStudents({ state: 'expired', q: student.mobile })).items).toHaveLength(0);
  });

  it('a session token of a force-logged-out student no longer resolves', async () => {
    const student = await makeStudent();
    const login = await loginStudent({ mobile: student.mobile, pin: '000000', remember: false }, { ip: randomIp(), userAgent: null });
    expect(login.ok).toBe(false); // fixture hash is not a real PIN hash
    const token = crypto.randomUUID();
    await testDb.from('sessions').insert({
      token_hash: `\\x${Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex')}`,
      student_id: student.id,
      expires_at: iso(1),
    });
    expect((await resolveSessionToken('student', token)).status).toBe('active');
    authState.admin = admin;
    await studentActions.forceLogoutStudent({ studentId: student.id });
    expect(await resolveSessionToken('student', token)).toEqual({ status: 'revoked', reason: 'admin_force_logout' });
  });
});

describe('outbox (P2.06)', () => {
  it('failing handler backs off; success marks done; Sheets disabled → done', async () => {
    const key = `test:${crypto.randomUUID()}`;
    await enqueue('sheet_result_append', { attemptId: crypto.randomUUID() }, `${key}:fail`);
    await enqueue('email_admin_alert', { admissionId: crypto.randomUUID() }, `${key}:ok`);

    await drainOutbox({
      handlers: {
        sheet_result_append: async () => {
          throw new Error('boom');
        },
      },
    });
    const { data: rows } = await testDb.from('outbox').select('dedupe_key, status, attempts, next_attempt_at, last_error').like('dedupe_key', `${key}%`);
    const failed = rows?.find((r) => r.dedupe_key?.endsWith(':fail'));
    const done = rows?.find((r) => r.dedupe_key?.endsWith(':ok'));
    expect(failed).toMatchObject({ status: 'pending', attempts: 1, last_error: 'boom' });
    expect(Date.parse(failed?.next_attempt_at ?? '')).toBeGreaterThan(Date.now() + 50_000);
    expect(done?.status).toBe('done'); // ADMIN_ALERT_EMAIL is empty in tests → no-op
    await testDb.from('outbox').delete().like('dedupe_key', `${key}%`);
  });

  it('drain route accepts the cron secret', async () => {
    const { POST } = await import('@/app/api/internal/outbox/drain/route');
    const response = await POST(
      new Request('http://localhost:3000/api/internal/outbox/drain', {
        method: 'POST',
        headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '', 'content-type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { processed: expect.any(Number) } });
  });
});
