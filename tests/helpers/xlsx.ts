import { crc32, deflateSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { IMAGE_COLUMNS, IMPORT_COLUMNS } from '@/lib/import/columns';

/** Import fixtures (Plan V2.15–V2.18): real PNGs and workbooks with pictures anchored to cells. */

/** A valid RGB PNG (solid colour); `padTo` appends an ancillary chunk to reach a byte size. */
export function makePng(width = 8, height = 8, rgb: [number, number, number] = [67, 56, 202], padTo = 0): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw))];
  const base = parts.reduce((n, p) => n + p.length, 0) + 12;
  // Random bytes (not compressible) so a padded picture keeps its size inside the zipped workbook.
  if (padTo > base + 12) parts.push(chunk('raNd', Buffer.from(Array.from({ length: padTo - base - 12 }, () => Math.floor(Math.random() * 256)))));
  parts.push(chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

export const GIF = Buffer.from('474946383961010001000000002c00000000010001000002024401003b', 'hex');

type Row = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;
export type Picture = { row: number; column: string; bytes: Buffer; extension?: 'png' | 'jpeg' | 'gif' };

export const HEADERS = [...IMPORT_COLUMNS, ...IMAGE_COLUMNS];

export function questionRow(stem: string, extra: Row = {}): Row {
  return { subject: 'ict', chapter_number: '3', stem, option_a: 'এক', option_b: 'দুই', option_c: 'তিন', option_d: 'চার', correct: 'B', ...extra };
}

/**
 * `rows[i]` lands on sheet row i + 2. Pictures are anchored by sheet row and header name; `inCell`
 * cells get the `#VALUE!` error an Excel 365 "Place in Cell" picture reads back as.
 */
export async function buildWorkbook(input: {
  rows: Row[];
  pictures?: Picture[];
  inCell?: { row: number; column: string }[];
  headers?: string[];
  instructionsFirst?: boolean;
}): Promise<Buffer> {
  const headers = input.headers ?? HEADERS;
  const workbook = new ExcelJS.Workbook();
  if (input.instructionsFirst) workbook.addWorksheet('Instructions').addRow(['read me']);
  const sheet = workbook.addWorksheet('questions');
  sheet.addRow(headers);
  for (const row of input.rows) sheet.addRow(headers.map((h) => (row as Record<string, string>)[h] ?? ''));
  for (const cell of input.inCell ?? []) sheet.getRow(cell.row).getCell(headers.indexOf(cell.column) + 1).value = { error: '#VALUE!' };
  for (const picture of input.pictures ?? []) {
    const id = workbook.addImage({ buffer: picture.bytes as unknown as ExcelJS.Buffer, extension: picture.extension ?? 'png' });
    const col = headers.indexOf(picture.column);
    sheet.addImage(id, { tl: { col: col + 0.1, row: picture.row - 1 + 0.1 }, ext: { width: 24, height: 24 } });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
