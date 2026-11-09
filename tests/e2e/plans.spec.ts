import { randomInt } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { expect, loginAdmin, msg, test } from '../helpers/e2e';

/**
 * R1.1 plan routines (Plan V2.20–V2.22, D4/D6, CR7): Settings → Plans requires a routine PDF on create,
 * legacy plans get a warning, plan cards show View/Download routine above an all-primary
 * "Choose this plan", and /routine lists every plan's PDF for visitors.
 */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test.describe('R1.1 plan routines @desktop', () => {
  test('create needs a PDF; cards and /routine show it; legacy plans warn and show "coming soon"', async ({ browser }) => {
    const n = randomInt(1e6);
    const withPdf = { code: `rt-${n}`, nameBn: `রুটিন প্ল্যান ${n}`, nameEn: `Routine plan ${n}` };
    const legacy = { code: `lg-${n}`, name_bn: `পুরোনো প্ল্যান ${n}`, name_en: `Legacy plan ${n}` };
    await testDb.from('plans').insert({ ...legacy, duration_days: 30, price_bdt: 300, is_active: true, sort_order: 998 });

    const admin = await browser.newContext();
    await loginAdmin(admin);
    const page = await admin.newPage();
    try {
      await page.goto('/admin/settings');
      await page.getByRole('tab', { name: msg('admin.settings.tabs.plans') }).click();
      const legacyCard = page.locator('div', { hasText: legacy.name_bn }).filter({ has: page.getByRole('button', { name: msg('admin.settings.edit') }) }).last();
      await expect(legacyCard.getByText(msg('admin.settings.routineMissing'))).toBeVisible();

      await page.getByRole('button', { name: msg('admin.settings.addPlan') }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel(msg('admin.settings.code')).fill(withPdf.code);
      await dialog.getByLabel(msg('admin.settings.nameBn')).fill(withPdf.nameBn);
      await dialog.getByLabel(msg('admin.settings.nameEn')).fill(withPdf.nameEn);
      await dialog.getByLabel(msg('admin.settings.price')).fill('750');
      await dialog.getByLabel(msg('admin.settings.sortOrder')).fill('999');
      await dialog.getByRole('button', { name: msg('admin.settings.save') }).click();
      await expect(dialog.getByText(msg('errors.routinePdfRequired'))).toBeVisible();

      await dialog.getByLabel(msg('admin.settings.routinePdf')).setInputFiles({ name: 'routine.pdf', mimeType: 'application/pdf', buffer: PDF });
      await expect(dialog.getByText('routine.pdf')).toBeVisible();
      await dialog.getByRole('button', { name: msg('admin.settings.save') }).click();
      await expect(dialog).toHaveCount(0);
      const stored = (await testDb.from('plans').select('routine_pdf_path').eq('code', withPdf.code).single()).data;
      expect(stored?.routine_pdf_path).toMatch(/^plans\/[0-9a-f-]{36}\.pdf$/);

      // Visitor: homepage pricing.
      const visitor = await browser.newContext();
      const home = await visitor.newPage();
      for (const scheme of ['light', 'dark'] as const) {
        await home.emulateMedia({ colorScheme: scheme });
        await home.goto('/');
        const card = home.locator('#pricing li', { hasText: withPdf.nameBn });
        const view = card.getByTestId('view-routine');
        await expect(view).toBeVisible();
        await expect(view).toHaveAttribute('target', '_blank');
        await expect(card.getByTestId('download-routine')).toBeVisible();
        // "Choose this plan" sits below the routine button and is primary on every card.
        const choose = card.getByRole('link', { name: new RegExp(msg('home.pricing.choose')) });
        expect((await view.boundingBox())?.y ?? 0).toBeLessThan((await choose.boundingBox())?.y ?? 0);
        await expect(choose).toHaveClass(/bg-primary/);
        await expect(home.locator('#pricing li', { hasText: legacy.name_bn }).getByTestId('view-routine')).toHaveCount(0);
        for (const link of await home.locator('#pricing').getByRole('link', { name: new RegExp(msg('home.pricing.choose')) }).all()) {
          await expect(link).toHaveClass(/bg-primary/);
        }
        expect(await seriousViolations(home), `/ (${scheme})`).toEqual([]);
      }
      const pdfUrl = await home.locator('#pricing li', { hasText: withPdf.nameBn }).getByTestId('view-routine').getAttribute('href');
      const response = await home.request.get(pdfUrl ?? '');
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('application/pdf');
      const download = await home.request.get((await home.locator('#pricing li', { hasText: withPdf.nameBn }).getByTestId('download-routine').getAttribute('href')) ?? '');
      expect(download.headers()['content-disposition']).toContain('attachment');

      // Visitor: /routine lists every plan, with "coming soon" for a plan without a PDF.
      for (const scheme of ['light', 'dark'] as const) {
        await home.emulateMedia({ colorScheme: scheme });
        await home.goto('/routine');
        await expect(home.getByRole('heading', { level: 1, name: msg('routinePage.title') })).toBeVisible();
        const routineCard = home.locator('li', { hasText: withPdf.nameBn });
        await expect(routineCard.getByTestId('view-routine')).toHaveAttribute('href', pdfUrl ?? '');
        await expect(routineCard.getByRole('link', { name: new RegExp(msg('home.pricing.choose')) })).toHaveAttribute('href', `/enroll?plan=${withPdf.code}`);
        await expect(home.locator('li', { hasText: legacy.name_bn }).getByText(msg('home.pricing.routineSoon'))).toBeVisible();
        expect(await seriousViolations(home), `/routine (${scheme})`).toEqual([]);
      }
      await visitor.close();
    } finally {
      // Deactivate through the UI so the cached public pages are revalidated, then remove the rows.
      await page.goto('/admin/settings');
      await page.getByRole('tab', { name: msg('admin.settings.tabs.plans') }).click();
      for (const [name, code] of [[withPdf.nameBn, withPdf.code], [legacy.name_bn, legacy.code]] as const) {
        const card = page.locator('div', { hasText: name }).filter({ has: page.getByRole('button', { name: msg('admin.settings.deactivate') }) }).last();
        if (await card.count()) {
          await card.getByRole('button', { name: msg('admin.settings.deactivate') }).click();
          await expect.poll(async () => (await testDb.from('plans').select('is_active').eq('code', code).single()).data?.is_active).toBe(false);
        }
      }
      const paths = (await testDb.from('plans').select('routine_pdf_path').in('code', [withPdf.code, legacy.code])).data ?? [];
      const files = paths.flatMap((p) => (p.routine_pdf_path ? [p.routine_pdf_path] : []));
      if (files.length) await testDb.storage.from('plan-routines').remove(files);
      await testDb.from('plans').delete().in('code', [withPdf.code, legacy.code]);
      await admin.close();
    }
  });
});
