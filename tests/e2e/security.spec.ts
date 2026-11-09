import { makeExam, makeQuestionBank } from '../helpers/fixtures';
import { api, BASE_URL, createStudent, expect, loginAdmin, loginStudent, msg, SEED_PIN, startAttempt, test } from '../helpers/e2e';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

test.describe('P4.15 authorization matrix', () => {
  test("student A cannot read or write student B's attempt or result", async ({ page, context }) => {
    const bank = await makeQuestionBank(2);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const a = await createStudent();
    const b = await createStudent();
    const attemptB = await startAttempt(examId, b.id);
    await loginStudent(context, a.id);

    for (const path of [`/attempts/${attemptB}`, `/attempts/${attemptB}/result`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: msg('notFound.title') })).toBeVisible();
    }
    const client = api(context);
    expect((await client.get(`/api/attempts/${attemptB}`)).status()).toBe(404);
    const change = [{ q: bank.questions[0]?.id, o: 'A', m: false, s: 1 }];
    expect((await client.put(`/api/attempts/${attemptB}/answers`, { changes: change })).status()).toBe(404);
    expect((await client.post(`/api/attempts/${attemptB}/submit`, { auto: false, changes: [] })).status()).toBe(404);
  });

  test('a student cookie cannot reach the admin panel', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    for (const path of ['/admin', '/admin/students', '/admin/exams']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
    const csv = await context.request.get('/api/admin/exams/00000000-0000-4000-8000-000000000000/results.csv');
    expect(csv.status()).toBe(401);
  });

  test('an admin cookie does not grant student routes', async ({ page, context }) => {
    await loginAdmin(context);
    for (const path of ['/dashboard', '/exams', '/results']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test('Server Actions and mutating routes reject foreign origins', async ({ page, context }) => {
    const student = await createStudent();
    // Capture a real Server Action request (the login form) to replay it.
    await page.goto('/login');
    const captured = page.waitForRequest((r) => r.method() === 'POST' && Boolean(r.headers()['next-action']));
    await page.getByLabel(msg('login.mobile')).fill(student.mobile);
    await page.getByLabel(msg('login.pin'), { exact: true }).fill('999999');
    await page.getByRole('button', { name: msg('login.submit') }).click();
    const request = await captured;
    const headers = { ...request.headers(), origin: 'https://evil.example', host: new URL(BASE_URL).host };
    const forged = await context.request.post(request.url(), { headers, data: request.postData() ?? '' });
    expect(forged.status()).not.toBe(200);
    expect(await forged.text()).not.toContain('INVALID_CREDENTIALS');

    await loginStudent(context, student.id);
    const bank = await makeQuestionBank(1);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const start = await context.request.post(`/api/exams/${examId}/start`, { headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, data: {} });
    expect(start.status()).toBe(403);
  });
});

test.describe('P4.16 RLS over HTTP @api', () => {
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json', ...init.headers } });

  for (const table of ['students', 'questions', 'admissions', 'exam_attempts', 'attempt_answers', 'sessions', 'admins', 'audit_log', 'outbox']) {
    test(`anon cannot read ${table}`, async () => {
      const response = await rest(`${table}?select=*&limit=1`);
      expect(response.ok).toBe(false);
    });
  }

  test('anon cannot write or call functions', async () => {
    expect((await rest('plans', { method: 'POST', body: JSON.stringify({ code: 'hack', name_bn: 'x', name_en: 'x', duration_days: 1, price_bdt: 0 }) })).ok).toBe(false);
    for (const fn of ['start_attempt', 'finalize_overdue_attempts', 'student_exam_cards', 'submit_admission']) {
      expect((await rest(`rpc/${fn}`, { method: 'POST', body: '{}' })).ok).toBe(false);
    }
  });

  test('anon reads only the granted public columns and rows; exams are not public (R1.1)', async () => {
    const plans = await rest('plans?select=code,is_active');
    expect(plans.ok).toBe(true);
    expect(((await plans.json()) as { is_active: boolean }[]).every((p) => p.is_active)).toBe(true);

    for (const query of ['exams?select=id,title,starts_at', 'exams?select=id,answers_publish_at', 'exam_audience_plans?select=exam_id']) {
      expect((await rest(query)).ok, query).toBe(false);
    }

    const settings = (await (await rest('app_settings?select=key')).json()) as { key: string }[];
    expect(settings.map((s) => s.key).sort()).not.toContain('auth');
  });
});

test.describe('P4.22 headers and cookies', () => {
  test('@api security headers are present', async ({ request }) => {
    const response = await request.get('/');
    const h = response.headers();
    expect(h['strict-transport-security']).toBe('max-age=63072000; includeSubDomains; preload');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['content-security-policy']).toContain("default-src 'self'");
  });

  test('session cookies are HttpOnly, Secure, SameSite=Lax; remember controls persistence', async ({ page, context }) => {
    const student = await createStudent();
    await page.goto('/login');
    await page.getByLabel(msg('login.mobile')).fill(student.mobile);
    await page.getByLabel(msg('login.pin'), { exact: true }).fill(SEED_PIN);
    await page.getByRole('button', { name: msg('login.submit') }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    let cookie = (await context.cookies()).find((c) => c.name === 'bsi_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect((cookie?.expires ?? 0) * 1000 - Date.now()).toBeGreaterThan(29 * 86_400_000);

    await context.clearCookies();
    await page.goto('/login');
    await page.getByLabel(msg('login.mobile')).fill(student.mobile);
    await page.getByLabel(msg('login.pin'), { exact: true }).fill(SEED_PIN);
    await page.getByRole('checkbox', { name: msg('login.remember') }).click();
    await page.getByRole('button', { name: msg('login.submit') }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    cookie = (await context.cookies()).find((c) => c.name === 'bsi_session');
    expect(cookie?.expires).toBe(-1); // browser-session cookie
  });
});
