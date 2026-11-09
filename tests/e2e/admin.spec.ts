import { randomInt } from 'node:crypto';
import type { Browser } from '@playwright/test';
import { randomMobile, testDb } from '../helpers/db';
import { makeExam, makeQuestionBank, trackMobile } from '../helpers/fixtures';
import { createStudent, expect, loginAdmin, loginStudent, msg, startAttempt, test } from '../helpers/e2e';

async function adminPage(browser: Browser) {
  const context = await browser.newContext();
  await loginAdmin(context);
  return { context, page: await context.newPage() };
}

test.describe('P4.17 admin edge cases', () => {
  test('two admins approving the same admission: one wins, the other gets ADMISSION_NOT_PENDING', async ({ browser }) => {
    const mobile = randomMobile();
    trackMobile(mobile);
    await testDb
      .rpc('submit_admission', { p_mobile: mobile, p_email: `${mobile}@e2e.local`, p_method: 'nagad', p_trx: `CC${randomInt(1e9)}`, p_plan_id: null as unknown as string, p_ip: '10.0.0.2' })
      .throwOnError();

    const admins = [await adminPage(browser), await adminPage(browser)];
    for (const { page } of admins) {
      await page.goto(`/admin/admissions?q=${mobile}`);
      await page.getByText(mobile, { exact: true }).filter({ visible: true }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: msg('admin.admissions.approve') }).click();
      await expect(page.getByRole('button', { name: msg('admin.admissions.approveAndSend') })).toBeVisible();
    }
    await Promise.all(admins.map(({ page }) => page.getByRole('button', { name: msg('admin.admissions.approveAndSend') }).click()));

    const outcomes = await Promise.all(
      admins.map(async ({ page }) => {
        const won = page.getByText(msg('admin.admissions.approvedNew', { email: `${mobile}@e2e.local` }));
        const lost = page.getByText(msg('admin.admissions.alreadyProcessed'));
        await expect(won.or(lost).first()).toBeVisible();
        return (await won.count()) > 0 ? 'won' : 'lost';
      }),
    );
    expect(outcomes.sort()).toEqual(['lost', 'won']);
    const students = await testDb.from('students').select('id').eq('mobile', mobile);
    expect(students.data).toHaveLength(1);
    await testDb.from('admissions').delete().eq('mobile', mobile);
    await testDb.from('students').delete().eq('mobile', mobile);
    for (const { context } of admins) await context.close();
  });

  test('after the first attempt the question set, unpublish and the answer key are locked', async ({ browser }) => {
    const bank = await makeQuestionBank(2);
    const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
    const student = await createStudent();
    await startAttempt(examId, student.id);
    const { context, page } = await adminPage(browser);

    await page.goto(`/admin/exams/${examId}`);
    await page.getByRole('tab', { name: /প্রশ্ন/ }).click();
    await expect(page.getByText(msg('admin.builder.lockedQuestions'))).toBeVisible();
    await expect(page.getByRole('button', { name: msg('admin.builder.saveQuestions') })).toBeDisabled();
    await page.getByRole('tab', { name: msg('admin.builder.tabs.publish') }).click();
    await expect(page.getByRole('button', { name: msg('admin.builder.unpublish') })).toHaveCount(0);

    // A used question's correct option can't change (DB trigger → QUESTION_LOCKED_CORRECT_OPTION).
    const question = bank.questions[0];
    await page.goto(`/admin/questions/${question?.id}`);
    await expect(page.getByText(msg('admin.editor.usedBanner', { n: 1 }))).toBeVisible();
    const other = question?.correct_option === 'A' ? 'B' : 'A';
    const radio = page.getByRole('radio', { name: new RegExp(`^${msg('admin.editor.optionLabel', { key: other })}`) });
    // keyboard selection: on phones the editor's sticky save bar overlaps the radios' hit area
    await radio.focus();
    await page.keyboard.press('Space');
    await expect(radio).toBeChecked();
    await page.getByRole('button', { name: msg('admin.editor.save'), exact: true }).click();
    await expect(page.getByText(msg('errors.questionLockedCorrectOption'))).toBeVisible();
    const stored = await testDb.from('questions').select('correct_option').eq('id', question?.id ?? '').single();
    expect(stored.data?.correct_option).toBe(question?.correct_option);
    await context.close();
  });

  test('featuring an exam unfeatures the previous one', async ({ browser }) => {
    const bank = await makeQuestionBank(1);
    const first = await makeExam({ questionIds: bank.questions.map((q) => q.id), startsAt: new Date(Date.now() + 86_400_000), liveEndsAt: new Date(Date.now() + 90_000_000) });
    const second = await makeExam({ questionIds: bank.questions.map((q) => q.id), startsAt: new Date(Date.now() + 86_400_000), liveEndsAt: new Date(Date.now() + 90_000_000) });
    const previous = await testDb.from('exams').select('id').eq('is_featured', true).maybeSingle();
    const { context, page } = await adminPage(browser);
    try {
      for (const examId of [first, second]) {
        await page.goto(`/admin/exams/${examId}`);
        await page.getByRole('tab', { name: msg('admin.builder.tabs.publish') }).click();
        await page.getByRole('button', { name: msg('admin.builder.feature') }).click();
        await expect(page.getByRole('button', { name: msg('admin.builder.unfeature') })).toBeVisible();
      }
      const featured = await testDb.from('exams').select('id').eq('is_featured', true);
      expect(featured.data?.map((e) => e.id)).toEqual([second]);
    } finally {
      await testDb.from('exams').update({ is_featured: false }).eq('id', second);
      if (previous.data) await testDb.from('exams').update({ is_featured: true }).eq('id', previous.data.id);
      await context.close();
    }
  });
});

test.describe('R1.1 question deletion (V2.12)', () => {
  test('bulk delete needs the count typed, then erases unused questions @desktop', async ({ browser }) => {
    const bank = await makeQuestionBank(2);
    const { context, page } = await adminPage(browser);
    await page.goto(`/admin/questions?q=${bank.slug}`);
    await page.getByRole('checkbox', { name: msg('admin.table.selectAll') }).check();
    await page.getByRole('button', { name: msg('admin.questions.delete.action') }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: msg('admin.questions.delete.cancel') })).toBeFocused();
    const confirm = dialog.getByRole('button', { name: msg('admin.questions.delete.confirm') });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(msg('admin.questions.delete.typeToConfirm', { n: 2 })).fill('2');
    await confirm.click();
    await expect(page.getByText(msg('admin.questions.delete.done', { n: 2 }))).toBeVisible();
    const left = await testDb.from('questions').select('id').in('id', bank.questions.map((q) => q.id));
    expect(left.data).toEqual([]);
    await context.close();
  });

  test('deleting a question in an upcoming exam is refused with a link to the exam', async ({ browser }) => {
    const bank = await makeQuestionBank(1);
    const question = bank.questions[0];
    const examId = await makeExam({ questionIds: [question?.id ?? ''], startsAt: new Date(Date.now() + 86_400_000), liveEndsAt: new Date(Date.now() + 90_000_000) });
    const exam = await testDb.from('exams').select('title').eq('id', examId).single();
    const { context, page } = await adminPage(browser);
    await page.goto(`/admin/questions/${question?.id}`);
    await page.getByRole('button', { name: msg('admin.editor.delete'), exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: msg('admin.questions.delete.confirm') }).click();

    const dialog = page.getByRole('dialog', { name: msg('admin.questions.delete.inUseTitle') });
    await expect(dialog.getByRole('link', { name: exam.data?.title ?? '' })).toHaveAttribute('href', `/admin/exams/${examId}`);
    await dialog.getByRole('button', { name: msg('admin.questions.delete.close'), exact: true }).click();
    const stored = await testDb.from('questions').select('deleted_at').eq('id', question?.id ?? '').single();
    expect(stored.data?.deleted_at).toBeNull();
    await context.close();
  });

  test('a question from a past exam leaves the bank but its review still renders', async ({ browser }) => {
    const bank = await makeQuestionBank(1);
    const question = bank.questions[0];
    const examId = await makeExam({ questionIds: [question?.id ?? ''] });
    const student = await createStudent();
    const attemptId = await startAttempt(examId, student.id);
    const submitted = await testDb.rpc('submit_attempt', {
      p_attempt_id: attemptId,
      p_student_id: student.id,
      p_changes: [{ q: question?.id, o: question?.correct_option, m: false, s: 1 }],
      p_auto: false,
    });
    expect(submitted.error).toBeNull();
    const past = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    await testDb.from('exams').update({ starts_at: past(3), live_ends_at: past(2), results_publish_at: past(1), answers_publish_at: past(1) }).eq('id', examId);

    const { context, page } = await adminPage(browser);
    await page.goto(`/admin/questions/${question?.id}`);
    await page.getByRole('button', { name: msg('admin.editor.delete'), exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: msg('admin.questions.delete.confirm') }).click();
    await expect(page).toHaveURL(/\/admin\/questions$/);
    await page.goto(`/admin/questions?q=${bank.slug}`);
    await expect(page.getByText(msg('admin.questions.emptyFiltered'))).toBeVisible();
    const stored = await testDb.from('questions').select('deleted_at').eq('id', question?.id ?? '').single();
    expect(stored.data?.deleted_at).not.toBeNull();
    await context.close();

    const studentContext = await browser.newContext();
    await loginStudent(studentContext, student.id);
    const studentPage = await studentContext.newPage();
    await studentPage.goto(`/attempts/${attemptId}/result`);
    await expect(studentPage.getByText(`${bank.slug} question 1`)).toBeVisible();
    await expect(studentPage.locator('li', { hasText: msg('review.srCorrect') }).first()).toBeVisible();
    await studentContext.close();
  });
});
