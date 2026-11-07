// @vitest-environment node
// Requires the local Supabase stack (`pnpm db:start`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, hashToken, resolveSessionToken, revokeSession, revokeStudentSessions } from '@/lib/auth/session';
import { checkLimit, clearHits, consume, recordHit } from '@/lib/rate-limit';
import { createStudent, deleteStudent, randomIp, testDb } from '../helpers/db';

let student: { id: string; mobile: string };

beforeAll(async () => {
  student = await createStudent({ pinHash: 'x' });
});
afterAll(async () => {
  await deleteStudent(student.id, student.mobile);
});

describe('session lifecycle', () => {
  it('creates → resolves → revokes', async () => {
    const created = await createSession({
      principal: 'student',
      principalId: student.id,
      remember: true,
      ip: '10.0.0.1',
      userAgent: 'vitest',
    });
    expect(created.token.length).toBeGreaterThanOrEqual(43);
    expect(created.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 3600 * 1000);

    const { data: row } = await testDb.from('sessions').select('token_hash').eq('id', created.sessionId).single();
    expect(row?.token_hash).toBe(hashToken(created.token)); // only the hash is stored
    expect(row?.token_hash).not.toContain(created.token);

    const active = await resolveSessionToken('student', created.token);
    expect(active.status).toBe('active');
    if (active.status === 'active') expect(active.principal.mobile).toBe(student.mobile);

    await revokeSession(created.sessionId, 'logout');
    expect(await resolveSessionToken('student', created.token)).toEqual({ status: 'revoked', reason: 'logout' });
  });

  it('does not resolve a student token as an admin session', async () => {
    const created = await createSession({ principal: 'student', principalId: student.id, remember: false, ip: null, userAgent: null });
    expect((await resolveSessionToken('admin', created.token)).status).toBe('none');
  });

  it('reports expiry and unknown tokens', async () => {
    const created = await createSession({ principal: 'student', principalId: student.id, remember: false, ip: null, userAgent: null });
    const later = new Date(Date.now() + 13 * 3600 * 1000);
    expect(await resolveSessionToken('student', created.token, later)).toEqual({ status: 'expired' });
    expect(await resolveSessionToken('student', 'not-a-real-token')).toEqual({ status: 'none' });
    expect(await resolveSessionToken('student', undefined)).toEqual({ status: 'none' });
  });

  it('revokes all other sessions but keeps the current one', async () => {
    const keep = await createSession({ principal: 'student', principalId: student.id, remember: false, ip: null, userAgent: null });
    const other = await createSession({ principal: 'student', principalId: student.id, remember: false, ip: null, userAgent: null });
    await revokeStudentSessions(student.id, 'pin_changed', keep.sessionId);
    expect((await resolveSessionToken('student', keep.token)).status).toBe('active');
    expect(await resolveSessionToken('student', other.token)).toEqual({ status: 'revoked', reason: 'pin_changed' });
  });
});

describe('rate limits', () => {
  it('limits after N hits and reports retryAt', async () => {
    const ip = randomIp();
    for (let i = 0; i < 20; i += 1) {
      expect((await consume('login_ip', ip)).limited).toBe(false);
    }
    const status = await consume('login_ip', ip);
    expect(status.limited).toBe(true);
    expect(status.retryAt?.getTime() ?? 0).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    await clearHits('login_ip', ip);
    expect((await checkLimit('login_ip', ip)).count).toBe(0);
  });

  it('ignores events outside the window', async () => {
    const subject = randomIp();
    await recordHit('enroll_ip', subject);
    const future = new Date(Date.now() + 61 * 60 * 1000);
    expect((await checkLimit('enroll_ip', subject, future)).count).toBe(0);
    await clearHits('enroll_ip', subject);
  });
});
