import { randomInt } from 'node:crypto';
import type { Browser } from '@playwright/test';
import { randomMobile, testDb } from '../helpers/db';
import { makeExam, makeQuestionBank, trackMobile } from '../helpers/fixtures';
import { createStudent, expect, loginAdmin, msg, startAttempt, test } from '../helpers/e2e';

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
