// Browser-side import parser (Plan V2.15, docs/02_AppFlow.md §6.7): generated XLSX fixtures.
import { describe, expect, it } from 'vitest';
import { checkImportHeaders, sniffImage, stagedImagePath } from '@/lib/import/columns';
import { ImportFileError, parseImportFile } from '@/lib/import/parse';
import { buildWorkbook, GIF, makePng, questionRow, toArrayBuffer } from '../helpers/xlsx';

const parse = async (buffer: Buffer, name = 'q.xlsx') => parseImportFile({ name, bytes: toArrayBuffer(buffer) });
const code = async (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => (e instanceof ImportFileError ? e.code : String(e)));

describe('sniffImage', () => {
  it('detects by magic bytes, not by name', () => {
    expect(sniffImage(makePng())).toBe('png');
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(sniffImage(new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBPVP8 ')]))).toBe('webp');
    expect(sniffImage(GIF)).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it('builds staged paths inside the batch folder', () => {
    expect(stagedImagePath('b1', 7, 'option_c_image', 'webp')).toBe('staging/b1/7-option_c_image.webp');
  });
});

describe('parseImportFile — XLSX pictures', () => {
  it('maps an anchored picture to its row and image column; an image-only option keeps empty text', async () => {
    const png = makePng();
    const file = await buildWorkbook({
      rows: [questionRow('with stem picture'), questionRow('image-only option B', { option_b: '' })],
      pictures: [
        { row: 2, column: 'stem_image', bytes: png },
        { row: 3, column: 'option_b_image', bytes: png },
      ],
    });
    const parsed = await parse(file);
    expect(parsed.rows.map((r) => r.row)).toEqual([2, 3]);
    expect(parsed.rows[1]?.cells.option_b).toBe('');
    expect(parsed.rows[0]?.cells).not.toHaveProperty('stem_image');
    expect(parsed.images.map(({ row, column, ext }) => ({ row, column, ext }))).toEqual([
      { row: 2, column: 'stem_image', ext: 'png' },
      { row: 3, column: 'option_b_image', ext: 'png' },
    ]);
    expect(Buffer.from(parsed.images[0]?.bytes ?? []).equals(png)).toBe(true);
    expect(parsed.imageIssues).toEqual([]);
  });

  it('reports oversized, wrong type, two pictures in one cell, wrong column, empty row and in-cell pictures per cell', async () => {
    const file = await buildWorkbook({
      rows: [questionRow('r2'), questionRow('r3'), questionRow('r4'), questionRow('r5'), questionRow('r6')],
      pictures: [
        { row: 2, column: 'stem_image', bytes: makePng(8, 8, [1, 2, 3], 1024 * 1024 + 10) },
        { row: 3, column: 'stem_image', bytes: GIF, extension: 'gif' },
        { row: 4, column: 'option_a_image', bytes: makePng() },
        { row: 4, column: 'option_a_image', bytes: makePng(4, 4) },
        { row: 5, column: 'stem', bytes: makePng() },
        { row: 9, column: 'stem_image', bytes: makePng() },
      ],
      inCell: [{ row: 6, column: 'explanation_image' }],
    });
    const parsed = await parse(file);
    expect(parsed.images).toEqual([]);
    expect(parsed.imageIssues).toEqual([
      { row: 2, column: 'stem_image', kind: 'too_large' },
      { row: 3, column: 'stem_image', kind: 'wrong_type' },
      { row: 4, column: 'option_a_image', kind: 'two_pictures' },
      { row: 5, column: 'stem', kind: 'not_image_column' },
      { row: 6, column: 'explanation_image', kind: 'in_cell' },
      { row: 9, column: 'stem_image', kind: 'outside_rows' },
    ]);
  });

  it('reads the "questions" sheet even when the Instructions sheet comes first; legacy columns are reported', async () => {
    const file = await buildWorkbook({
      rows: [{ ...questionRow('legacy'), difficulty: 'hard' } as ReturnType<typeof questionRow>],
      headers: ['chapter_number', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'difficulty'],
      instructionsFirst: true,
    });
    const parsed = await parse(file);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.ignoredColumns).toEqual(['difficulty']);
    expect(parsed.rows[0]?.cells).not.toHaveProperty('difficulty');
  });

  it('rejects wrong headers, too many rows, oversized and unknown files', async () => {
    expect(await code(parse(await buildWorkbook({ rows: [], headers: ['question', 'answer'] })))).toBe('IMPORT_BAD_HEADERS');
    expect(await code(parse(Buffer.from('not a zip')))).toBe('IMPORT_BAD_HEADERS');
    expect(await code(parse(Buffer.from('x'), 'q.pdf'))).toBe('IMPORT_BAD_HEADERS');
    const many = Array.from({ length: 2001 }, (_, i) => questionRow(`row ${i}`));
    expect(await code(parse(await buildWorkbook({ rows: many })))).toBe('IMPORT_TOO_LARGE');
    expect(await code(parseImportFile({ name: 'q.xlsx', bytes: new ArrayBuffer(20 * 1024 * 1024 + 1) }))).toBe('IMPORT_TOO_LARGE');
  });
});

describe('parseImportFile — CSV', () => {
  it('is text-only, keeps row numbers and ignores legacy columns', async () => {
    const csv = '﻿chapter_number,stem,option_a,option_b,option_c,option_d,correct,tags\n3,"a, b",1,2,3,4,A,x\n3,second,1,2,3,4,B,\n';
    const parsed = await parse(Buffer.from(csv), 'q.csv');
    expect(parsed.rows.map((r) => [r.row, r.cells.stem])).toEqual([[2, 'a, b'], [3, 'second']]);
    expect(parsed.ignoredColumns).toEqual(['tags']);
    expect(parsed.images).toEqual([]);
    expect(checkImportHeaders(['stem'])).toBe('IMPORT_BAD_HEADERS');
  });
});
