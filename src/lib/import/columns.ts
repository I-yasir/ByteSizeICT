import type { ErrorCode } from '@/lib/errors';

/**
 * Isomorphic import vocabulary (docs/02_AppFlow.md §6.7, TRD §8.12): shared by the browser parser
 * (`parse.ts`), the server preview/commit (`features/questions/import.ts`) and the wizard.
 */
export const IMPORT_COLUMNS = [
  'subject', 'chapter_number', 'topic', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation',
] as const;
/** Excel only (D7): a picture placed over the cell. CSV files may carry the headers but no pictures. */
export const IMAGE_COLUMNS = [
  'stem_image', 'option_a_image', 'option_b_image', 'option_c_image', 'option_d_image', 'explanation_image',
] as const;
export type ImageColumn = (typeof IMAGE_COLUMNS)[number];
/** R1 template columns removed in R1.1 (D9): still accepted so old files import, but their values are ignored. */
export const LEGACY_IMPORT_COLUMNS = ['difficulty', 'type', 'source', 'board_year', 'tags'] as const;
export const REQUIRED_COLUMNS = ['chapter_number', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct'] as const;

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 1024 * 1024;
/** Signed upload URLs per request (free-tier: small, fast server calls). */
export const UPLOAD_URL_BATCH = 50;

/** Per-cell picture problems; `in_cell` is Excel 365 "Place in Cell", which exceljs cannot read. */
export const IMAGE_ISSUES = ['too_large', 'wrong_type', 'two_pictures', 'not_image_column', 'outside_rows', 'in_cell', 'missing_upload'] as const;
export type ImageIssueKind = (typeof IMAGE_ISSUES)[number];
export const imageIssueCode = (kind: ImageIssueKind): ErrorCode =>
  kind === 'in_cell' ? 'IMPORT_IMAGE_UNSUPPORTED' : 'IMPORT_IMAGE_INVALID';

export type ImportIssue = { row: number; column: string; message: string; image?: ImageIssueKind };
export type ImageExt = 'png' | 'jpg' | 'webp';
export const IMAGE_CONTENT_TYPES: Record<ImageExt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Type by content, never by the file's claimed extension. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  const at = (i: number) => bytes[i];
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return 'png';
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** `staging/<batch>/<row>-<column>.<ext>` in `question-media`. */
export const stagedImagePath = (batchId: string, row: number, column: ImageColumn, ext: ImageExt) =>
  `staging/${batchId}/${row}-${column}.${ext}`;
export const rowsJsonPath = (batchId: string) => `${batchId}/rows.json`;

/** Returns the error code for a header row, or null when it matches the template. */
export function checkImportHeaders(headers: string[]): ErrorCode | null {
  const known = new Set<string>([...IMPORT_COLUMNS, ...IMAGE_COLUMNS, ...LEGACY_IMPORT_COLUMNS]);
  const present = headers.filter(Boolean);
  if (REQUIRED_COLUMNS.some((col) => !present.includes(col)) || present.some((col) => !known.has(col))) return 'IMPORT_BAD_HEADERS';
  return null;
}

export const ignoredLegacyColumns = (headers: string[]) =>
  headers.filter((h) => (LEGACY_IMPORT_COLUMNS as readonly string[]).includes(h));

/** What the browser uploads as `rows.json`; the server re-validates all of it. */
export type ImportPayload = {
  version: 1;
  fileName: string;
  headers: string[];
  rows: { row: number; cells: Record<string, string> }[];
  images: { row: number; column: ImageColumn; path: string }[];
  imageIssues: { row: number; column: string; kind: ImageIssueKind }[];
};
