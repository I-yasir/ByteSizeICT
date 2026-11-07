import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { randomMobile, testDb } from '../helpers/db';
import { trackMobile, trackStudent } from '../helpers/fixtures';
import { BASE_URL, createStudent, expect, loginAdmin, loginStudent, msg, pinFromMailbox, SEED_PIN, test } from '../helpers/e2e';

async function fillLogin(page: Page, mobile: string, pin: string) {
  await page.getByLabel(msg('login.mobile')).fill(mobile);
  await page.getByLabel(msg('login.pin'), { exact: true }).fill(pin);
  await page.getByRole('button', { name: msg('login.submit') }).click();
}

test.describe('P4.02 enrollment → approval → first login → forced PIN change', () => {
  test('a visitor becomes a student with an emailed PIN', async ({ page, browser }) => {
    const mobile = randomMobile();
    const email = `${mobile}@e2e.local`;
    trackMobile(mobile);

    await page.goto('/enroll');
    await page.getByLabel(msg('enroll.form.mobile')).fill(mobile);
    await page.getByLabel(msg('enroll.form.email')).fill(email);
    await page.getByRole('radio', { name: 'bKash' }).click();
    await page.getByLabel(msg('enroll.form.trx')).fill(`E2E${randomInt(1e9)}`);
    await page.getByRole('button', { name: msg('enroll.form.submit') }).click();
    await expect(page).toHaveURL(/\/enroll\/success$/);

    // Admin approves from the queue drawer (separate browser context).
    const adminContext = await browser.newContext();
    await loginAdmin(adminContext);
    const admin = await adminContext.newPage();
    await admin.goto(`/admin/admissions?q=${mobile}`);
    await admin.getByText(mobile, { exact: true }).filter({ visible: true }).first().click();
    await admin.getByRole('dialog').getByRole('button', { name: msg('admin.admissions.approve') }).click();
    await admin.getByRole('button', { name: msg('admin.admissions.approveAndSend') }).click();
    await expect(admin.getByText(msg('admin.admissions.approvedNew', { email }))).toBeVisible();
    await adminContext.close();

    const student = await testDb.from('students').select('id, credentials_status').eq('mobile', mobile).single();
    expect(student.data?.credentials_status).toBe('sent');
    trackStudent(student.data?.id ?? '');

    const pin = await pinFromMailbox(email);
    await page.goto('/login');
    await fillLogin(page, mobile, pin);
    await expect(page).toHaveURL(/\/change-pin$/);
    // Every student route bounces to /change-pin until the PIN is changed.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/change-pin$/);

    await page.getByLabel(msg('changePin.newPin'), { exact: true }).fill(pin);
    await page.getByLabel(msg('changePin.confirm'), { exact: true }).fill(pin);
    await page.getByRole('button', { name: msg('changePin.submit') }).click();
    await expect(page.getByText(msg('errors.pinSameAsOld'))).toBeVisible();

    await page.getByLabel(msg('changePin.newPin'), { exact: true }).fill('583920');
    await page.getByLabel(msg('changePin.confirm'), { exact: true }).fill('583920');
    await page.getByRole('button', { name: msg('changePin.submit') }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('P4.04 login security', () => {
  test('attempts-left countdown, then a 15-minute lock that survives a correct PIN', async ({ page }) => {
    const student = await createStudent();
    await page.goto('/login');
    for (let left = 4; left >= 1; left--) {
      await fillLogin(page, student.mobile, '999999');
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('errors.invalidCredentials', { attemptsLeft: left }));
    }
    await fillLogin(page, student.mobile, '999999');
    await expect(page.getByRole('main').getByRole('alert')).toContainText(msg('errors.locked', { time: '' }).split('{')[0]?.slice(0, 20) ?? '');
    await expect(page.getByLabel(msg('login.pin'), { exact: true })).toBeDisabled();

    // Even the right PIN is refused while locked.
    await page.reload();
    await fillLogin(page, student.mobile, SEED_PIN);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  });

  test('an unknown mobile gets the same response shape as a wrong PIN', async ({ page }) => {
    await page.goto('/login');
    await fillLogin(page, randomMobile(), '999999');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('errors.invalidCredentials', { attemptsLeft: 4 }));
  });

  test('suspension is revealed only after a correct PIN', async ({ page }) => {
    const student = await createStudent({ status: 'suspended' });
    await page.goto('/login');
    await fillLogin(page, student.mobile, '999999');
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('errors.invalidCredentials', { attemptsLeft: 4 }));
    await fillLogin(page, student.mobile, SEED_PIN);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(msg('errors.suspended'));
  });

  test('IP rate limit after 20 attempts in 10 minutes', async ({ page, ip }) => {
    await testDb
      .from('rate_limit_events')
      .insert(Array.from({ length: 20 }, () => ({ bucket: 'login_ip', subject: ip })))
      .throwOnError();
    const student = await createStudent();
    await page.goto('/login');
    await fillLogin(page, student.mobile, SEED_PIN);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(msg('errors.rateLimited'));
    await testDb.from('rate_limit_events').delete().eq('subject', ip);
  });

  test('open redirects in ?next= are ignored', async ({ page }) => {
    const student = await createStudent();
    for (const next of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
      await page.context().clearCookies();
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await fillLogin(page, student.mobile, SEED_PIN);
      await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
    }
  });

  test('a safe ?next= is honoured', async ({ page }) => {
    const student = await createStudent();
    await page.goto('/exams');
    await expect(page).toHaveURL(/\/login\?next=%2Fexams$/);
    await fillLogin(page, student.mobile, SEED_PIN);
    await expect(page).toHaveURL(/\/exams$/);
  });
});

test.describe('P4.05 sessions', () => {
  test('a second-device login logs out the first with a reason banner', async ({ browser, page }) => {
    const student = await createStudent();
    await page.goto('/login');
    await fillLogin(page, student.mobile, SEED_PIN);
    await expect(page).toHaveURL(/\/dashboard$/);

    const second = await browser.newContext();
    const other = await second.newPage();
    await other.goto('/login');
    await fillLogin(other, student.mobile, SEED_PIN);
    await expect(other).toHaveURL(/\/dashboard$/);
    await second.close();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?reason=new_login/);
    await expect(page.getByText(msg('login.reasons.new_login'))).toBeVisible();
  });

  test('maxDevices = 2 allows two concurrent sessions', async ({ browser, page }) => {
    const before = await testDb.from('app_settings').select('value').eq('key', 'auth').single();
    await testDb.from('app_settings').update({ value: { maxDevices: 2 } }).eq('key', 'auth').throwOnError();
    try {
      const student = await createStudent();
      await page.goto('/login');
      await fillLogin(page, student.mobile, SEED_PIN);
      await expect(page).toHaveURL(/\/dashboard$/);
      const second = await browser.newContext();
      const other = await second.newPage();
      await other.goto('/login');
      await fillLogin(other, student.mobile, SEED_PIN);
      await expect(other).toHaveURL(/\/dashboard$/);
      await second.close();
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/dashboard$/);
    } finally {
      await testDb.from('app_settings').update({ value: before.data?.value ?? { maxDevices: 1 } }).eq('key', 'auth');
    }
  });

  test('changing the PIN revokes other sessions but keeps the current one', async ({ browser, page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    const second = await browser.newContext();
    await loginStudent(second, student.id);
    const other = await second.newPage();

    await page.goto('/profile');
    await page.getByLabel(msg('profile.currentPin'), { exact: true }).fill(SEED_PIN);
    await page.getByLabel(msg('profile.newPin'), { exact: true }).fill('583920');
    await page.getByLabel(msg('profile.confirmPin'), { exact: true }).fill('583920');
    await page.getByRole('button', { name: msg('profile.savePin') }).click();
    await expect(page.getByText(msg('profile.pinChanged'))).toBeVisible();

    await other.goto('/dashboard');
    await expect(other).toHaveURL(/\/login\?reason=pin_changed/);
    await second.close();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('admin force logout ends the student session', async ({ browser, page, context }) => {
    const student = await createStudent();
    await loginStudent(context, student.id);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard$/);

    const adminContext = await browser.newContext();
    await loginAdmin(adminContext);
    const admin = await adminContext.newPage();
    await admin.goto(`/admin/students/${student.id}`);
    await admin.getByRole('button', { name: msg('admin.students.actions.menu') }).click();
    await admin.getByRole('menuitem', { name: msg('admin.students.actions.logout.label') }).click();
    await admin.getByRole('dialog').getByRole('button', { name: msg('admin.students.actions.confirm') }).click();
    await expect(admin.getByText(msg('admin.students.actions.done'))).toBeVisible();
    await adminContext.close();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?reason=admin_force_logout/);
    await expect(page.getByText(msg('login.reasons.admin'))).toBeVisible();
  });
});
