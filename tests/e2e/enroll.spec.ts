import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { randomMobile, testDb } from '../helpers/db';
import { makePlan, trackMobile } from '../helpers/fixtures';
import { expect, msg, test } from '../helpers/e2e';

/** P4.03 enrollment validation (docs/02_AppFlow.md §4.3). */
async function submit(page: Page, fields: { mobile: string; email?: string; trx: string }) {
  await page.getByLabel(msg('enroll.form.mobile')).fill(fields.mobile);
  await page.getByLabel(msg('enroll.form.email')).fill(fields.email ?? `${randomInt(1e9)}@e2e.local`);
  await page.getByRole('radio', { name: 'Nagad' }).click();
  await page.getByLabel(msg('enroll.form.trx')).fill(fields.trx);
  await page.getByRole('button', { name: msg('enroll.form.submit') }).click();
}

const trx = () => `QA${randomInt(1e9)}`;

test.describe('P4.03 enrollment validation', () => {
  // R1.1 (CR9): /enroll needs ?plan=<code> of an active plan.
  let enrollUrl = '';
  test.beforeEach(async ({ page }) => {
    enrollUrl = `/enroll?plan=${(await makePlan({ active: true })).code}`;
    await page.goto(enrollUrl);
  });

  for (const bad of ['0171234567', '01212345678', '+88012345678901', '1712345678']) {
    test(`rejects mobile ${bad}`, async ({ page }) => {
      await submit(page, { mobile: bad, trx: trx() });
      await expect(page.getByText(msg('errors.mobileInvalid'))).toBeVisible();
      await expect(page).toHaveURL(/\/enroll\?plan=/);
    });
  }

  test('accepts +880 and spaced forms, normalised to 01…', async ({ page }) => {
    const mobile = randomMobile();
    trackMobile(mobile);
    await submit(page, { mobile: `+880 ${mobile.slice(1, 5)} ${mobile.slice(5)}`, trx: trx() });
    await expect(page).toHaveURL(/\/enroll\/success$/);
    const row = await testDb.from('admissions').select('mobile').eq('mobile', mobile).maybeSingle();
    expect(row.data?.mobile).toBe(mobile);
  });

  test('duplicate TrxID is caught across case, space and dash variants', async ({ page }) => {
    const base = `QA${randomInt(1e8)}XY`;
    const first = randomMobile();
    trackMobile(first);
    await submit(page, { mobile: first, trx: base });
    await expect(page).toHaveURL(/\/enroll\/success$/);

    for (const variant of [base.toLowerCase(), `${base.slice(0, 4)} ${base.slice(4)}`, `${base.slice(0, 4)}-${base.slice(4)}`]) {
      const other = randomMobile();
      trackMobile(other);
      await page.goto(enrollUrl);
      await submit(page, { mobile: other, trx: variant });
      await expect(page.getByText(msg('errors.trxDuplicate'))).toBeVisible();
      // the form keeps its values
      await expect(page.getByLabel(msg('enroll.form.mobile'))).toHaveValue(other);
    }
  });

  test('a second request for the same mobile is blocked while one is pending', async ({ page }) => {
    const mobile = randomMobile();
    trackMobile(mobile);
    await submit(page, { mobile, trx: trx() });
    await expect(page).toHaveURL(/\/enroll\/success$/);
    await page.goto(enrollUrl);
    await submit(page, { mobile, trx: trx() });
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('enroll.banner.pending'));
  });

  test('the 6th submission from one IP within an hour is rate limited', async ({ page, ip }) => {
    await testDb
      .from('rate_limit_events')
      .insert(Array.from({ length: 5 }, () => ({ bucket: 'enroll_ip', subject: ip })))
      .throwOnError();
    const mobile = randomMobile();
    trackMobile(mobile);
    await submit(page, { mobile, trx: trx() });
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('enroll.banner.rateLimited'));
    await testDb.from('rate_limit_events').delete().eq('subject', ip);
  });

  test('submitting offline shows a banner and keeps the form values', async ({ page, context }) => {
    const mobile = randomMobile();
    const id = trx();
    await page.getByLabel(msg('enroll.form.mobile')).fill(mobile);
    await page.getByLabel(msg('enroll.form.email')).fill('offline@e2e.local');
    await page.getByRole('radio', { name: 'Nagad' }).click();
    await page.getByLabel(msg('enroll.form.trx')).fill(id);
    await context.setOffline(true);
    await page.getByRole('button', { name: msg('enroll.form.submit') }).click();
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('enroll.banner.network'));
    await expect(page.getByLabel(msg('enroll.form.mobile'))).toHaveValue(mobile);
    await expect(page.getByLabel(msg('enroll.form.trx'))).toHaveValue(id);
    await context.setOffline(false);
  });
});
