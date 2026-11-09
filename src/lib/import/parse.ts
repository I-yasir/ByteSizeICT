import type { ErrorCode } from '@/lib/errors';
import {
  checkImportHeaders,
  IMAGE_COLUMNS,
  type ImageColumn,
  type ImageExt,
  type ImportPayload,
  ignoredLegacyColumns,
  IMPORT_COLUMNS,
  MAX_IMAGE_BYTES,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  sniffImage,
} from './columns';

/**
 * Import file parser (docs/02_AppFlow.md §6.7, TRD §8.12). Runs in the admin's browser — the import
 * page loads it with `import()` so exceljs/papaparse never reach other bundles — and in tests.
 * Pictures are matched to cells by their top-left anchor; everything else is re-validated by the server.
 */
export class ImportFileError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export type ParsedImage = { row: number; column: ImageColumn; ext: ImageExt; bytes: Uint8Array };
export type ParsedImportFile = {
  headers: string[];
  rows: ImportPayload['rows'];
  ignoredColumns: string[];
  images: ParsedImage[];
  imageIssues: ImportPayload['imageIssues'];
};

const TEXT_COLUMNS = new Set<string>(IMPORT_COLUMNS);
const isImageColumn = (column: string | undefined): column is ImageColumn =>
  (IMAGE_COLUMNS as readonly string[]).includes(column ?? '');

function finish(headers: string[], rows: ImportPayload['rows'], images: ParsedImage[], imageIssues: ImportPayload['imageIssues']): ParsedImportFile {
  if (checkImportHeaders(headers)) throw new ImportFileError('IMPORT_BAD_HEADERS', { expected: [...IMPORT_COLUMNS, ...IMAGE_COLUMNS] });
  if (rows.length > MAX_IMPORT_ROWS) throw new ImportFileError('IMPORT_TOO_LARGE', { rows: rows.length });
  return { headers, rows, ignoredColumns: ignoredLegacyColumns(headers), images, imageIssues };
}

function textCells(headers: string[], read: (index: number) => string): Record<string, string> {
  const cells: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (TEXT_COLUMNS.has(header)) cells[header] = read(index);
  });
  return cells;
}

async function parseCsv(bytes: ArrayBuffer): Promise<ParsedImportFile> {
  const { default: Papa } = await import('papaparse');
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  const [head = [], ...body] = parsed.data;
  const headers = head.map((h) => h.trim().toLowerCase());
  const rows = body.map((values, i) => ({ row: i + 2, cells: textCells(headers, (index) => values[index] ?? '') }));
  return finish(headers, rows, [], []);
}

async function parseXlsx(bytes: ArrayBuffer): Promise<ParsedImportFile> {
  const mod = await import('exceljs');
  // CommonJS in Node, UMD in the browser bundle: the classes sit on `default` or on the namespace.
  const ExcelJS = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes);
  } catch {
    throw new ImportFileError('IMPORT_BAD_HEADERS');
  }
  const sheet =
    workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'questions') ??
    workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() !== 'instructions');
  if (!sheet) throw new ImportFileError('IMPORT_BAD_HEADERS');

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col - 1] = cell.text.trim().toLowerCase();
  });
  for (let i = 0; i < headers.length; i++) headers[i] ??= '';

  const rows: ImportPayload['rows'] = [];
  const imageIssues: ImportPayload['imageIssues'] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const cells = textCells(headers, (col) => row.getCell(col + 1).text);
    if (Object.values(cells).some((value) => value.trim() !== '')) rows.push({ row: index, cells });
    headers.forEach((header, col) => {
      // An Excel 365 "Place in Cell" picture is stored as a rich value that reads back as #VALUE!.
      if (isImageColumn(header) && row.getCell(col + 1).type === ExcelJS.ValueType.Error) {
        imageIssues.push({ row: index, column: header, kind: 'in_cell' });
      }
    });
  });

  const dataRows = new Set(rows.map((r) => r.row));
  const byCell = new Map<string, { row: number; col: number; imageIds: number[] }>();
  for (const picture of sheet.getImages()) {
    const row = picture.range.tl.nativeRow + 1;
    const col = picture.range.tl.nativeCol;
    const key = `${row}|${col}`;
    const entry = byCell.get(key) ?? { row, col, imageIds: [] };
    entry.imageIds.push(Number(picture.imageId));
    byCell.set(key, entry);
  }

  const images: ParsedImage[] = [];
  for (const { row, col, imageIds } of byCell.values()) {
    const column = headers[col];
    const label = column || `column ${col + 1}`;
    if (!isImageColumn(column)) imageIssues.push({ row, column: label, kind: 'not_image_column' });
    else if (!dataRows.has(row)) imageIssues.push({ row, column, kind: 'outside_rows' });
    else if (imageIds.length > 1) imageIssues.push({ row, column, kind: 'two_pictures' });
    else {
      const media = workbook.getImage(imageIds[0] as number) as { buffer?: ArrayLike<number> & { length: number } };
      const data = media.buffer ? new Uint8Array(media.buffer) : new Uint8Array();
      const ext = sniffImage(data);
      if (data.length > MAX_IMAGE_BYTES) imageIssues.push({ row, column, kind: 'too_large' });
      else if (!ext) imageIssues.push({ row, column, kind: 'wrong_type' });
      else images.push({ row, column, ext, bytes: data });
    }
  }
  images.sort((a, b) => a.row - b.row || a.column.localeCompare(b.column));
  imageIssues.sort((a, b) => a.row - b.row || a.column.localeCompare(b.column));
  return finish(headers, rows, images, imageIssues);
}

export async function parseImportFile(file: { name: string; bytes: ArrayBuffer }): Promise<ParsedImportFile> {
  if (file.bytes.byteLength > MAX_IMPORT_BYTES) throw new ImportFileError('IMPORT_TOO_LARGE');
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) return parseCsv(file.bytes);
  if (lower.endsWith('.xlsx')) return parseXlsx(file.bytes);
  throw new ImportFileError('IMPORT_BAD_HEADERS');
}
