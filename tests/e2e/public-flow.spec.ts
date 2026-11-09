import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { makeExam, makePlan, makeQuestionBank } from '../helpers/fixtures';
import { createStudent, expect, loginStudent, msg, test } from '../helpers/e2e';

/**
 * R1.1 public site (Plan V2.30–V2.34; CR4, CR5, CR8, CR9, D4, D8): no exam data on the homepage,
 * every Enroll Now lands on /#pricing, /enroll shows exactly one plan, and /routine adds the student's
 * own exams above the plan routines.
 */
const atPricing = async (page: Page) => {
  await expect(page).toHaveURL(/\/#pricing$/);
  await expect(page.locator('#pricing')).toBeInViewport();
};

test.describe('R1.1 homepage and entry points', () => {
  test('homepage has no exam strip or routine section; hero says "Trial exam"; Enroll Now scrolls to the plans', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#routine')).toHaveCount(0);
    await expect(page.locator('#pricing')).toHaveCount(1);
    const hero = page.locator('section').first();
    const trial = hero.getByRole('link', { name: msg('home.hero.trial') });
    if (await trial.count()) await expect(trial).toHaveAttribute('href', '/sample');
    await hero.getByRole('link', { name: msg('home.hero.enroll') }).click();
    await atPricing(page);
  });

  test('header, menu, sticky bar, footer and login link all go to /#pricing', async ({ page, isMobile }) => {
    await page.goto('/faq');
    if (isMobile) {
      await page.getByRole('link', { name: msg('common.enrollNow') }).last().click(); // sticky bar
      await atPricing(page);
      await page.goto('/faq');
      await page.getByRole('button', { name: msg('common.openMenu') }).click();
      await page.getByRole('dialog').getByRole('link', { name: msg('nav.enroll') }).click();
    } else {
      await page.getByRole('banner').getByRole('link', { name: msg('common.enrollNow') }).click();
    }
    await atPricing(page);

    await page.goto('/privacy');
    await page.getByRole('contentinfo').getByRole('link', { name: msg('nav.enroll') }).click();
    await atPricing(page);

    await page.goto('/login');
    await page.getByRole('main').getByRole('link', { name: msg('login.enrollLink') }).click();
    await atPricing(page);
  });
});

test.describe('R1.1 single-plan enrollment', () => {
  test('missing, unknown or inactive plan → /#pricing; a valid plan shows only that plan', async ({ page }) => {
    const inactive = await makePlan();
    for (const url of ['/enroll', '/enroll?plan=no-such-plan', `/enroll?plan=${inactive.code}`]) {
      await page.goto(url);
      await atPricing(page);
    }
    const plan = await makePlan({ active: true });
    const other = await makePlan({ active: true });
    await page.goto(`/enroll?plan=${plan.code}`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: `প্ল্যান ${plan.code}` })).toBeVisible();
    await expect(main.getByText(`প্ল্যান ${other.code}`)).toHaveCount(0);
    await expect(main.getByRole('link', { name: new RegExp(msg('home.pricing.choose')) })).toHaveCount(0);
    await expect(main.getByRole('radiogroup')).toHaveCount(1); // payment method only, no plan picker
  });

  test('renewal keeps working: /renew → /enroll?plan=…&kind=renewal with the renewal note', async ({ page, context }) => {
    const plan = await makePlan({ active: true });
    const student = await createStudent({ expired: true });
    await loginStudent(context, student.id);
    await page.goto('/renew');
    const link = page.locator(`a[href="/enroll?plan=${plan.code}&kind=renewal"]`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/enroll\\?plan=${plan.code}&kind=renewal$`));
    await expect(page.getByText(msg('enroll.renewalNote'))).toBeVisible();
    await expect(page.getByLabel(msg('enroll.form.mobile'))).toHaveValue(student.mobile);
  });
});

test.describe('R1.1 /routine', () => {
  test('a student sees "Your routine" with only their plan\'s exams; a visitor sees only plan routines', async ({ browser }) => {
    const bank = await makeQuestionBank(1);
    const [planA, planB] = [await makePlan(), await makePlan()];
    const tomorrow = Date.now() + 86_400_000;
    const at = { startsAt: new Date(tomorrow), liveEndsAt: new Date(tomorrow + 3_600_000) };
    const forA = await makeExam({ questionIds: bank.questions.map((q) => q.id), audience: 'plans', planIds: [planA.id], ...at });
    const forB = await makeExam({ questionIds: bank.questions.map((q) => q.id), audience: 'plans', planIds: [planB.id], ...at });
    const titles = Object.fromEntries(((await testDb.from('exams').select('id, title').in('id', [forA, forB])).data ?? []).map((e) => [e.id, e.title]));

    const studentContext = await browser.newContext();
    const student = await createStudent({ planId: planA.id });
    await loginStudent(studentContext, student.id);
    const page = await studentContext.newPage();
    await page.goto('/routine');
    const yours = page.getByTestId('your-routine');
    await expect(yours.getByRole('heading', { name: msg('routinePage.yours') })).toBeVisible();
    await expect(yours.getByRole('link', { name: new RegExp(titles[forA] ?? '') })).toHaveAttribute('href', `/exams/${forA}`);
    await expect(yours.getByText(titles[forB] ?? '')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: msg('routinePage.plans') })).toBeVisible();
    await studentContext.close();

    const visitor = await browser.newContext();
    const anon = await visitor.newPage();
    await anon.goto('/routine');
    await expect(anon.getByRole('heading', { name: msg('routinePage.plans') })).toBeVisible();
    await expect(anon.getByTestId('your-routine')).toHaveCount(0);
    for (const title of Object.values(titles)) await expect(anon.getByText(title)).toHaveCount(0);
    await visitor.close();
  });
});
