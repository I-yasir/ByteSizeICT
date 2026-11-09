import 'server-only';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { z } from 'zod';
import { logAdminAudit } from '@/features/audit/log';
import { check, ServiceError, unwrap, unwrapMaybe } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { contentHashes } from './service';

/** Bulk import (PRD A-08, docs/02_AppFlow.md §6.7): ≤ 2,000 rows, ≤ 5 MB, CSV or XLSX. */
export const IMPORT_COLUMNS = [
  'subject', 'chapter_number', 'topic', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct', 'explanation',
] as const;
/** R1 template columns removed in R1.1 (D9): still accepted so old files import, but their values are ignored. */
export const LEGACY_IMPORT_COLUMNS = ['difficulty', 'type', 'source', 'board_year', 'tags'] as const;
const REQUIRED_COLUMNS = ['chapter_number', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct'] as const;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

type RawRow = Record<string, string>;
export type ImportIssue = { row: number; column: string; message: string };
export type ParsedImport = { rows: RawRow[]; ignoredColumns: string[] };

export async function parseImportFile(file: { name: string; bytes: ArrayBuffer }): Promise<ParsedImport> {
  if (file.bytes.byteLength > MAX_IMPORT_BYTES) throw new ServiceError('IMPORT_TOO_LARGE');
  const lower = file.name.toLowerCase();
  let headers: string[];
  let rows: RawRow[];

  if (lower.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(file.bytes).replace(/^﻿/, '');
    const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase() });
    headers = parsed.meta.fields ?? [];
    rows = parsed.data;
  } else if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.bytes);
    } catch {
      throw new ServiceError('IMPORT_BAD_HEADERS');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ServiceError('IMPORT_BAD_HEADERS');
    headers = [];
    sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cell.text.trim().toLowerCase();
    });
    rows = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const record: RawRow = {};
      headers.forEach((header, col) => {
        if (header) record[header] = row.getCell(col + 1).text;
      });
      if (Object.values(record).some((value) => value.trim() !== '')) rows.push(record);
    });
  } else {
    throw new ServiceError('IMPORT_BAD_HEADERS');
  }

  const legacy = new Set<string>(LEGACY_IMPORT_COLUMNS);
  const known = new Set<string>([...IMPORT_COLUMNS, ...LEGACY_IMPORT_COLUMNS]);
  const present = headers.filter(Boolean);
  if (REQUIRED_COLUMNS.some((col) => !present.includes(col)) || present.some((col) => !known.has(col))) {
    throw new ServiceError('IMPORT_BAD_HEADERS', { meta: { expected: IMPORT_COLUMNS } });
  }
  if (rows.length > MAX_IMPORT_ROWS) throw new ServiceError('IMPORT_TOO_LARGE', { meta: { rows: rows.length } });
  const ignoredColumns = present.filter((col) => legacy.has(col));
  for (const row of rows) for (const col of ignoredColumns) delete row[col];
  return { rows, ignoredColumns };
}

const cell = (max: number) => z.string().trim().max(max);
const rowSchema = z.object({
  subject: cell(40).optional(),
  chapter_number: z.coerce.number().int().min(1).max(50),
  topic: cell(120).optional(),
  stem: cell(4000).min(1),
  option_a: cell(1000).min(1),
  option_b: cell(1000).min(1),
  option_c: cell(1000).min(1),
  option_d: cell(1000).min(1),
  correct: z.string().trim().toUpperCase().pipe(z.enum(['A', 'B', 'C', 'D'])),
  explanation: cell(8000).optional(),
});

export type ImportRow = {
  line: number;
  chapterId: string;
  topicName: string | null;
  stem: string;
  options: [string, string, string, string];
  correct: 'A' | 'B' | 'C' | 'D';
  explanation: string | null;
};

export type ImportPreview = {
  importToken: string | null;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  errors: ImportIssue[];
  duplicateRows: { row: number; reason: 'in_file' | 'in_bank' }[];
  /** Legacy columns present in the file and ignored (D9); the wizard shows a warning. */
  ignoredColumns: string[];
};

/** Validates rows and stores the valid, non-duplicate ones under an import token for 30 minutes. */
export async function previewImport(adminId: string, { rows: rawRows, ignoredColumns }: ParsedImport): Promise<ImportPreview> {
  const subjects = unwrap(await supabaseAdmin.from('subjects').select('id, slug, chapters(id, number)').order('sort_order'));
  const defaultSubject = subjects[0];
  const errors: ImportIssue[] = [];
  const candidates: ImportRow[] = [];

  rawRows.forEach((raw, index) => {
    const line = index + 2; // header is line 1
    const cleaned = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '' ? undefined : v]));
    const parsed = rowSchema.safeParse(cleaned);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({ row: line, column: String(issue.path[0] ?? ''), message: issue.message });
      }
      return;
    }
    const r = parsed.data;
    const slug = r.subject?.toLowerCase();
    const subject = slug ? subjects.find((s) => s.slug === slug) : defaultSubject;
    if (!subject) {
      errors.push({ row: line, column: 'subject', message: 'Unknown subject' });
      return;
    }
    const chapter = subject.chapters.find((c) => c.number === r.chapter_number);
    if (!chapter) {
      errors.push({ row: line, column: 'chapter_number', message: `Chapter ${r.chapter_number} does not exist` });
      return;
    }
    candidates.push({
      line,
      chapterId: chapter.id,
      topicName: r.topic ?? null,
      stem: r.stem,
      options: [r.option_a, r.option_b, r.option_c, r.option_d],
      correct: r.correct,
      explanation: r.explanation ?? null,
    });
  });

  const hashes = await contentHashes(
    candidates.map((c) => ({ stem: c.stem, a: c.options[0], b: c.options[1], c: c.options[2], d: c.options[3] })),
  );
  const existing = new Set<string>();
  for (let i = 0; i < hashes.length; i += 300) {
    const chunk = hashes.slice(i, i + 300);
    const rows = unwrap(await supabaseAdmin.from('questions').select('content_hash').in('content_hash', chunk));
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

  const invalidRows = new Set(errors.map((e) => e.row)).size;
  const summary = { valid: valid.length, invalid: invalidRows, duplicates: duplicateRows.length };
  let importToken: string | null = null;
  if (valid.length > 0) {
    importToken = unwrap(
      await supabaseAdmin.from('question_import_batches').insert({ admin_id: adminId, rows: valid, summary }).select('id').single(),
    ).id;
  }
  return { importToken, total: rawRows.length, ...summary, errors: errors.slice(0, 500), duplicateRows, ignoredColumns };
}

export async function commitImport(
  adminId: string,
  input: { importToken: string; defaultStatus: 'draft' | 'active' | 'archived' },
): Promise<{ imported: number; duplicatesSkipped: number; invalid: number }> {
  const batch = unwrapMaybe(
    await supabaseAdmin
      .from('question_import_batches')
      .select('rows, summary')
      .eq('id', input.importToken)
      .eq('admin_id', adminId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  );
  if (!batch) throw new ServiceError('NOT_FOUND');
  const rows = batch.rows as unknown as ImportRow[];
  const summary = batch.summary as { invalid: number; duplicates: number };

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
            option_a: r.options[0],
            option_b: r.options[1],
            option_c: r.options[2],
            option_d: r.options[3],
            correct_option: r.correct,
            explanation: r.explanation,
            status: input.defaultStatus,
            created_by: adminId,
            updated_by: adminId,
          })),
        )
        .select('id'),
    );
    imported += inserted.length;
  }

  check(await supabaseAdmin.from('question_import_batches').delete().eq('id', input.importToken));
  await logAdminAudit({
    adminId,
    action: 'question.import',
    entityType: 'question',
    meta: { imported, duplicatesSkipped: summary.duplicates, invalid: summary.invalid, status: input.defaultStatus },
  });
  return { imported, duplicatesSkipped: summary.duplicates, invalid: summary.invalid };
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

const csvEscape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function buildTemplateCsv(): string {
  return `﻿${IMPORT_COLUMNS.join(',')}\n${IMPORT_COLUMNS.map((c) => csvEscape(EXAMPLE_ROW[c])).join(',')}\n`;
}

export async function buildTemplateXlsx(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('questions');
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.addRow(IMPORT_COLUMNS.map((c) => EXAMPLE_ROW[c]));
  sheet.getRow(1).font = { bold: true };
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

export function buildErrorReportCsv(errors: ImportIssue[]): string {
  return `﻿row,column,message\n${errors.map((e) => [String(e.row), e.column, e.message].map(csvEscape).join(',')).join('\n')}\n`;
}
