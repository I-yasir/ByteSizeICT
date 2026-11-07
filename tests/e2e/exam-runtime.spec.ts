import { testDb } from '../helpers/db';
import { makeExam, makeQuestionBank } from '../helpers/fixtures';
import {
  api,
  attemptRow,
  card,
  createStudent,
  expect,
  loginStudent,
  msg,
  openAttempt,
  savedAnswers,
  setDeadline,
  startAttempt,
  test,
} from '../helpers/e2e';

const KEYS = ['A', 'B', 'C', 'D'] as const;

async function examFixture(questions = 12, exam: Partial<Parameters<typeof makeExam>[0]> = {}) {
  const bank = await makeQuestionBank(questions);
  const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id), ...exam });
  return { bank, examId };
}

test.describe('P4.07 autosave resilience', () => {
  test('answers given offline survive a reload and sync on reconnect', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture();
    const attemptId = await startAttempt(examId, student.id);
    await openAttempt(page, attemptId);

    await context.setOffline(true);
    for (let n = 1; n <= 10; n++) await card(page, n).getByRole('radio').nth((n - 1) % 4).click();
    await expect(page.getByText(msg('examPage.offline'))).toBeVisible();
    expect(await savedAnswers(attemptId)).toHaveLength(0);

    // Reload while the answers API is still unreachable: everything comes back from localStorage.
    await page.route('**/api/attempts/*/answers', (route) => route.abort('internetdisconnected'));
    await context.setOffline(false);
    await openAttempt(page, attemptId);
    for (let n = 1; n <= 10; n++) {
      await expect(card(page, n).getByRole('radio').nth((n - 1) % 4)).toHaveAttribute('aria-checked', 'true');
    }
    expect(await savedAnswers(attemptId)).toHaveLength(0);

    await page.unroute('**/api/attempts/*/answers');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => (await savedAnswers(attemptId)).length, { timeout: 15_000 }).toBe(10);
    const byQuestion = new Map((await savedAnswers(attemptId)).map((a) => [a.question_id, a.selected_option]));
    bank.questions.slice(0, 10).forEach((q, i) => expect(byQuestion.get(q.id)).toBe(KEYS[i % 4]));
    await expect(page.getByLabel(msg('examPage.sync.synced'))).toBeVisible();
  });

  test('closing the page mid-exam and reopening restores answers, position and time', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { examId } = await examFixture();
    const attemptId = await startAttempt(examId, student.id);
    await openAttempt(page, attemptId);

    await card(page, 2).getByRole('radio').nth(1).click();
    await card(page, 9).scrollIntoViewIfNeeded();
    await card(page, 9).getByRole('radio').nth(3).click();
    await card(page, 9).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1_500); // scroll position is persisted every second
    const before = await page.getByRole('timer').first().textContent();
    await page.close();

    const reopened = await context.newPage();
    await openAttempt(reopened, attemptId);
    await expect(card(reopened, 2).getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(card(reopened, 9).getByRole('radio').nth(3)).toHaveAttribute('aria-checked', 'true');
    await expect(card(reopened, 9)).toBeInViewport();
    const after = await reopened.getByRole('timer').first().textContent();
    const seconds = (clock: string | null) => (clock ?? '').split(':').reduce((total, part) => total * 60 + Number(part), 0);
    expect(seconds(before) - seconds(after)).toBeGreaterThanOrEqual(0);
    expect(seconds(before) - seconds(after)).toBeLessThan(15);
  });
});

test.describe('P4.08 timing', () => {
  test('the exam auto-submits when the client timer reaches zero', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { examId } = await examFixture(4, { durationMinutes: 2 });
    const attemptId = await startAttempt(examId, student.id);
    await page.clock.install();
    await openAttempt(page, attemptId);
    await card(page, 1).getByRole('radio').first().click();
    await page.clock.fastForward('02:05');
    await expect(page).toHaveURL(new RegExp(`/attempts/${attemptId}/result$`), { timeout: 20_000 });
    const row = await attemptRow(attemptId);
    expect(row.status).toBe('auto_submitted');
    expect(row.correct_count).toBe(1);
  });

  test('@api submit inside the 15 s grace counts unsynced answers', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    await setDeadline(attemptId, new Date(Date.now() - 5_000));
    const q = bank.questions[0];
    const response = await api(context).post(`/api/attempts/${attemptId}/submit`, {
      auto: true,
      changes: [{ q: q?.id, o: q?.correct_option, m: false, s: 1 }],
    });
    expect(response.status()).toBe(200);
    const row = await attemptRow(attemptId);
    expect(row.status).toBe('auto_submitted');
    expect(row.correct_count).toBe(1);
  });

  test('@api saves after deadline + 15 s get 409 and are not counted', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    const q = bank.questions[0];
    await api(context).put(`/api/attempts/${attemptId}/answers`, { changes: [{ q: q?.id, o: 'D', m: false, s: 1 }] });
    await setDeadline(attemptId, new Date(Date.now() - 16_000));

    const late = await api(context).put(`/api/attempts/${attemptId}/answers`, { changes: [{ q: q?.id, o: q?.correct_option, m: false, s: 2 }] });
    expect(late.status()).toBe(409);
    expect((await late.json()).error.code).toBe('ATTEMPT_CLOSED');

    const submit = await api(context).post(`/api/attempts/${attemptId}/submit`, {
      auto: true,
      changes: [{ q: q?.id, o: q?.correct_option, m: false, s: 3 }],
    });
    // The read path finalized it already, or the submit did: either way the late change is ignored.
    expect([200, 409]).toContain(submit.status());
    const row = await attemptRow(attemptId);
    expect(row.status).toBe('auto_submitted');
    expect(row.correct_count).toBe(q?.correct_option === 'D' ? 1 : 0);
  });

  test('@api the cron finalizes an abandoned attempt with its saved answers', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    const changes = bank.questions.slice(0, 2).map((q, i) => ({ q: q.id, o: q.correct_option, m: false, s: i + 1 }));
    expect((await api(context).put(`/api/attempts/${attemptId}/answers`, { changes })).status()).toBe(200);
    await setDeadline(attemptId, new Date(Date.now() - 20_000));
    const { error } = await testDb.rpc('finalize_overdue_attempts');
    expect(error).toBeNull();
    const row = await attemptRow(attemptId);
    expect(row).toMatchObject({ status: 'auto_submitted', correct_count: 2, skipped_count: 2 });
  });
});

test.describe('P4.09 ordering & idempotency', () => {
  test('@api an out-of-order save (seq 5 then 3) keeps seq 5', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    const q = bank.questions[0]?.id;
    await api(context).put(`/api/attempts/${attemptId}/answers`, { changes: [{ q, o: 'C', m: false, s: 5 }] });
    const stale = await api(context).put(`/api/attempts/${attemptId}/answers`, { changes: [{ q, o: 'A', m: true, s: 3 }] });
    expect((await stale.json()).data.applied).toBe(0);
    expect(await savedAnswers(attemptId)).toEqual([{ question_id: q, selected_option: 'C', client_seq: 5 }]);
  });

  test('double-clicking Start creates one attempt', async ({ page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { examId } = await examFixture(4);
    await page.goto(`/exams/${examId}`);
    await page.getByRole('button', { name: msg('lobby.start') }).dblclick();
    await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/);
    const { count } = await testDb.from('exam_attempts').select('id', { count: 'exact', head: true }).eq('exam_id', examId);
    expect(count).toBe(1);
  });

  test('@api two concurrent submits produce one result', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    const [a, b] = await Promise.all([
      api(context).post(`/api/attempts/${attemptId}/submit`, { auto: false, changes: [] }),
      api(context).post(`/api/attempts/${attemptId}/submit`, { auto: false, changes: [] }),
    ]);
    expect([a.status(), b.status()].sort()).toEqual([200, 409]);
    const loser = a.status() === 409 ? a : b;
    expect((await loser.json()).error.meta.resultUrl).toBe(`/attempts/${attemptId}/result`);
    expect((await attemptRow(attemptId)).status).toBe('submitted');
  });

  test('two tabs on the same attempt converge after reload', async ({ context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const { bank, examId } = await examFixture(4);
    const attemptId = await startAttempt(examId, student.id);
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await openAttempt(tabA, attemptId);
    await openAttempt(tabB, attemptId);
    await card(tabA, 1).getByRole('radio').nth(0).click();
    await card(tabB, 2).getByRole('radio').nth(1).click();
    await expect.poll(async () => (await savedAnswers(attemptId)).length, { timeout: 15_000 }).toBe(2);

    for (const tab of [tabA, tabB]) {
      await openAttempt(tab, attemptId);
      await expect(card(tab, 1).getByRole('radio').nth(0)).toHaveAttribute('aria-checked', 'true');
      await expect(card(tab, 2).getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
    }
    const byQuestion = new Map((await savedAnswers(attemptId)).map((a) => [a.question_id, a.selected_option]));
    expect(byQuestion.get(bank.questions[0]?.id ?? '')).toBe('A');
    expect(byQuestion.get(bank.questions[1]?.id ?? '')).toBe('B');
  });
});
