import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { makeExam, makePlan, makeQuestionBank, trackMobile } from '../helpers/fixtures';
import {
  attemptRow,
  BASE_URL,
  card,
  createStudent,
  expect,
  loginAdmin,
  loginStudent,
  msg,
  openAttempt,
  recordResponses,
  savedAnswers,
  setDeadline,
  startAttempt,
  test,
} from '../helpers/e2e';

const MIN = 60_000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MIN);
const ahead = (minutes: number) => new Date(Date.now() + minutes * MIN);

async function submitViaRpc(attemptId: string, studentId: string, changes: { q: string; o: string | null }[]) {
  const { error } = await testDb.rpc('submit_attempt', {
    p_attempt_id: attemptId,
    p_student_id: studentId,
    p_changes: changes.map((c, i) => ({ ...c, m: false, s: i + 1 })),
    p_auto: false,
  });
  if (error) throw error;
}

async function withResultsSetting<T>(visibleWhenInactive: boolean, run: () => Promise<T>): Promise<T> {
  const before = await testDb.from('app_settings').select('value').eq('key', 'results').single();
  await testDb.from('app_settings').update({ value: { visibleWhenInactive } }).eq('key', 'results').throwOnError();
  try {
    return await run();
  } finally {
    await testDb.from('app_settings').update({ value: before.data?.value ?? { visibleWhenInactive: true } }).eq('key', 'results');
  }
}

test.describe('P4.06 subscription states', () => {
  test('an expired student can log in but exams are locked behind /renew', async ({ page, context }) => {
    const student = await createStudent({ expired: true });
    const bank = await makeQuestionBank(2);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    await loginStudent(context, student.id);

    await page.goto('/exams');
    await expect(page.getByText(msg('studentExams.status.locked')).first()).toBeVisible();
    await page.goto(`/exams/${examId}`);
    await expect(page).toHaveURL(/\/renew$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(msg('renew.expired.title', { date: '' }).slice(0, 12));
  });

  test('past results follow results.visibleWhenInactive', async ({ page, context }) => {
    const student = await createStudent({ expired: true });
    await loginStudent(context, student.id);
    await withResultsSetting(true, async () => {
      await page.goto('/results');
      await expect(page).toHaveURL(/\/results$/);
    });
    await withResultsSetting(false, async () => {
      await page.goto('/results');
      await expect(page).toHaveURL(/\/renew$/);
    });
  });

  test('access ending mid-exam shows a blocking modal; the attempt finalizes with server-saved answers', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const bank = await makeQuestionBank(4);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const attemptId = await startAttempt(examId, student.id);
    await openAttempt(page, attemptId);
    await card(page, 1).getByRole('radio').first().click();
    await expect.poll(async () => (await savedAnswers(attemptId)).length).toBe(1);

    await testDb.from('students').update({ access_expires_at: ago(1).toISOString() }).eq('id', student.id).throwOnError();
    await card(page, 2).getByRole('radio').first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText(msg('examPage.inactiveTitle'));
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible(); // blocking

    await setDeadline(attemptId, ago(1));
    await testDb.rpc('finalize_overdue_attempts').throwOnError();
    const row = await attemptRow(attemptId);
    expect(row.status).toBe('auto_submitted');
    expect((row.correct_count ?? 0) + (row.incorrect_count ?? 0)).toBe(1); // only the server-saved answer
  });

  test('admin cancellation mid-exam blocks the page too', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const bank = await makeQuestionBank(2);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const attemptId = await startAttempt(examId, student.id);
    await openAttempt(page, attemptId);
    const admin = (await testDb.from('admins').select('id').eq('email', 'admin@local.test').single()).data;
    await testDb
      .rpc('admin_update_student_access', {
        p_admin_id: admin?.id ?? '',
        p_student_ids: [student.id],
        p_op: 'cancel',
        p_days: null as unknown as number,
        p_expires_at: null as unknown as string,
        p_reason: 'E2E',
      })
      .throwOnError();
    await card(page, 1).getByRole('radio').first().click();
    // Cancel revokes sessions, so the save fails with SESSION_REVOKED → the blocking re-login modal.
    await expect(page.getByRole('dialog')).toContainText(msg('examPage.revokedTitle'));
  });

  test('approving a renewal reactivates a cancelled student', async ({ page, context, browser }) => {
    const student = await createStudent({ status: 'cancelled' });
    trackMobile(student.mobile);
    const bank = await makeQuestionBank(2);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const plan = (await testDb.from('plans').select('id').eq('code', '1-month').single()).data;
    await testDb
      .rpc('submit_admission', {
        p_mobile: student.mobile,
        p_email: student.email,
        p_method: 'bkash',
        p_trx: `RN${Date.now()}`,
        p_plan_id: plan?.id ?? '',
        p_ip: '10.0.0.1',
      })
      .throwOnError();

    const adminContext = await browser.newContext();
    await loginAdmin(adminContext);
    const admin = await adminContext.newPage();
    await admin.goto(`/admin/admissions?q=${student.mobile}`);
    await admin.getByText(student.mobile, { exact: true }).filter({ visible: true }).first().click();
    await admin.getByRole('dialog').getByRole('button', { name: msg('admin.admissions.approve') }).click();
    const approveButton = admin.getByRole('button', { name: msg('admin.admissions.approveAndSend') });
    await approveButton.click();
    await expect(admin.getByText(msg('admin.admissions.approvedRenewal'))).toBeVisible();
    await adminContext.close();

    await loginStudent(context, student.id);
    await page.goto(`/exams/${examId}`);
    await expect(page.getByRole('button', { name: msg('lobby.start') })).toBeVisible();
  });
});

test.describe('P4.10 answer-key leak', () => {
  test('no response during an exam carries answers or explanations', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const bank = await makeQuestionBank(6);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id), answersPublishAt: ahead(60), resultsPublishAt: ahead(60) });
    const log = recordResponses(page);

    await page.goto(`/exams/${examId}`);
    await page.getByRole('button', { name: msg('lobby.start') }).click();
    await expect(page.locator('article[data-index="0"]')).toBeVisible();
    const attemptId = page.url().split('/').at(-1) ?? '';
    for (let n = 1; n <= 6; n++) await card(page, n).getByRole('radio').nth(n % 4).click();
    await expect.poll(async () => (await savedAnswers(attemptId)).length, { timeout: 15_000 }).toBe(6);
    await openAttempt(page, attemptId); // resume payload
    await page.getByRole('button', { name: msg('examPage.submit') }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: msg('examPage.submit') }).click();
    await expect(page).toHaveURL(/\/result$/);
    await expect(page.getByText(msg('result.answersLater', { time: '' }).slice(0, 15))).toBeVisible();
    await page.waitForLoadState('networkidle');

    expect(log.length).toBeGreaterThan(5);
    const leaks = log.filter(({ body }) =>
      /correct_option|"correctOption":"[ABCD]"|"explanation(Html)?":"/.test(body) || body.includes(`EXPLANATION-TOKEN-${bank.slug}`),
    );
    expect(leaks.map((l) => l.url)).toEqual([]);

    // Sanity check: once answers are published the same recorder does see them.
    await testDb.from('exams').update({ answers_publish_at: ago(1).toISOString() }).eq('id', examId).throwOnError();
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(log.some(({ body }) => body.includes(`EXPLANATION-TOKEN-${bank.slug}`))).toBe(true);
  });
});

async function optionOrder(scope: ReturnType<Page['locator']>) {
  return scope.evaluate((el) =>
    Array.from(el.querySelectorAll('[role="radio"], li')).map((o) => (o.textContent ?? '').replace(/সঠিক উত্তর।|আপনার উত্তর।/g, '').trim().replace(/^[A-D✓✗]/, '').trim()),
  );
}

test.describe('P4.11 shuffle correctness', () => {
  test('shuffled display order is kept in review and scored against the canonical key', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const bank = await makeQuestionBank(8);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id), shuffleQuestions: true, shuffleOptions: true });
    const attemptId = await startAttempt(examId, student.id);
    await openAttempt(page, attemptId);

    const examOrder: Record<number, string[]> = {};
    let expectedCorrect = 0;
    for (let n = 1; n <= 8; n++) {
      const c = card(page, n);
      const i = Number((await c.textContent())?.match(/question (\d+)/)?.[1]) - 1;
      const correctText = `${bank.questions[i]?.correct_option.toLowerCase()}${i}`;
      examOrder[i] = (await c.getByRole('radio').allTextContents()).map((t) => t.replace(/^[A-D]/, '').trim());
      const pick = n % 2 === 0 ? correctText : (examOrder[i].find((t) => t !== correctText) ?? '');
      if (n % 2 === 0) expectedCorrect++;
      await c.getByRole('radio', { name: pick, exact: true }).click();
    }
    await expect.poll(async () => (await savedAnswers(attemptId)).length, { timeout: 15_000 }).toBe(8);
    await page.getByRole('button', { name: msg('examPage.submit') }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: msg('examPage.submit') }).click();
    await expect(page).toHaveURL(/\/result$/);

    const row = await attemptRow(attemptId);
    expect(row.correct_count).toBe(expectedCorrect);
    expect(Object.values(row.option_order as Record<string, string>).some((o) => o !== 'ABCD')).toBe(true);

    for (let n = 1; n <= 8; n++) {
      const review = page.locator(`#r-${n}`);
      await review.scrollIntoViewIfNeeded();
      const i = Number((await review.textContent())?.match(/question (\d+)/)?.[1]) - 1;
      expect(await optionOrder(review.locator('ul').first())).toEqual(examOrder[i]);
      const correctRow = review.locator('li', { hasText: msg('review.srCorrect') });
      await expect(correctRow).toContainText(`${bank.questions[i]?.correct_option.toLowerCase()}${i}`);
    }
  });
});

test.describe('P4.13 result visibility gates', () => {
  async function rankedExam(options: Partial<Parameters<typeof makeExam>[0]> = {}) {
    const bank = await makeQuestionBank(4);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id), ...options });
    const right = (n: number) => bank.questions.slice(0, n).map((q) => ({ q: q.id, o: q.correct_option }));
    return { bank, examId, right };
  }

  test('competition ranking with ties: 1, 1, 3', async ({ page, context }) => {
    const { examId, right } = await rankedExam();
    const students = [await createStudent(), await createStudent(), await createStudent()];
    const attempts: string[] = [];
    for (const [index, s] of students.entries()) {
      const attemptId = await startAttempt(examId, s.id);
      attempts.push(attemptId);
      await submitViaRpc(attemptId, s.id, right(index < 2 ? 2 : 1));
    }
    await loginStudent(context, students[2]?.id ?? '');
    await page.goto(`/attempts/${attempts[2]}/result`);
    await expect(page.getByText(`${msg('result.position')}: 3/3`)).toBeVisible();
    await context.clearCookies();
    await loginStudent(context, students[1]?.id ?? '');
    await page.goto(`/attempts/${attempts[1]}/result`);
    await expect(page.getByText(`${msg('result.position')}: 1/3`)).toBeVisible();
  });

  test('rank and answers stay hidden until their publish times; stats can be off', async ({ page, context }) => {
    const { examId, right } = await rankedExam({ resultsPublishAt: ahead(60), answersPublishAt: ahead(90), showOptionStats: false });
    const student = await createStudent();
    const attemptId = await startAttempt(examId, student.id);
    await submitViaRpc(attemptId, student.id, right(2));
    await loginStudent(context, student.id);

    await page.goto(`/attempts/${attemptId}/result`);
    await expect(page.getByText(msg('result.rankLater', { time: '' }).slice(0, 12))).toBeVisible();
    await expect(page.getByText(msg('result.answersLater', { time: '' }).slice(0, 15))).toBeVisible();
    await expect(page.getByText(`${msg('result.position')}:`)).toHaveCount(0);
    await expect(page.locator('li', { hasText: msg('review.srCorrect') })).toHaveCount(0);

    await testDb.from('exams').update({ results_publish_at: ago(1).toISOString(), answers_publish_at: ago(1).toISOString() }).eq('id', examId);
    await page.reload();
    await expect(page.getByText(`${msg('result.position')}: 1/1`)).toBeVisible();
    await expect(page.locator('li', { hasText: msg('review.srCorrect') }).first()).toBeVisible();
    await expect(page.getByText(msg('review.statsTitle'))).toHaveCount(0);
  });

  test('a late attempt is not ranked', async ({ page, context }) => {
    const { examId, right } = await rankedExam({ accessMode: 'window', startsAt: ago(60), liveEndsAt: ago(30), lateUntil: ahead(60) });
    const student = await createStudent();
    const attemptId = await startAttempt(examId, student.id);
    await submitViaRpc(attemptId, student.id, right(1));
    await loginStudent(context, student.id);
    await page.goto(`/attempts/${attemptId}/result`);
    await expect(page.getByText(msg('result.lateUnranked'))).toBeVisible();
    await expect(page.getByText(`${msg('result.position')}: —`)).toBeVisible();
  });
});

test.describe('P4.14 access modes', () => {
  async function bankIds(n = 2) {
    return (await makeQuestionBank(n)).questions.map((q) => q.id);
  }

  test('fixed: starting late truncates the deadline to live_ends_at', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const liveEndsAt = ahead(10);
    const examId = await makeExam({ questionIds: await bankIds(), startsAt: ago(20), liveEndsAt, durationMinutes: 30 });
    await page.goto(`/exams/${examId}`);
    await page.getByRole('button', { name: msg('lobby.start') }).click();
    await expect(page).toHaveURL(/\/attempts\//);
    const row = await attemptRow(page.url().split('/').at(-1) ?? '');
    expect(Math.abs(Date.parse(row.deadline_at) - liveEndsAt.getTime())).toBeLessThan(1_000);
  });

  test('fixed: after live_ends_at the exam is Missed with no Take Now', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const examId = await makeExam({ questionIds: await bankIds(), startsAt: ago(60), liveEndsAt: ago(30) });
    await page.goto('/exams');
    await expect(page.getByText(msg('studentExams.status.missed'), { exact: true }).first()).toBeVisible();
    await page.goto(`/exams/${examId}`);
    await expect(page.getByText(msg('lobby.closed'))).toBeVisible();
    await expect(page.getByRole('button', { name: msg('lobby.takeNow') })).toHaveCount(0);
  });

  test('window: Take Now until late_until, marked late, deadline capped', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const lateUntil = ahead(10);
    const examId = await makeExam({ questionIds: await bankIds(), accessMode: 'window', startsAt: ago(60), liveEndsAt: ago(30), lateUntil, durationMinutes: 30 });
    await page.goto(`/exams/${examId}`);
    await expect(page.getByText(msg('lobby.lateUnranked'))).toBeVisible();
    await page.getByRole('button', { name: msg('lobby.takeNow') }).click();
    await expect(page).toHaveURL(/\/attempts\//);
    const row = await attemptRow(page.url().split('/').at(-1) ?? '');
    expect(row.is_late).toBe(true);
    expect(Math.abs(Date.parse(row.deadline_at) - lateUntil.getTime())).toBeLessThan(1_000);
  });

  test('always: Take Now long after the live window, full duration', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const examId = await makeExam({ questionIds: await bankIds(), accessMode: 'always', startsAt: ago(60 * 24 * 30), liveEndsAt: ago(60 * 24 * 29), durationMinutes: 20 });
    await page.goto(`/exams/${examId}`);
    await page.getByRole('button', { name: msg('lobby.takeNow') }).click();
    await expect(page).toHaveURL(/\/attempts\//);
    const row = await attemptRow(page.url().split('/').at(-1) ?? '');
    expect(Date.parse(row.deadline_at) - Date.now()).toBeGreaterThan(19 * MIN);
  });

  test('plans audience: a plan-A exam is open to an A-student and a 404 for B or no-plan students', async ({ browser }) => {
    const [planA, planB] = [await makePlan(), await makePlan()];
    const examId = await makeExam({ questionIds: await bankIds(), audience: 'plans', planIds: [planA.id] });
    const title = (await testDb.from('exams').select('title').eq('id', examId).single()).data?.title ?? '';

    const asStudent = async (planId?: string) => {
      const context = await browser.newContext();
      const student = await createStudent(planId ? { planId } : {});
      await loginStudent(context, student.id);
      return { context, page: await context.newPage() };
    };

    const a = await asStudent(planA.id);
    await a.page.goto('/exams');
    await expect(a.page.getByText(title)).toBeVisible();
    await a.page.goto(`/exams/${examId}`);
    await expect(a.page.getByRole('button', { name: msg('lobby.start') })).toBeVisible();
    await a.context.close();

    for (const planId of [planB.id, undefined]) {
      const other = await asStudent(planId);
      await other.page.goto('/exams');
      await expect(other.page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(other.page.getByText(title)).toHaveCount(0);
      // The (student) group streams (loading.tsx), so notFound() renders the 404 UI with status 200.
      await other.page.goto(`/exams/${examId}`);
      await expect(other.page.getByRole('heading', { name: msg('notFound.title') })).toBeVisible();
      await expect(other.page.getByRole('button', { name: msg('lobby.start') })).toHaveCount(0);
      const started = await other.context.request.post(`/api/exams/${examId}/start`, { headers: { origin: BASE_URL } });
      expect(started.status()).toBe(404);
      await other.context.close();
    }
  });
});
