import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { trackQuestion } from '../helpers/fixtures';
import { expect, loginAdmin, msg, test } from '../helpers/e2e';

/** P4.18 bulk-import edge cases through the wizard (docs/02_AppFlow.md §6.7, PRD A-08). */
const HEADER = 'subject,chapter_number,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,difficulty,type,source,board_year,tags';
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const row = (stem: string, extra: Partial<Record<'correct' | 'explanation' | 'tags', string>> = {}) =>
  ['ict', '3', '', stem, 'এক', 'দুই', 'তিন', 'চার', extra.correct ?? 'B', extra.explanation ?? '', '', '', '', '', extra.tags ?? ''].map(csvCell).join(',');

async function upload(page: Page, name: string, content: string) {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content, 'utf8') });
}

test.describe('P4.18 import edge cases @desktop', () => {
  test.beforeEach(async ({ context, page }) => {
    await loginAdmin(context);
    await page.goto('/admin/questions/import');
  });

  test('more than 2,000 rows → IMPORT_TOO_LARGE', async ({ page }) => {
    const rows = Array.from({ length: 2001 }, (_, i) => row(`too large ${i}`));
    await upload(page, 'big.csv', [HEADER, ...rows].join('\n'));
    await expect(page.getByText(msg('errors.importTooLarge'))).toBeVisible();
  });

  test('wrong headers → IMPORT_BAD_HEADERS', async ({ page }) => {
    await upload(page, 'bad.csv', 'question,a,b,c,d,answer\nx,1,2,3,4,A');
    await expect(page.getByText(msg('errors.importBadHeaders'))).toBeVisible();
  });

  test('duplicates in the file and against the bank are skipped; Bangla + LaTeX round-trips; optional columns may be empty', async ({ page }) => {
    const token = `IMP${randomInt(1e9)}`;
    const bangla = `${token} বাইনারি $(1011)_2$ এর দশমিক মান কত? \`x+1\``;
    const existing = (await testDb.from('questions').select('stem, option_a, option_b, option_c, option_d').eq('status', 'active').limit(1).single()).data;
    const dbDuplicate = existing ? [ 'ict', '3', '', existing.stem, existing.option_a, existing.option_b, existing.option_c, existing.option_d, 'A', '', '', '', '', '', ''].map(csvCell).join(',') : '';
    const lines = [
      HEADER,
      row(bangla, { explanation: `${token} ব্যাখ্যা $$2^3$$`, tags: `${token.toLowerCase()}|math` }),
      row(`${token} empty optionals`),
      row(`${token} empty optionals`), // duplicate within the file
      dbDuplicate,
      row(`${token} bad answer`, { correct: 'E' }),
    ].filter(Boolean);
    await upload(page, 'mixed.csv', lines.join('\n'));

    const counts = page.locator('section, div').filter({ hasText: msg('admin.import.step2') }).first();
    await expect(counts).toBeVisible();
    await expect(page.getByRole('button', { name: msg('admin.import.importN', { n: 2 }) })).toBeVisible();
    await expect(page.getByText(msg('admin.import.errorsTitle'))).toBeVisible();
    await page.getByRole('button', { name: msg('admin.import.importN', { n: 2 }) }).click();
    await expect(page.getByText(msg('admin.import.done', { n: 2 }))).toBeVisible();
    await expect(page.getByText(msg('admin.import.doneDetail', { d: 2, e: 1 }))).toBeVisible();

    const imported = (await testDb.from('questions').select('id, stem, explanation, source, board_year, status').like('stem', `${token}%`)).data ?? [];
    imported.forEach((q) => trackQuestion(q.id));
    expect(imported).toHaveLength(2);
    const math = imported.find((q) => q.stem.includes('বাইনারি'));
    expect(math?.stem).toBe(bangla);
    expect(math?.explanation).toBe(`${token} ব্যাখ্যা $$2^3$$`);
    const plain = imported.find((q) => q.stem.endsWith('empty optionals'));
    expect(plain).toMatchObject({ explanation: null, source: null, board_year: null, status: 'draft' });
    await testDb.from('tags').delete().eq('name', token.toLowerCase());
  });
});
