// @vitest-environment node
// Requires the local Supabase stack (`pnpm db:start`).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { changePin, changePinForced, loginAdmin, loginStudent } from '@/features/auth/service';
import { hashSecret } from '@/lib/auth/pin';
import { resolveSessionToken } from '@/lib/auth/session';
import { createStudent, deleteStudent, randomIp, randomMobile, testDb } from '../helpers/db';

const PIN = '246813';
const created: { id: string; mobile: string }[] = [];
let pinHash: string;

async function newStudent(options: Omit<Parameters<typeof createStudent>[0], 'pinHash'> = {}) {
  const student = await createStudent({ pinHash, ...options });
  created.push(student);
  return student;
}
const ctx = () => ({ ip: randomIp(), userAgent: 'vitest' });

beforeAll(async () => {
  pinHash = await hashSecret(PIN);
});
afterAll(async () => {
  for (const student of created) await deleteStudent(student.id, student.mobile);
});

describe('loginStudent', () => {
  it('counts down attempts, locks at 5, and a lock survives a correct PIN', async () => {
    const student = await newStudent();
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
      seen.push(result.ok ? null : result.error.meta?.attemptsLeft);
    }
    expect(seen).toEqual([4, 3, 2, 1]);

    const fifth = await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.error.code).toBe('LOCKED');
      expect(Date.parse(String(fifth.error.meta?.lockedUntil))).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
    }

    const correctWhileLocked = await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx());
    expect(correctWhileLocked.ok ? null : correctWhileLocked.error.code).toBe('LOCKED');
  });

  it('a success clears earlier failures', async () => {
    const student = await newStudent();
    await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
    await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
    expect((await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx())).ok).toBe(true);
    const after = await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
    expect(after.ok ? null : after.error.meta?.attemptsLeft).toBe(4);
  });

  it('unknown mobiles get the same response shape', async () => {
    const result = await loginStudent({ mobile: randomMobile(), pin: PIN, remember: true }, ctx());
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'errors.invalidCredentials', meta: { attemptsLeft: 4 } },
    });
  });

  it('a second login revokes the first session (maxDevices = 1)', async () => {
    const student = await newStudent();
    const first = await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx());
    const second = await loginStudent({ mobile: student.mobile, pin: PIN, remember: false }, ctx());
    if (!first.ok || !second.ok) throw new Error('login failed');
    expect(await resolveSessionToken('student', first.data.session.token)).toEqual({ status: 'revoked', reason: 'new_login' });
    expect((await resolveSessionToken('student', second.data.session.token)).status).toBe('active');
  });

  it('discloses suspension only after a correct PIN', async () => {
    const student = await newStudent({ status: 'suspended' });
    const wrong = await loginStudent({ mobile: student.mobile, pin: '135790', remember: true }, ctx());
    expect(wrong.ok ? null : wrong.error.code).toBe('INVALID_CREDENTIALS');
    const right = await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx());
    expect(right.ok ? null : right.error.code).toBe('SUSPENDED');
  });

  it('reports must-change-PIN and access state', async () => {
    const fresh = await newStudent({ mustChangePin: true });
    const expired = await newStudent({ expired: true });
    const a = await loginStudent({ mobile: fresh.mobile, pin: PIN, remember: true }, ctx());
    const b = await loginStudent({ mobile: expired.mobile, pin: PIN, remember: true }, ctx());
    expect(a.ok && a.data.mustChangePin).toBe(true);
    expect(b.ok && b.data.accessState).toBe('expired');
  });

  it('rate limits by IP after 20 attempts', async () => {
    const ip = randomIp();
    for (let i = 0; i < 20; i += 1) {
      await loginStudent({ mobile: randomMobile(), pin: PIN, remember: true }, { ip, userAgent: null });
    }
    const limited = await loginStudent({ mobile: randomMobile(), pin: PIN, remember: true }, { ip, userAgent: null });
    expect(limited.ok ? null : limited.error.code).toBe('RATE_LIMITED');
    await testDb.from('rate_limit_events').delete().eq('subject', ip);
  });
});

describe('PIN changes', () => {
  it('forced change: rejects weak and same PINs, then updates and revokes other sessions', async () => {
    const student = await newStudent({ mustChangePin: true });
    const a = await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx());
    if (!a.ok) throw new Error('login failed');
    const sessionId = a.data.session.sessionId;

    expect(await changePinForced(student.id, sessionId, '123456')).toMatchObject({ ok: false, error: { code: 'PIN_TOO_WEAK' } });
    expect(await changePinForced(student.id, sessionId, PIN)).toMatchObject({ ok: false, error: { code: 'PIN_SAME_AS_OLD' } });

    // a stale second session that should be revoked by the change
    await testDb.from('sessions').insert({
      token_hash: '\\x' + 'ab'.repeat(32),
      student_id: student.id,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    expect(await changePinForced(student.id, sessionId, '580317')).toEqual({ ok: true, data: { changed: true } });
    const { data: row } = await testDb.from('students').select('must_change_pin').eq('id', student.id).single();
    expect(row?.must_change_pin).toBe(false);
    expect((await resolveSessionToken('student', a.data.session.token)).status).toBe('active');
    const { data: others } = await testDb.from('sessions').select('revoke_reason').eq('student_id', student.id).neq('id', sessionId);
    expect(others?.every((s) => s.revoke_reason === 'pin_changed')).toBe(true);

    expect((await loginStudent({ mobile: student.mobile, pin: '580317', remember: true }, ctx())).ok).toBe(true);
  });

  it('voluntary change requires the current PIN', async () => {
    const student = await newStudent();
    const a = await loginStudent({ mobile: student.mobile, pin: PIN, remember: true }, ctx());
    if (!a.ok) throw new Error('login failed');
    expect(await changePin(student.id, a.data.session.sessionId, '000999', '580317')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', field: 'currentPin' },
    });
    expect((await changePin(student.id, a.data.session.sessionId, PIN, '580317')).ok).toBe(true);
  });
});

describe('loginAdmin', () => {
  it('logs in, hides attempts-left, and locks after 5 failures', async () => {
    const email = `admin-${Date.now()}@test.local`;
    const { data: admin, error } = await testDb
      .from('admins')
      .insert({ email, display_name: 'Test', password_hash: await hashSecret('correct horse battery') })
      .select('id')
      .single();
    if (error) throw error;

    const ok = await loginAdmin({ email, password: 'correct horse battery' }, ctx());
    expect(ok.ok).toBe(true);
    if (ok.ok) expect((await resolveSessionToken('admin', ok.data.session.token)).status).toBe('active');

    const wrong = await loginAdmin({ email, password: 'nope' }, ctx());
    expect(wrong).toEqual({
      ok: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'errors.adminInvalidCredentials' },
    });
    for (let i = 0; i < 3; i += 1) await loginAdmin({ email, password: 'nope' }, ctx());
    const locked = await loginAdmin({ email, password: 'nope' }, ctx());
    expect(locked.ok ? null : locked.error.code).toBe('LOCKED');

    await testDb.from('rate_limit_events').delete().eq('subject', email);
    await testDb.from('admins').delete().eq('id', admin.id);
  });
});
