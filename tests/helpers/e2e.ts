import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { type BrowserContext, type Page, test as base, expect } from '@playwright/test';
import bn from '../../messages/bn.json' with { type: 'json' };
import { randomIp, testDb } from './db';
import { cleanup, makeStudent } from './fixtures';

/**
 * Playwright helpers (Plan P4.01): per-test client IP, service-role factories, session minting,
 * dev-mailbox capture and a network recorder for the answer-key leak test.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
/** PIN of every factory student (and of the seed students, Schema §9). */
export const SEED_PIN = '246810';
export const SEED_ADMIN = { email: 'admin@local.test', password: 'local-admin-password' };

const must = <T>(result: { data: T; error: unknown }): NonNullable<T> => {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
};

type Fixtures = { ip: string; cleanupFixtures: void };

/**
 * Each test gets its own `x-forwarded-for` so IP rate limits (login 20/10 min, enroll 5/h) don't
 * leak between specs; fixtures created through tests/helpers/fixtures.ts are removed afterwards.
 */
export const test = base.extend<Fixtures>({
  // `provide` is Playwright's `use` callback, renamed so the React hooks lint rule leaves it alone.
  ip: async ({}, provide) => {
    await provide(randomIp());
  },
  context: async ({ context, ip }, provide) => {
    await context.setExtraHTTPHeaders({ 'x-forwarded-for': ip });
    await provide(context);
  },
  cleanupFixtures: [
    async ({}, provide) => {
      await provide();
      await cleanup();
    },
    { auto: true },
  ],
});
export { expect };

let pinHash: Promise<string> | null = null;
/** argon2id hash of SEED_PIN with the server's pepper (same parameters as src/lib/auth/pin.ts). */
export function seedPinHash(): Promise<string> {
  pinHash ??= hash(SEED_PIN, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    secret: Buffer.from(process.env.AUTH_PEPPER ?? '', 'base64'),
  });
  return pinHash;
}

/** A fresh student whose PIN is SEED_PIN. */
export async function createStudent(options: Parameters<typeof makeStudent>[0] = {}) {
  const student = await makeStudent({ pinHash: await seedPinHash(), ...options });
  return { ...student, pin: SEED_PIN };
}

function cookieToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: `\\x${createHash('sha256').update(token).digest('hex')}` };
}

/** Logs a context in without the UI (inserts a session row like `createSession`). */
export async function loginStudent(context: BrowserContext, studentId: string): Promise<string> {
  const { token, hash } = cookieToken();
  const session = must(
    await testDb
      .from('sessions')
      .insert({ token_hash: hash, student_id: studentId, remember: true, expires_at: new Date(Date.now() + 86_400_000).toISOString() })
      .select('id')
      .single(),
  );
  await context.addCookies([{ name: 'bsi_session', value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax' }]);
  return session.id;
}

export async function loginAdmin(context: BrowserContext): Promise<string> {
  const admin = must(await testDb.from('admins').select('id').eq('email', SEED_ADMIN.email).single());
  const { token, hash } = cookieToken();
  await testDb
    .from('sessions')
    .insert({ token_hash: hash, admin_id: admin.id, expires_at: new Date(Date.now() + 3_600_000).toISOString() })
    .throwOnError();
  await context.addCookies([{ name: 'bsi_admin', value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax' }]);
  return admin.id;
}

export async function startAttempt(examId: string, studentId: string): Promise<string> {
  return must(await testDb.rpc('start_attempt', { p_exam_id: examId, p_student_id: studentId }));
}

/** Moves an attempt's server deadline (server-time edge cases are simulated in the DB). */
export async function setDeadline(attemptId: string, deadline: Date): Promise<void> {
  await testDb.from('exam_attempts').update({ deadline_at: deadline.toISOString() }).eq('id', attemptId).throwOnError();
}

export type CapturedMail = { to: string; subject: string; text: string; at: string };
export async function mailbox(to: string): Promise<CapturedMail[]> {
  const response = await fetch(`${BASE_URL}/api/internal/dev-mailbox?to=${encodeURIComponent(to)}`, {
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  });
  const body = (await response.json()) as { ok: boolean; data?: CapturedMail[] };
  if (!body.ok || !body.data) throw new Error(`dev mailbox unavailable (${response.status})`);
  return body.data;
}

/** The 6-digit PIN from the newest credentials email to `to`. */
export async function pinFromMailbox(to: string): Promise<string> {
  let pin: string | undefined;
  await expect
    .poll(async () => {
      const mails = await mailbox(to);
      pin = mails.at(-1)?.text.match(/\b(\d{6})\b/)?.[1];
      return pin;
    })
    .toBeTruthy();
  return pin as string;
}

/** Records every response body (text-like) the page receives, for leak assertions. */
export function recordResponses(page: Page): { url: string; body: string }[] {
  const log: { url: string; body: string }[] = [];
  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? '';
    if (!/json|text|javascript|x-component/.test(type)) return;
    try {
      log.push({ url: response.url(), body: await response.text() });
    } catch {
      // Redirects and aborted requests have no body.
    }
  });
  return log;
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}


/** Looks up a Bangla UI string (`login.submit`) and fills `{param}` placeholders. */
export function msg(path: string, params: Record<string, string | number> = {}): string {
  const value = path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], bn);
  if (typeof value !== 'string') throw new Error(`missing message ${path}`);
  return value.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

/** API calls from a logged-in context; mutating routes require a same-origin `Origin` header. */
export function api(context: BrowserContext) {
  const headers = { origin: BASE_URL, 'content-type': 'application/json' };
  return {
    get: (path: string) => context.request.get(path, { headers }),
    put: (path: string, data: unknown) => context.request.put(path, { headers, data }),
    post: (path: string, data: unknown = {}) => context.request.post(path, { headers, data }),
  };
}

/** Waits for the client-only exam page to render its first card. */
export async function openAttempt(page: Page, attemptId: string): Promise<void> {
  await page.goto(`/attempts/${attemptId}`);
  await expect(page.locator('article[data-index="0"]')).toBeVisible();
}

export function card(page: Page, n: number) {
  return page.locator(`article[data-index="${n - 1}"]`);
}

export async function attemptRow(attemptId: string) {
  return must(
    await testDb
      .from('exam_attempts')
      .select('status, score, correct_count, incorrect_count, skipped_count, deadline_at, is_late, question_order, option_order')
      .eq('id', attemptId)
      .single(),
  );
}

export async function savedAnswers(attemptId: string) {
  return must(await testDb.from('attempt_answers').select('question_id, selected_option, client_seq').eq('attempt_id', attemptId));
}
