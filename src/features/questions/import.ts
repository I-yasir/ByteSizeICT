import 'server-only';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { logAdminAudit } from '@/features/audit/log';
import { check, ServiceError, unwrap } from '@/lib/actions';
import {
  checkImportHeaders,
  IMAGE_COLUMNS,
  IMAGE_CONTENT_TYPES,
  IMAGE_ISSUES,
  type ImageColumn,
  type ImageExt,
  type ImageIssueKind,
  type ImportIssue,
  ignoredLegacyColumns,
  IMPORT_COLUMNS,
  MAX_IMAGE_BYTES,
  MAX_IMPORT_ROWS,
  rowsJsonPath,
  stagedImagePath,
} from '@/lib/import/columns';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { IMPORT_UPLOADS_BUCKET, QUESTION_MEDIA_BUCKET } from '@/lib/supabase/storage';
import type { ImportUploadFile } from './schemas';
import { contentHashes } from './service';

/**
 * Bulk import, server side (PRD A-08, docs/02_AppFlow.md §6.7, TRD §8.12). The browser parses the file
 * and uploads rows JSON + pictures straight to Storage; these functions only sign URLs, validate the
 * staged batch and link it, so every request stays small enough for Vercel Hobby.
 */

const cell = (max: number) => z.string().trim().max(max);
const rowSchema = z.object({
  subject: cell(40).optional(),
  chapter_number: z.coerce.number().int().min(1).max(50),
  topic: cell(120).optional(),
  stem: cell(4000).min(1),
  // An option may be empty when its picture is present (D7); checked after parsing.
  option_a: cell(1000).optional(),
  option_b: cell(1000).optional(),
  option_c: cell(1000).optional(),
  option_d: cell(1000).optional(),
  correct: z.string().trim().toUpperCase().pipe(z.enum(['A', 'B', 'C', 'D'])),
  explanation: cell(8000).optional(),
});

const lineSchema = z.number().int().min(2).max(1_048_576);
const payloadSchema = z.object({
  version: z.literal(1),
  fileName: z.string().max(255),
  headers: z.array(z.string().max(80)).max(60),
  rows: z.array(z.object({ row: lineSchema, cells: z.record(z.string().max(80), z.string().max(10_000)) })),
  images: z.array(z.object({ row: lineSchema, column: z.enum(IMAGE_COLUMNS), path: z.string().max(200) })).max(MAX_IMPORT_ROWS * IMAGE_COLUMNS.length),
  imageIssues: z.array(z.object({ row: lineSchema, column: z.string().max(80), kind: z.enum(IMAGE_ISSUES) })).max(MAX_IMPORT_ROWS * 10),
});

export type ImportRow = {
  line: number;
  chapterId: string;
  topicName: string | null;
  stem: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
  explanation: string | null;
  /** Staged picture paths by image column (moved into `questions/` on commit). */
  images: Partial<Record<ImageColumn, string>>;
};
type StagedImage = { path: string; row: number; column: ImageColumn };

export type ImportPreview = {
  importToken: string | null;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  /** Pictures that will be imported with the valid rows. */
  images: number;
  errors: ImportIssue[];
  duplicateRows: { row: number; reason: 'in_file' | 'in_bank' }[];
  /** Legacy columns present in the file and ignored (D9); the wizard shows a warning. */
  ignoredColumns: string[];
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const logWarn = (context: string, detail: Record<string, unknown>) =>
  console.error(JSON.stringify({ level: 'warn', context, ...detail }));

/** Signed upload URLs for one batch: rows JSON → `import-uploads`, pictures → `question-media/staging/`. */
export async function createImportUploadUrls(batchId: string, files: ImportUploadFile[]) {
  return mapLimit(files, 10, async (file) => {
    const [bucket, path] =
      file.kind === 'rows'
        ? [IMPORT_UPLOADS_BUCKET, rowsJsonPath(batchId)]
        : [QUESTION_MEDIA_BUCKET, stagedImagePath(batchId, file.row, file.column, file.ext)];
    const data = unwrap(await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path, { upsert: true }));
    return { path, signedUrl: data.signedUrl };
  });
}

/** Every staged picture of a batch with its Storage metadata (paged; Storage lists ≤ 1,000 at a time). */
async function listStaged(batchId: string): Promise<Map<string, { size: number; mimetype: string }>> {
  const files = new Map<string, { size: number; mimetype: string }>();
  for (let offset = 0; ; offset += 1000) {
    const page = unwrap(await supabaseAdmin.storage.from(QUESTION_MEDIA_BUCKET).list(`staging/${batchId}`, { limit: 1000, offset }));
    for (const item of page) {
      const meta = (item.metadata ?? {}) as { size?: unknown; mimetype?: unknown };
      files.set(`staging/${batchId}/${item.name}`, {
        size: typeof meta.size === 'number' ? meta.size : Number.POSITIVE_INFINITY,
        mimetype: typeof meta.mimetype === 'string' ? meta.mimetype : '',
      });
    }
    if (page.length < 1000) return files;
  }
}

async function removePaths(bucket: string, paths: string[], context: string): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
      if (error) throw error;
      removed += chunk.length;
    } catch (error) {
      logWarn(context, { bucket, count: chunk.length, error: String((error as Error)?.message ?? error) });
    }
  }
  return removed;
}

async function loadPayload(batchId: string) {
  const { data, error } = await supabaseAdmin.storage.from(IMPORT_UPLOADS_BUCKET).download(rowsJsonPath(batchId));
  if (error || !data) throw new ServiceError('NOT_FOUND');
  let json: unknown;
  try {
    json = JSON.parse(await data.text());
  } catch {
    throw new ServiceError('VALIDATION');
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) throw new ServiceError('VALIDATION');
  return parsed.data;
}

/** Validates a staged batch and stores its valid, non-duplicate rows for 30 minutes (token = batch id). */
export async function previewImport(adminId: string, batchId: string): Promise<ImportPreview> {
  const payload = await loadPayload(batchId);
  const headerError = checkImportHeaders(payload.headers);
  if (headerError) throw new ServiceError(headerError, { meta: { expected: [...IMPORT_COLUMNS, ...IMAGE_COLUMNS] } });
  if (payload.rows.length > MAX_IMPORT_ROWS) throw new ServiceError('IMPORT_TOO_LARGE', { meta: { rows: payload.rows.length } });

  const errors: ImportIssue[] = [];
  const imageIssue = (row: number, column: string, kind: ImageIssueKind) => errors.push({ row, column, message: kind, image: kind });
  for (const issue of payload.imageIssues) imageIssue(issue.row, issue.column, issue.kind);

  // Every picture the browser says it uploaded must be in this batch's folder, with a valid size and type.
  const staged = payload.images.length ? await listStaged(batchId) : new Map<string, { size: number; mimetype: string }>();
  const imagesByRow = new Map<number, Partial<Record<ImageColumn, string>>>();
  for (const image of payload.images) {
    const ext = image.path.split('.').pop() as ImageExt;
    const meta = staged.get(image.path);
    if (!(ext in IMAGE_CONTENT_TYPES) || image.path !== stagedImagePath(batchId, image.row, image.column, ext) || !meta) {
      imageIssue(image.row, image.column, 'missing_upload');
    } else if (meta.size > MAX_IMAGE_BYTES) {
      imageIssue(image.row, image.column, 'too_large');
    } else if (!Object.values(IMAGE_CONTENT_TYPES).includes(meta.mimetype)) {
      imageIssue(image.row, image.column, 'wrong_type');
    } else {
      imagesByRow.set(image.row, { ...imagesByRow.get(image.row), [image.column]: image.path });
    }
  }
  const imageProblemRows = new Set(errors.map((e) => e.row));

  const subjects = unwrap(await supabaseAdmin.from('subjects').select('id, slug, chapters(id, number)').order('sort_order'));
  const defaultSubject = subjects[0];
  const candidates: ImportRow[] = [];
  for (const { row: line, cells } of payload.rows) {
    const cleaned = Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.trim() === '' ? undefined : v]));
    const parsed = rowSchema.safeParse(cleaned);
    const images = imagesByRow.get(line) ?? {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push({ row: line, column: String(issue.path[0] ?? ''), message: issue.message });
      continue;
    }
    const r = parsed.data;
    const options = [r.option_a ?? '', r.option_b ?? '', r.option_c ?? '', r.option_d ?? ''] as [string, string, string, string];
    const missing = (['a', 'b', 'c', 'd'] as const).filter((key, i) => !options[i] && !images[`option_${key}_image`]);
    if (missing.length) {
      for (const key of missing) errors.push({ row: line, column: `option_${key}`, message: 'Enter text or add a picture' });
      continue;
    }
    const slug = r.subject?.toLowerCase();
    const subject = slug ? subjects.find((s) => s.slug === slug) : defaultSubject;
    if (!subject) {
      errors.push({ row: line, column: 'subject', message: 'Unknown subject' });
      continue;
    }
    const chapter = subject.chapters.find((c) => c.number === r.chapter_number);
    if (!chapter) {
      errors.push({ row: line, column: 'chapter_number', message: `Chapter ${r.chapter_number} does not exist` });
      continue;
    }
    if (imageProblemRows.has(line)) continue;
    candidates.push({
      line,
      chapterId: chapter.id,
      topicName: r.topic ?? null,
      stem: r.stem,
      options,
      correct: r.correct,
      explanation: r.explanation ?? null,
      images,
    });
  }

  const hashes = await contentHashes(
    candidates.map((c) => ({ stem: c.stem, a: c.options[0], b: c.options[1], c: c.options[2], d: c.options[3] })),
  );
  const existing = new Set<string>();
  // 100 sha256 hashes keep the PostgREST `in` filter well under the URL length limit.
  for (let i = 0; i < hashes.length; i += 100) {
    const chunk = hashes.slice(i, i + 100);
    const rows = unwrap(await supabaseAdmin.from('questions').select('content_hash').in('content_hash', chunk).is('deleted_at', null));
    for (const row of rows) existing.add(row.content_hash);
  }

  const seen = new Set<string>();
  const duplicateRows: ImportPreview['duplicateRows'] = [];
  const valid: ImportRow[] = [];
  candidates.forEach((candidate, i) => {
    const hash = hashes[i] as string;
    if (existing.has(hash)) duplicateRows.push({ row: candidate.line, reason: 'in_bank' });
    else if (seen.has(hash)) duplicateRows.push({ row: candidate.line, reason: 'in_file' });
    else {
      seen.add(hash);
      valid.push(candidate);
    }
  });

  errors.sort((a, b) => a.row - b.row);
  const images: StagedImage[] = valid.flatMap((r) =>
    Object.entries(r.images).map(([column, path]) => ({ path: path as string, row: r.line, column: column as ImageColumn })),
  );
  const summary = { valid: valid.length, invalid: new Set(errors.map((e) => e.row)).size, duplicates: duplicateRows.length };
  let importToken: string | null = null;
  if (valid.length > 0) {
    check(
      await supabaseAdmin.from('question_import_batches').upsert({
        id: batchId,
        admin_id: adminId,
        rows: valid,
        summary,
        images,
        staged_paths: [...staged.keys()],
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    );
    importToken = batchId;
  }
  return {
    importToken,
    total: payload.rows.length,
    ...summary,
    images: images.length,
    errors: errors.slice(0, 500),
    duplicateRows,
    ignoredColumns: ignoredLegacyColumns(payload.headers),
  };
}

export async function commitImport(
  adminId: string,
  input: { importToken: string; defaultStatus: 'draft' | 'active' | 'archived' },
): Promise<{ imported: number; duplicatesSkipped: number; invalid: number; images: number }> {
  // Claiming the batch by deleting it makes a double click (or a second tab) commit only once.
  const claimed = unwrap(
    await supabaseAdmin
      .from('question_import_batches')
      .delete()
      .eq('id', input.importToken)
      .eq('admin_id', adminId)
      .gt('expires_at', new Date().toISOString())
      .select('rows, summary, images, staged_paths'),
  );
  const batch = claimed[0];
  if (!batch) throw new ServiceError('NOT_FOUND');
  const rows = batch.rows as unknown as ImportRow[];
  const summary = batch.summary as { invalid: number; duplicates: number };
  const staged = batch.images as unknown as StagedImage[];

  // Move pictures into place first, so no question is inserted pointing at a missing file.
  const moved = new Map<string, string>();
  const failures: string[] = [];
  await mapLimit(staged, 8, async (image) => {
    const target = `questions/${crypto.randomUUID()}.${image.path.split('.').pop()}`;
    const { error } = await supabaseAdmin.storage.from(QUESTION_MEDIA_BUCKET).move(image.path, target);
    if (error) failures.push(image.path);
    else moved.set(image.path, target);
  });
  if (failures.length) throw new Error(`import image move failed for ${failures.length} file(s)`);

  // Topics: match by English or Bangla name within the chapter; create the missing ones.
  const chapterIds = [...new Set(rows.map((r) => r.chapterId))];
  const topics = unwrap(await supabaseAdmin.from('topics').select('id, chapter_id, name_en, name_bn').in('chapter_id', chapterIds));
  const topicKey = (chapterId: string, name: string) => `${chapterId}|${name.toLowerCase()}`;
  const topicIds = new Map<string, string>();
  for (const t of topics) {
    topicIds.set(topicKey(t.chapter_id, t.name_en), t.id);
    topicIds.set(topicKey(t.chapter_id, t.name_bn), t.id);
  }
  const missingTopics = new Map<string, { chapter_id: string; name_en: string; name_bn: string }>();
  for (const r of rows) {
    if (r.topicName && !topicIds.has(topicKey(r.chapterId, r.topicName))) {
      missingTopics.set(topicKey(r.chapterId, r.topicName), { chapter_id: r.chapterId, name_en: r.topicName, name_bn: r.topicName });
    }
  }
  if (missingTopics.size > 0) {
    const created = unwrap(await supabaseAdmin.from('topics').insert([...missingTopics.values()]).select('id, chapter_id, name_en'));
    for (const t of created) topicIds.set(topicKey(t.chapter_id, t.name_en), t.id);
  }

  const image = (r: ImportRow, column: ImageColumn) => {
    const path = r.images?.[column];
    return path ? (moved.get(path) ?? null) : null;
  };
  let imported = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const inserted = unwrap(
      await supabaseAdmin
        .from('questions')
        .insert(
          chunk.map((r) => ({
            chapter_id: r.chapterId,
            topic_id: r.topicName ? (topicIds.get(topicKey(r.chapterId, r.topicName)) ?? null) : null,
            stem: r.stem,
            stem_image_path: image(r, 'stem_image'),
            option_a: r.options[0],
            option_a_image_path: image(r, 'option_a_image'),
            option_b: r.options[1],
            option_b_image_path: image(r, 'option_b_image'),
            option_c: r.options[2],
            option_c_image_path: image(r, 'option_c_image'),
            option_d: r.options[3],
            option_d_image_path: image(r, 'option_d_image'),
            correct_option: r.correct,
            explanation: r.explanation,
            explanation_image_path: image(r, 'explanation_image'),
            status: input.defaultStatus,
            created_by: adminId,
            updated_by: adminId,
          })),
        )
        .select('id'),
    );
    imported += inserted.length;
  }

  // Pictures of invalid/duplicate rows and the rows JSON are no longer needed.
  const leftovers = (batch.staged_paths ?? []).filter((path) => !moved.has(path));
  await removePaths(QUESTION_MEDIA_BUCKET, leftovers, 'questions.import.cleanup');
  await removePaths(IMPORT_UPLOADS_BUCKET, [rowsJsonPath(input.importToken)], 'questions.import.cleanup');

  await logAdminAudit({
    adminId,
    action: 'question.import',
    entityType: 'question',
    meta: { imported, images: moved.size, duplicatesSkipped: summary.duplicates, invalid: summary.invalid, status: input.defaultStatus },
  });
  return { imported, duplicatesSkipped: summary.duplicates, invalid: summary.invalid, images: moved.size };
}

/** Cancel at any step (AppFlow §6.7): drops the batch and its staged files. */
export async function cancelImport(adminId: string, batchId: string): Promise<{ removed: number }> {
  check(await supabaseAdmin.from('question_import_batches').delete().eq('id', batchId).eq('admin_id', adminId));
  const staged = [...(await listStaged(batchId)).keys()];
  const removed =
    (await removePaths(QUESTION_MEDIA_BUCKET, staged, 'questions.import.cancel')) +
    (await removePaths(IMPORT_UPLOADS_BUCKET, [rowsJsonPath(batchId)], 'questions.import.cancel'));
  return { removed };
}

/** Abandoned uploads (pg_cron → kick_import_cleanup → internal route): deleted through the Storage API. */
export async function cleanupStaleImports(olderThanSeconds = 24 * 3600): Promise<{ removed: number }> {
  let removed = 0;
  for (let round = 0; round < 5; round++) {
    const stale = unwrap(
      await supabaseAdmin.rpc('stale_import_uploads', { p_older_than: `${Math.max(0, Math.floor(olderThanSeconds))} seconds`, p_limit: 1000 }),
    );
    if (stale.length === 0) break;
    for (const bucket of [IMPORT_UPLOADS_BUCKET, QUESTION_MEDIA_BUCKET]) {
      const paths = stale.filter((s) => s.bucket_id === bucket).map((s) => s.name);
      if (paths.length) removed += await removePaths(bucket, paths, 'questions.import.stale');
    }
    if (stale.length < 1000) break;
  }
  return { removed };
}

const EXAMPLE_ROW: Record<(typeof IMPORT_COLUMNS)[number], string> = {
  subject: 'ict',
  chapter_number: '3',
  topic: 'Binary Conversion',
  stem: '$(1011)_2$ এর দশমিক মান কত?',
  option_a: '9',
  option_b: '10',
  option_c: '11',
  option_d: '13',
  correct: 'C',
  explanation: '$8 + 0 + 2 + 1 = 11$',
};

const INSTRUCTIONS = [
  'How to fill this template / কীভাবে পূরণ করবেন',
  '',
  'One question per row on the "questions" sheet. Keep the header row unchanged.',
  'প্রতিটি সারিতে একটি প্রশ্ন। প্রথম (হেডার) সারি বদলাবেন না।',
  '',
  'Required: chapter_number, stem, option_a–option_d, correct (A/B/C/D). Optional: subject (slug), topic, explanation.',
  '',
  'Pictures (Excel only):',
  '1. Click the cell in stem_image, option_a_image … option_d_image or explanation_image of that row.',
  '2. Insert → Pictures → "Place over Cells" (not "Place in Cell"). Keep the picture\'s top-left corner inside that cell.',
  '3. One picture per cell; PNG, JPG or WebP; at most 1 MB each.',
  '4. An option may be left empty when that option has a picture.',
  '',
  'ছবি (শুধু Excel):',
  '১. ওই সারির stem_image, option_a_image … option_d_image বা explanation_image ঘরে ক্লিক করুন।',
  '২. Insert → Pictures → "Place over Cells" ব্যবহার করুন ("Place in Cell" নয়)। ছবির উপরের-বাম কোণ ঘরের ভেতরে রাখুন।',
  '৩. প্রতি ঘরে একটি ছবি; PNG, JPG বা WebP; প্রতিটি সর্বোচ্চ 1 MB।',
  '৪. কোনো অপশনে ছবি থাকলে তার লেখা খালি রাখা যায়।',
  '',
  'CSV files cannot carry pictures. Files up to 20 MB and 2,000 rows.',
  'CSV ফাইলে ছবি যায় না। ফাইল সর্বোচ্চ 20 MB ও 2,000 সারি।',
];

const csvEscape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** CSV stays text-only (D7). */
export function buildTemplateCsv(): string {
  return `﻿${IMPORT_COLUMNS.join(',')}\n${IMPORT_COLUMNS.map((c) => csvEscape(EXAMPLE_ROW[c])).join(',')}\n`;
}

export async function buildTemplateXlsx(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('questions');
  sheet.addRow([...IMPORT_COLUMNS, ...IMAGE_COLUMNS]);
  sheet.addRow([...IMPORT_COLUMNS.map((c) => EXAMPLE_ROW[c]), ...IMAGE_COLUMNS.map(() => '')]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  sheet.getRow(2).height = 60;
  const help = workbook.addWorksheet('Instructions');
  help.getColumn(1).width = 110;
  for (const line of INSTRUCTIONS) help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 14 };
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function buildErrorReportCsv(errors: ImportIssue[]): string {
  return `﻿row,column,message\n${errors.map((e) => [String(e.row), e.column, e.message].map(csvEscape).join(',')).join('\n')}\n`;
}
