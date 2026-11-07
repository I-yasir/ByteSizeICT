import { expect, test } from '../helpers/e2e';

/** P4.01 harness smoke: public site renders and the free sample exam scores end to end. */
test('homepage renders and the sample exam completes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');

  await page.goto('/sample');
  const firstQuestion = page.locator('article[data-index="0"]');
  await firstQuestion.getByRole('radio').first().click();
  await expect(firstQuestion.getByRole('radio').first()).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'জমা দিন' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'জমা দিন' }).click();
  await expect(page).toHaveURL(/\/sample\/result$/);
  await expect(page.getByRole('heading', { name: 'স্যাম্পল পরীক্ষার ফলাফল' })).toBeVisible();
});
