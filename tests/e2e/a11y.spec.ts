import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { makeExam, makeQuestionBank } from '../helpers/fixtures';
import { attemptRow, createStudent, expect, loginStudent, msg, openAttempt, startAttempt, test } from '../helpers/e2e';

/** P4.21 accessibility (docs/03_UI_Spec.md §9): axe 0 serious/critical, keyboard-only exam, theme screenshots. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('P4.21 axe scans', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`public pages (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      // R1.1: /enroll needs an active plan (?plan=<code>).
      const plan = (await testDb.from('plans').select('code').eq('is_active', true).limit(1).maybeSingle()).data;
      const enroll = plan ? `/enroll?plan=${plan.code}` : '/enroll';
      for (const path of ['/', '/routine', enroll, '/faq', '/privacy', '/login', '/sample']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page), path).toEqual([]);
      }
    });

    test(`student, exam and review pages (${scheme})`, async ({ page, context }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const student = await createStudent();
      await loginStudent(context, student.id);
      const bank = await makeQuestionBank(4);
      const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
      for (const path of ['/dashboard', '/exams', `/exams/${examId}`, '/results', '/profile', '/renew']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        expect(await seriousViolations(page), path).toEqual([]);
      }
      const attemptId = await startAttempt(examId, student.id);
      await openAttempt(page, attemptId);
      expect(await seriousViolations(page), 'exam page').toEqual([]);
      await page.getByRole('button', { name: msg('examPage.submit') }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: msg('examPage.submit') }).click();
      await expect(page).toHaveURL(/\/result$/);
      await page.waitForLoadState('networkidle');
      expect(await seriousViolations(page), 'result page').toEqual([]);
    });
  }
});

test('P4.21 an exam can be completed with the keyboard only @desktop', async ({ page, context }) => {
  const student = await createStudent();
  await loginStudent(context, student.id);
  const bank = await makeQuestionBank(3);
  const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
  const attemptId = await startAttempt(examId, student.id);
  await openAttempt(page, attemptId);

  // Tab to the first option, choose with Space/digit keys, J moves to the next card.
  await page.locator('article[data-index="0"]').focus();
  await page.keyboard.press('1');
  await page.keyboard.press('j');
  await page.keyboard.press('2');
  await page.keyboard.press('j');
  await page.keyboard.press('3');
  await expect(page.locator('article[data-index="2"]').getByRole('radio').nth(2)).toHaveAttribute('aria-checked', 'true');

  // Reach Submit by tabbing, open the dialog with Enter, confirm with Enter.
  const submit = page.getByRole('button', { name: msg('examPage.submit') }).first();
  for (let i = 0; i < 40 && !(await submit.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog').getByRole('button', { name: msg('examPage.submit') });
  for (let i = 0; i < 10 && !(await confirm.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/result$/);
  const row = await attemptRow(attemptId);
  expect((row.correct_count ?? 0) + (row.incorrect_count ?? 0)).toBe(3);
});

test('P4.21 Bangla + KaTeX rendering screenshots in both themes', async ({ page, context }, testInfo) => {
  const student = await createStudent();
  await loginStudent(context, student.id);
  const bank = await makeQuestionBank(3);
  const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
  const attemptId = await startAttempt(examId, student.id);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await openAttempt(page, attemptId);
    await expect(page.locator('.katex').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`exam-${scheme}.png`) });
    await page.goto('/sample');
    await expect(page.locator('article[data-index="0"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`sample-${scheme}.png`), fullPage: true });
  }
});
