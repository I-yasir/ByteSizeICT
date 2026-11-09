import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { testDb } from '../helpers/db';
import { makeQuestionBank, trackQuestion } from '../helpers/fixtures';
import { expect, loginAdmin, msg, test } from '../helpers/e2e';
import { buildWorkbook, makePng, questionRow } from '../helpers/xlsx';

/** P4.18 bulk-import edge cases through the wizard (docs/02_AppFlow.md §6.7, PRD A-08). R1.1: the R1
 * template's five removed columns are still accepted and ignored with a warning (D9). */
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

  test('legacy columns are ignored with a warning; duplicates in the file and against the bank are skipped; Bangla + LaTeX round-trips; optional columns may be empty', async ({ page }) => {
    const token = `IMP${randomInt(1e9)}`;
    const bangla = `${token} বাইনারি $(1011)_2$ এর দশমিক মান কত? \`x+1\``;
    // Self-contained "already in the bank" duplicate, so the spec also runs on an empty production DB.
    const existing = (await makeQuestionBank(1)).questions[0];
    const stored = (await testDb.from('questions').select('stem, option_a, option_b, option_c, option_d').eq('id', existing?.id ?? '').single()).data;
    const dbDuplicate = ['ict', '3', '', stored?.stem ?? '', stored?.option_a ?? '', stored?.option_b ?? '', stored?.option_c ?? '', stored?.option_d ?? '', 'A', '', '', '', '', '', ''].map(csvCell).join(',');
    const lines = [
      HEADER,
      row(bangla, { explanation: `${token} ব্যাখ্যা $$2^3$$`, tags: `${token.toLowerCase()}|math` }),
      row(`${token} empty optionals`),
      row(`${token} empty optionals`), // duplicate within the file
      dbDuplicate,
      row(`${token} bad answer`, { correct: 'E' }),
    ];
    await upload(page, 'mixed.csv', lines.join('\n'));

    const counts = page.locator('section, div').filter({ hasText: msg('admin.import.step2') }).first();
    await expect(counts).toBeVisible();
    await expect(page.getByText(msg('admin.import.legacyColumns', { columns: 'difficulty, type, source, board_year, tags' }))).toBeVisible();
    await expect(page.getByRole('button', { name: msg('admin.import.importN', { n: 2 }) })).toBeVisible();
    await expect(page.getByText(msg('admin.import.errorsTitle'))).toBeVisible();
    await page.getByRole('button', { name: msg('admin.import.importN', { n: 2 }) }).click();
    await expect(page.getByText(msg('admin.import.done', { n: 2 }))).toBeVisible();
    await expect(page.getByText(msg('admin.import.doneDetail', { d: 2, e: 1 }))).toBeVisible();

    const imported = (await testDb.from('questions').select('id, stem, explanation, status').like('stem', `${token}%`)).data ?? [];
    imported.forEach((q) => trackQuestion(q.id));
    expect(imported).toHaveLength(2);
    const math = imported.find((q) => q.stem.includes('বাইনারি'));
    expect(math?.stem).toBe(bangla);
    expect(math?.explanation).toBe(`${token} ব্যাখ্যা $$2^3$$`);
    const plain = imported.find((q) => q.stem.endsWith('empty optionals'));
    expect(plain).toMatchObject({ explanation: null, status: 'draft' });
  });

  test('Excel pictures: progress, picture counts, per-cell errors; imported pictures render in the editor', async ({ page }) => {
    const token = `PIC${randomInt(1e9)}`;
    const file = await buildWorkbook({
      rows: [questionRow(`${token} stem picture`), questionRow(`${token} image-only B`, { option_b: '' }), questionRow(`${token} two pictures`)],
      pictures: [
        { row: 2, column: 'stem_image', bytes: makePng(60, 40, [200, 30, 30]) },
        { row: 3, column: 'option_b_image', bytes: makePng(30, 30) },
        { row: 4, column: 'stem_image', bytes: makePng() },
        { row: 4, column: 'stem_image', bytes: makePng(4, 4) },
      ],
    });
    await page.locator('input[type="file"]').setInputFiles({ name: 'pictures.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: file });

    await expect(page.getByText(msg('admin.import.step2'))).toBeVisible();
    const tile = (label: string) => page.locator('dl > div').filter({ hasText: label }).locator('dd');
    await expect(tile(msg('admin.import.images'))).toHaveText('2');
    await expect(tile(msg('admin.import.invalid'))).toHaveText('1');
    await expect(page.getByRole('row', { name: new RegExp(`4\\s*stem_image\\s*${msg('admin.import.imageIssues.two_pictures')}`) })).toBeVisible();
    await page.getByRole('button', { name: msg('admin.import.importN', { n: 2 }) }).click();
    await expect(page.getByText(msg('admin.import.done', { n: 2 }))).toBeVisible();
    await expect(page.getByText(msg('admin.import.doneImages', { n: 2 }))).toBeVisible();

    const imported = (await testDb.from('questions').select('id, stem, stem_image_path, option_b_image_path').like('stem', `${token}%`)).data ?? [];
    imported.forEach((q) => trackQuestion(q.id));
    const withStem = imported.find((q) => q.stem.endsWith('stem picture'));
    expect(withStem?.stem_image_path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);
    await page.goto(`/admin/questions/${withStem?.id}`);
    const picture = page.locator('img[src*="question-media"]').first();
    await expect(picture).toBeVisible();
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
  });

  test('a 15 MB workbook parses in the browser and uploads straight to Storage', async ({ page }) => {
    test.setTimeout(180_000);
    const token = `BIG${randomInt(1e9)}`;
    const count = 17;
    const file = await buildWorkbook({
      rows: Array.from({ length: count }, (_, i) => questionRow(`${token} big ${i}`)),
      pictures: Array.from({ length: count }, (_, i) => ({ row: i + 2, column: 'stem_image', bytes: makePng(8, 8, [i * 10, 50, 90], 960_000) })),
    });
    expect(file.length).toBeGreaterThan(15 * 1024 * 1024);
    await page.locator('input[type="file"]').setInputFiles({ name: 'big.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: file });
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByRole('button', { name: msg('admin.import.importN', { n: count }) })).toBeVisible({ timeout: 120_000 });
    await expect(page.locator('dl > div').filter({ hasText: msg('admin.import.images') }).locator('dd')).toHaveText(String(count));

    // Cancel drops the staged pictures and rows JSON.
    await page.getByRole('button', { name: msg('admin.import.cancel') }).click();
    await expect(page.getByText(msg('admin.import.step2'))).toHaveCount(0);
    const batches = (await testDb.storage.from('question-media').list('staging', { limit: 1000 })).data ?? [];
    await expect.poll(async () => {
      for (const folder of batches) {
        const files = (await testDb.storage.from('question-media').list(`staging/${folder.name}`)).data ?? [];
        if (files.length === count) return 'still staged';
      }
      return 'removed';
    }).toBe('removed');
  });
});
