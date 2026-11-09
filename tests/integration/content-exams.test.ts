// @vitest-environment node
// Requires the local Supabase stack. Taxonomy, question bank, import, exam builder (P2.10, P2.12–P2.15).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as examActions from '@/features/exams/actions';
import { getExamForBuilder, getExamPreview, listExamsAdmin } from '@/features/exams/queries';
import ExcelJS from 'exceljs';
import { POST as cleanupRoute } from '@/app/api/internal/imports/cleanup/route';
import { buildErrorReportCsv, buildTemplateCsv, buildTemplateXlsx, cleanupStaleImports } from '@/features/questions/import';
import { IMAGE_CONTENT_TYPES, type ImportPayload, stagedImagePath } from '@/lib/import/columns';
import { parseImportFile } from '@/lib/import/parse';
import { signQuestionMedia } from '@/lib/supabase/storage';
import * as questionActions from '@/features/questions/actions';
import { getQuestionForEdit, searchQuestions } from '@/features/questions/queries';
import * as taxonomyActions from '@/features/taxonomy/actions';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { testDb } from '../helpers/db';
import { cleanup, makeAdmin, makeExam, makeQuestionBank, makeStudent, trackExam, trackQuestion } from '../helpers/fixtures';
import { authState } from '../helpers/mocks';
import { buildWorkbook, makePng, questionRow, toArrayBuffer } from '../helpers/xlsx';

vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => import('../helpers/next-server-mock'));
vi.mock('next/headers', () => import('../helpers/next-headers-mock'));

let admin: Awaited<ReturnType<typeof makeAdmin>>;
let bank: Awaited<ReturnType<typeof makeQuestionBank>>;
const ok = <T>(result: { ok: true; data: T } | { ok: false; error: { code: string } }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.data;
};
const question = (overrides: Record<string, unknown> = {}) => ({
  chapterId: bank.chapterId,
  stem: `Unique stem ${crypto.randomUUID()}`,
  optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd',
  correctOption: 'B',
  status: 'active',
  ...overrides,
});

beforeAll(async () => {
  admin = await makeAdmin();
  bank = await makeQuestionBank(4);
});
beforeEach(() => {
  authState.admin = admin;
});
afterAll(cleanup);

describe('taxonomy (P2.10)', () => {
  it('creates topics, rejects duplicates, and blocks deleting a used topic', async () => {
    const topic = ok(await taxonomyActions.upsertTopic({ chapterId: bank.chapterId, nameBn: 'বাইনারি', nameEn: `Binary ${bank.slug}` }));
    expect(await taxonomyActions.upsertTopic({ chapterId: bank.chapterId, nameBn: 'x', nameEn: `Binary ${bank.slug}` })).toMatchObject({
      ok: false, error: { code: 'VALIDATION', field: 'nameEn' },
    });
    const q = ok(await questionActions.createQuestion({ question: question({ topicId: topic.id }) }));
    trackQuestion(q.id);
    expect(await taxonomyActions.deleteTopic({ id: topic.id })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const tree = await getTaxonomy();
    const chapter = tree.subjects.flatMap((s) => s.chapters).find((c) => c.id === bank.chapterId);
    expect(chapter?.topics.map((t) => t.id)).toContain(topic.id);
    expect(tree).not.toHaveProperty('tags'); // R1.1: tags removed
  });
});

describe('questions (P2.12–P2.13)', () => {
  it('duplicate detection by normalised content, with force override', async () => {
    const stem = `Dup check ${crypto.randomUUID()}`;
    const first = ok(await questionActions.createQuestion({ question: question({ stem }) }));
    trackQuestion(first.id);
    const dup = await questionActions.createQuestion({ question: question({ stem: `  ${stem.toUpperCase()}  `, optionA: ' A ' }) });
    expect(dup).toMatchObject({ ok: false, error: { code: 'QUESTION_DUPLICATE', meta: { duplicateId: first.id } } });
    const forced = ok(await questionActions.createQuestion({ question: question({ stem: stem.toUpperCase() }), force: true }));
    trackQuestion(forced.id);
  });

  it('topic must belong to the chapter', async () => {
    const otherBank = await makeQuestionBank(1);
    const topic = ok(await taxonomyActions.upsertTopic({ chapterId: otherBank.chapterId, nameBn: 'অন্য', nameEn: 'Other' }));
    expect(await questionActions.createQuestion({ question: question({ topicId: topic.id }) })).toMatchObject({
      ok: false, error: { code: 'VALIDATION', field: 'topicId' },
    });
  });

  it('answer key locked after use; text edits allowed; duplicate copies as draft', async () => {
    const studentQuestion = bank.questions[0];
    if (!studentQuestion) throw new Error('fixture');
    const examId = await makeExam({ questionIds: [studentQuestion.id] });
    const student = await makeStudent();
    await testDb.rpc('start_attempt', { p_exam_id: examId, p_student_id: student.id });

    const current = await getQuestionForEdit(studentQuestion.id);
    const input = question({ stem: current?.stem, optionA: 'a0', optionB: 'b0', optionC: 'c0', optionD: 'd0', correctOption: 'D' });
    expect(await questionActions.updateQuestion({ id: studentQuestion.id, question: input, force: true })).toMatchObject({
      ok: false, error: { code: 'QUESTION_LOCKED_CORRECT_OPTION' },
    });
    expect((await questionActions.updateQuestion({ id: studentQuestion.id, question: { ...input, correctOption: 'A', explanation: 'fixed' }, force: true })).ok).toBe(true);
    expect(ok(await questionActions.getQuestionUsage({ id: studentQuestion.id }))).toEqual({ examsWithAttempts: 1 });

    const copy = ok(await questionActions.duplicateQuestion({ id: studentQuestion.id }));
    trackQuestion(copy.id);
    expect((await getQuestionForEdit(copy.id))?.status).toBe('draft');
  });

  it('search: filters, unused-only, sort, status and bulk status', async () => {
    const [, q2] = bank.questions;
    if (!q2) throw new Error('fixture');
    const text = await searchQuestions({ chapterId: bank.chapterId, q: `${bank.slug} question 2` });
    expect(text.items.map((q) => q.id)).toEqual([q2.id]);
    expect(text.items[0]?.stemHtml).toContain('katex');
    // R1.1: no difficulty/type/source/board year/tags on bank rows
    for (const key of ['difficulty', 'qtype', 'source', 'board_year', 'tags']) expect(text.items[0]).not.toHaveProperty(key);

    const subject = await searchQuestions({ subjectId: bank.subjectId, unusedOnly: true, sort: 'most_used' });
    expect(subject.items.every((q) => q.times_used === 0)).toBe(true);

    ok(await questionActions.setQuestionStatus({ ids: [q2.id], status: 'archived' }));
    expect((await searchQuestions({ chapterId: bank.chapterId })).items.map((q) => q.id)).not.toContain(q2.id);
    expect((await searchQuestions({ chapterId: bank.chapterId, status: ['archived'] })).items.map((q) => q.id)).toEqual([q2.id]);
    ok(await questionActions.setQuestionStatus({ ids: [q2.id], status: 'active' }));
  });

  it('signed upload URL for question media', async () => {
    const upload = ok(await questionActions.createMediaUploadUrl({ ext: 'png' }));
    expect(upload.path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);
    expect(upload.signedUrl).toContain('/storage/v1/object/upload/sign/question-media/');
  });
});

describe('question deletion (R1.1 V2.10–V2.11, D3)', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const stored = async (path: string) => {
    const [folder, name] = path.split('/');
    const { data } = await testDb.storage.from('question-media').list(folder, { search: name });
    return (data ?? []).some((file) => file.name === name);
  };

  it('never used → hard delete removes the row and its Storage image', async () => {
    const path = `questions/${crypto.randomUUID()}.png`;
    expect((await testDb.storage.from('question-media').upload(path, PNG, { contentType: 'image/png' })).error).toBeNull();
    const q = ok(await questionActions.createQuestion({ question: question({ stemImagePath: path }) }));
    trackQuestion(q.id);
    expect(await stored(path)).toBe(true);

    expect(ok(await questionActions.deleteQuestions({ ids: [q.id] }))).toEqual({ hard: 1, soft: 0 });
    expect((await testDb.from('questions').select('id').eq('id', q.id)).data).toEqual([]);
    expect(await stored(path)).toBe(false);
    const audit = await testDb.from('audit_log').select('meta').eq('action', 'question.delete').eq('entity_id', q.id).single();
    expect(audit.data?.meta).toMatchObject({ mode: 'hard' });
  });

  it('in a draft exam → QUESTION_IN_USE lists the exam and deletes nothing', async () => {
    const free = ok(await questionActions.createQuestion({ question: question() }));
    const used = ok(await questionActions.createQuestion({ question: question() }));
    trackQuestion(free.id);
    trackQuestion(used.id);
    const examId = await makeExam({ questionIds: [used.id], status: 'draft' });

    const result = await questionActions.deleteQuestions({ ids: [free.id, used.id] });
    expect(result).toMatchObject({ ok: false, error: { code: 'QUESTION_IN_USE', message: 'errors.questionInUse' } });
    if (result.ok) throw new Error('expected failure');
    expect(result.error.meta?.exams).toEqual([{ id: examId, title: expect.any(String), phase: 'draft' }]);
    expect(await getQuestionForEdit(free.id)).not.toBeNull();
  });

  it('only in a past exam → soft delete: gone from the bank, kept for the exam', async () => {
    const stem = `Soft delete ${crypto.randomUUID()}`;
    const q = ok(await questionActions.createQuestion({ question: question({ stem }) }));
    trackQuestion(q.id);
    const examId = await makeExam({
      questionIds: [q.id],
      startsAt: new Date(Date.now() - 3 * 3_600_000),
      liveEndsAt: new Date(Date.now() - 2 * 3_600_000),
    });

    expect(ok(await questionActions.deleteQuestions({ ids: [q.id] }))).toEqual({ hard: 0, soft: 1 });
    expect(await getQuestionForEdit(q.id)).toBeNull();
    expect((await searchQuestions({ chapterId: bank.chapterId, status: ['active', 'draft', 'archived'] })).items.map((r) => r.id)).not.toContain(q.id);
    expect(ok(await questionActions.searchBank({ q: stem })).total).toBe(0);
    expect(await questionActions.updateQuestion({ id: q.id, question: question({ stem }) })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await examActions.setExamQuestions({ id: await makeExam({ questionIds: [], status: 'draft' }), questionIds: [q.id] })).toMatchObject({
      ok: false, error: { code: 'EXAM_INACTIVE_QUESTIONS' },
    });
    // The past exam still shows it, and the same text can be added again without a duplicate warning.
    expect((await getExamForBuilder(examId))?.questions.map((r) => r.id)).toContain(q.id);
    const again = ok(await questionActions.createQuestion({ question: question({ stem }) }));
    trackQuestion(again.id);
    // Deleting it a second time is a no-op.
    expect(ok(await questionActions.deleteQuestions({ ids: [q.id] }))).toEqual({ hard: 0, soft: 0 });
  });
});

describe('bulk import (P2.14, R1.1 V2.07, V2.15–V2.17)', () => {
  // The R1 template (15 columns) — still accepted; its five removed columns are ignored (D9).
  const legacyHeader = 'subject,chapter_number,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,difficulty,type,source,board_year,tags';
  const header = 'subject,chapter_number,topic,stem,option_a,option_b,option_c,option_d,correct,explanation';
  const csv = (lines: string[], head = legacyHeader) => Buffer.from(`${head}\n${lines.join('\n')}\n`, 'utf8');
  const media = () => testDb.storage.from('question-media');
  const uploads = () => testDb.storage.from('import-uploads');
  const stagedNames = async (batchId: string) => ((await media().list(`staging/${batchId}`)).data ?? []).map((f) => f.name);

  /** Does what the wizard does in the browser: parse, get signed URLs, PUT pictures then rows JSON. */
  async function stage(name: string, file: Buffer, tamper?: (payload: ImportPayload) => void): Promise<string> {
    const parsed = await parseImportFile({ name, bytes: toArrayBuffer(file) });
    const batchId = crypto.randomUUID();
    const payload: ImportPayload = {
      version: 1,
      fileName: name,
      headers: parsed.headers,
      rows: parsed.rows,
      images: parsed.images.map((img) => ({ row: img.row, column: img.column, path: stagedImagePath(batchId, img.row, img.column, img.ext) })),
      imageIssues: parsed.imageIssues,
    };
    tamper?.(payload);
    const files = [
      ...parsed.images.map((img) => ({ spec: { kind: 'image' as const, row: img.row, column: img.column, ext: img.ext }, body: Buffer.from(img.bytes), type: IMAGE_CONTENT_TYPES[img.ext] })),
      { spec: { kind: 'rows' as const }, body: Buffer.from(JSON.stringify(payload)), type: 'application/json' },
    ];
    for (let i = 0; i < files.length; i += 50) {
      const chunk = files.slice(i, i + 50);
      const signed = ok(await questionActions.createImportUploadUrls({ batchId, files: chunk.map((f) => f.spec) }));
      await Promise.all(chunk.map(async (f, j) => {
        const response = await fetch(signed[j]?.signedUrl ?? '', { method: 'PUT', headers: { 'content-type': f.type }, body: f.body });
        expect(response.ok).toBe(true);
      }));
    }
    return batchId;
  }

  it('legacy file: previews good, invalid and duplicate rows, ignores the removed columns, commits valid rows with topics', async () => {
    const s = `imp-${crypto.randomUUID().slice(0, 8)}`;
    const existing = bank.questions[0];
    const { data: existingRow } = await testDb.from('questions').select('stem, option_a, option_b, option_c, option_d').eq('id', existing?.id ?? '').single();
    const lines = [
      `${bank.slug},1,New Topic ${s},"${s} প্রশ্ন ১ $x^2$",a,b,c,d,a,ব্যাখ্যা,easy,knowledge,Dhaka Board,2023,${s}-t1|${s}-t2`,
      `${bank.slug},1,,"${s} question 2",a,b,c,d,B,,,,,,`,
      `${bank.slug},1,,"${s} QUESTION 2 ",A,B,C,D,C,,,,,,`, // duplicate within file (normalised)
      `${bank.slug},1,,"${existingRow?.stem}",${existingRow?.option_a},${existingRow?.option_b},${existingRow?.option_c},${existingRow?.option_d},A,,,,,,`, // in bank
      `${bank.slug},9,,"bad chapter",a,b,c,d,A,,,,,,`,
      `${bank.slug},1,,"bad answer",a,b,c,d,E,,,,,,`,
      `${bank.slug},1,,"${s} bad year ignored",a,b,c,d,A,,,,,1999,`, // R1 would reject 1999; the column is now ignored
    ];
    const batchId = await stage('questions.csv', csv(lines));
    const preview = ok(await questionActions.previewImport({ batchId }));
    expect(preview).toMatchObject({ importToken: batchId, total: 7, valid: 3, invalid: 2, duplicates: 2, images: 0 });
    expect(preview.ignoredColumns).toEqual(['difficulty', 'type', 'source', 'board_year', 'tags']);
    expect(preview.duplicateRows).toEqual([{ row: 4, reason: 'in_file' }, { row: 5, reason: 'in_bank' }]);
    expect(preview.errors.map((e) => [e.row, e.column])).toEqual([[6, 'chapter_number'], [7, 'correct']]);
    expect(buildErrorReportCsv(preview.errors)).toContain('6,chapter_number,Chapter 9 does not exist');

    const result = ok(await questionActions.commitImport({ importToken: preview.importToken as string, defaultStatus: 'draft' }));
    expect(result).toEqual({ imported: 3, duplicatesSkipped: 2, invalid: 2, images: 0 });
    const imported = await searchQuestions({ q: s, status: ['draft'] });
    expect(imported.total).toBe(3);
    const first = imported.items.find((q) => q.stem.includes('প্রশ্ন ১'));
    expect(first?.correct_option).toBe('A');
    expect(first?.topic?.name_en).toBe(`New Topic ${s}`);
    expect(first).not.toHaveProperty('tags');
    for (const q of imported.items) trackQuestion(q.id);
    expect((await uploads().list(batchId)).data).toEqual([]); // rows JSON removed after commit

    expect(await questionActions.commitImport({ importToken: preview.importToken as string, defaultStatus: 'draft' })).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    });
  });

  it('new 10-column template: imports without a legacy warning', async () => {
    const s = `new-${crypto.randomUUID().slice(0, 8)}`;
    const preview = ok(await questionActions.previewImport({ batchId: await stage('q.csv', csv([`${bank.slug},1,,"${s} নতুন",a,b,c,d,B,`], header)) }));
    expect(preview).toMatchObject({ total: 1, valid: 1, invalid: 0, duplicates: 0, ignoredColumns: [] });
    ok(await questionActions.commitImport({ importToken: preview.importToken as string, defaultStatus: 'draft' }));
    for (const q of (await searchQuestions({ q: s, status: ['draft'] })).items) trackQuestion(q.id);
  });

  it('the server re-checks the staged batch: headers, row count, missing or malformed rows JSON', async () => {
    const tampered = await stage('q.csv', csv([`${bank.slug},1,,"x",a,b,c,d,B,`], header), (p) => { p.headers = ['question', 'answer']; });
    expect(await questionActions.previewImport({ batchId: tampered })).toMatchObject({ ok: false, error: { code: 'IMPORT_BAD_HEADERS' } });

    const many = await stage('q.csv', csv([`${bank.slug},1,,"x",a,b,c,d,B,`], header), (p) => {
      p.rows = Array.from({ length: 2001 }, (_, i) => ({ row: i + 2, cells: { stem: `q${i}` } }));
    });
    expect(await questionActions.previewImport({ batchId: many })).toMatchObject({ ok: false, error: { code: 'IMPORT_TOO_LARGE' } });

    expect(await questionActions.previewImport({ batchId: crypto.randomUUID() })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const garbage = crypto.randomUUID();
    await uploads().upload(`${garbage}/rows.json`, Buffer.from('{"version":2}'), { contentType: 'application/json' });
    expect(await questionActions.previewImport({ batchId: garbage })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(await questionActions.createImportUploadUrls({ batchId: garbage, files: Array.from({ length: 51 }, () => ({ kind: 'rows' })) })).toMatchObject({
      ok: false, error: { code: 'VALIDATION' },
    });
    for (const id of [tampered, many, garbage]) ok(await questionActions.cancelImport({ batchId: id }));
  });

  it('pictures: anchored images import with their rows, image-only options work, bad cells are reported per cell', async () => {
    const s = `pic-${crypto.randomUUID().slice(0, 8)}`;
    const png = makePng(10, 6, [200, 30, 30]);
    const file = await buildWorkbook({
      rows: [
        { ...questionRow(`${s} stem picture`), subject: bank.slug, chapter_number: '1' },
        { ...questionRow(`${s} image-only B`, { option_b: '' }), subject: bank.slug, chapter_number: '1', explanation: 'see figure' },
        { ...questionRow(`${s} two pictures`), subject: bank.slug, chapter_number: '1' },
        { ...questionRow(`${s} missing upload`), subject: bank.slug, chapter_number: '1' },
        { ...questionRow(`${s} no text no picture`, { option_c: '' }), subject: bank.slug, chapter_number: '1' },
      ],
      pictures: [
        { row: 2, column: 'stem_image', bytes: png },
        { row: 3, column: 'option_b_image', bytes: png },
        { row: 3, column: 'explanation_image', bytes: makePng(4, 4) },
        { row: 4, column: 'stem_image', bytes: png },
        { row: 4, column: 'stem_image', bytes: makePng(3, 3) },
        { row: 5, column: 'option_a_image', bytes: png },
      ],
    });
    const batchId = await stage('pictures.xlsx', file);
    expect((await stagedNames(batchId)).sort()).toEqual(['2-stem_image.png', '3-explanation_image.png', '3-option_b_image.png', '5-option_a_image.png']);
    await media().remove([`staging/${batchId}/5-option_a_image.png`]); // the browser claims it, Storage doesn't have it

    const preview = ok(await questionActions.previewImport({ batchId }));
    expect(preview).toMatchObject({ total: 5, valid: 2, invalid: 3, duplicates: 0, images: 3 });
    expect(preview.errors.map((e) => [e.row, e.column, e.image ?? e.message])).toEqual([
      [4, 'stem_image', 'two_pictures'],
      [5, 'option_a_image', 'missing_upload'],
      [6, 'option_c', 'Enter text or add a picture'],
    ]);

    const result = ok(await questionActions.commitImport({ importToken: batchId, defaultStatus: 'active' }));
    expect(result).toMatchObject({ imported: 2, images: 3 });
    const rows = (await testDb.from('questions').select('id, stem, option_b, stem_image_path, option_b_image_path, explanation_image_path').like('stem', `${s}%`)).data ?? [];
    rows.forEach((q) => trackQuestion(q.id));
    const withStem = rows.find((q) => q.stem.endsWith('stem picture'));
    const imageOnly = rows.find((q) => q.stem.endsWith('image-only B'));
    expect(withStem?.stem_image_path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);
    expect(imageOnly).toMatchObject({ option_b: '' });
    expect(imageOnly?.option_b_image_path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);
    expect(imageOnly?.explanation_image_path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);

    // Same signed-URL path the editor preview, the exam paper and the review use.
    const urls = await signQuestionMedia([withStem?.stem_image_path], 60);
    const served = await fetch(urls.get(withStem?.stem_image_path ?? '') ?? '');
    expect(Buffer.from(await served.arrayBuffer()).equals(png)).toBe(true);
    expect((await getQuestionForEdit(imageOnly?.id ?? ''))?.option_b_image_path).toBe(imageOnly?.option_b_image_path);
    // Staged leftovers (the bad rows' pictures) and the rows JSON are gone.
    expect(await stagedNames(batchId)).toEqual([]);
    expect((await uploads().list(batchId)).data).toEqual([]);
  });

  it('cancel removes the staged files; the 24 h cleanup removes abandoned ones through the Storage API', async () => {
    const file = await buildWorkbook({ rows: [{ ...questionRow('cancel me'), subject: bank.slug, chapter_number: '1' }], pictures: [{ row: 2, column: 'stem_image', bytes: makePng() }] });
    const cancelled = await stage('c.xlsx', file);
    ok(await questionActions.previewImport({ batchId: cancelled }));
    expect(ok(await questionActions.cancelImport({ batchId: cancelled }))).toEqual({ removed: 2 });
    expect(await stagedNames(cancelled)).toEqual([]);
    expect((await uploads().list(cancelled)).data).toEqual([]);
    expect(await questionActions.commitImport({ importToken: cancelled, defaultStatus: 'draft' })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const abandoned = await stage('a.xlsx', file);
    expect(await cleanupStaleImports()).toEqual({ removed: 0 }); // fresh uploads are kept (24 h)
    expect((await cleanupStaleImports(0)).removed).toBeGreaterThanOrEqual(2);
    expect(await stagedNames(abandoned)).toEqual([]);
    expect((await uploads().list(abandoned)).data).toEqual([]);

    const call = (secret?: string) =>
      cleanupRoute(new Request('http://localhost/api/internal/imports/cleanup', { method: 'POST', headers: secret ? { 'x-cron-secret': secret } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call('wrong')).status).toBe(401);
    const response = await call(process.env.CRON_SECRET);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { removed: 0 } });
  });

  it('300 rows with 100 pictures: preview and commit each finish in under 5 s', async () => {
    const s = `perf-${crypto.randomUUID().slice(0, 8)}`;
    const rows = Array.from({ length: 300 }, (_, i) => ({ ...questionRow(`${s} q${i}`), subject: bank.slug, chapter_number: '1' }));
    const pictures = Array.from({ length: 100 }, (_, i) => ({ row: i * 3 + 2, column: 'stem_image', bytes: makePng(6, 6, [i, 100, 200]) }));
    const batchId = await stage('perf.xlsx', await buildWorkbook({ rows, pictures }));

    let started = performance.now();
    const preview = ok(await questionActions.previewImport({ batchId }));
    const previewMs = performance.now() - started;
    expect(preview).toMatchObject({ valid: 300, images: 100 });
    started = performance.now();
    ok(await questionActions.commitImport({ importToken: batchId, defaultStatus: 'draft' }));
    const commitMs = performance.now() - started;
    for (const q of (await testDb.from('questions').select('id').like('stem', `${s}%`)).data ?? []) trackQuestion(q.id);
    console.info(JSON.stringify({ importPerf: { previewMs: Math.round(previewMs), commitMs: Math.round(commitMs) } }));
    expect(previewMs).toBeLessThan(5000);
    expect(commitMs).toBeLessThan(5000);
  });

  it('templates: the XLSX has the image columns and an Instructions sheet; both round-trip through the parser', async () => {
    const xlsxBytes = await buildTemplateXlsx();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsxBytes);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(['questions', 'Instructions']);
    const instructions = workbook.getWorksheet('Instructions');
    const text = (instructions?.getColumn(1).values ?? []).join('\n');
    expect(text).toContain('Place over Cells');
    expect(text).toContain('1 MB');

    const fromCsv = await parseImportFile({ name: 't.csv', bytes: new TextEncoder().encode(buildTemplateCsv()).buffer as ArrayBuffer });
    const fromXlsx = await parseImportFile({ name: 't.xlsx', bytes: xlsxBytes });
    expect(buildTemplateCsv().split('\n')[0]?.replace(/^﻿/, '')).toBe(header);
    expect(fromXlsx.headers).toEqual([...header.split(','), 'stem_image', 'option_a_image', 'option_b_image', 'option_c_image', 'option_d_image', 'explanation_image']);
    expect(fromCsv.rows).toHaveLength(1);
    expect(fromCsv.ignoredColumns).toEqual([]);
    expect(fromXlsx.rows[0]).toEqual(fromCsv.rows[0]);
    expect(fromCsv.rows[0]?.cells.stem).toContain('এর দশমিক মান');
  });
});

describe('exam builder (P2.15)', () => {
  const settings = (overrides: Record<string, unknown> = {}) => ({
    title: 'Builder test',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    durationMinutes: 20,
    ...overrides,
  });

  it('create → questions → publish applies defaults; validation codes', async () => {
    const created = ok(await examActions.createExam(settings()));
    trackExam(created.id);
    expect(await examActions.publishExam({ id: created.id })).toMatchObject({ ok: false, error: { code: 'EXAM_NO_QUESTIONS' } });

    const draftQ = ok(await questionActions.createQuestion({ question: question({ status: 'draft' }) }));
    trackQuestion(draftQ.id);
    expect(await examActions.setExamQuestions({ id: created.id, questionIds: [draftQ.id] })).toMatchObject({
      ok: false, error: { code: 'EXAM_INACTIVE_QUESTIONS' },
    });

    const ids = bank.questions.slice(1, 4).map((q) => q.id);
    expect(ok(await examActions.setExamQuestions({ id: created.id, questionIds: ids }))).toEqual({ count: 3 });
    ok(await examActions.publishExam({ id: created.id }));

    const builder = await getExamForBuilder(created.id);
    expect(builder?.exam.status).toBe('published');
    expect(builder?.exam.phase).toBe('scheduled');
    expect(builder?.questions.map((q) => q.id)).toEqual(ids);
    // fixed mode: live window = start + duration; publish gates default to live end
    expect(Date.parse(builder?.exam.live_ends_at ?? '') - Date.parse(builder?.exam.starts_at ?? '')).toBe(20 * 60_000);
    expect(builder?.exam.results_publish_at).toBe(builder?.exam.live_ends_at);
    expect(builder?.exam.answers_publish_at).toBe(builder?.exam.live_ends_at);

    expect((await listExamsAdmin({ phase: 'scheduled' })).map((e) => e.id)).toContain(created.id);
    const preview = await getExamPreview(created.id);
    expect(preview?.questions).toHaveLength(3);
    expect(preview?.questions[0]?.correctOption).toBeDefined();
  });

  it('time validation and window mode', async () => {
    expect(await examActions.createExam(settings({ liveEndsAt: new Date(Date.now() + 1000).toISOString() }))).toMatchObject({
      ok: false, error: { code: 'EXAM_INVALID_TIMES' },
    });
    expect(await examActions.createExam(settings({ accessMode: 'window' }))).toMatchObject({
      ok: false, error: { code: 'EXAM_INVALID_TIMES', field: 'lateUntil' },
    });
  });

  it('locks after attempts: settings, unpublish; featured is unique; archive only when closed', async () => {
    const examId = await makeExam({ questionIds: [bank.questions[3]?.id as string] });
    const student = await makeStudent();
    await testDb.rpc('start_attempt', { p_exam_id: examId, p_student_id: student.id });
    const current = await getExamForBuilder(examId);
    expect(current?.locked).toBe(true);

    expect(
      await examActions.updateExamSettings({
        id: examId,
        settings: settings({ startsAt: current?.exam.starts_at, liveEndsAt: current?.exam.live_ends_at, negativeMark: 1 }),
      }),
    ).toMatchObject({ ok: false, error: { code: 'EXAM_LOCKED' } });
    expect(await examActions.unpublishExam({ id: examId })).toMatchObject({ ok: false, error: { code: 'EXAM_LOCKED' } });

    ok(await examActions.setFeaturedExam({ id: examId }));
    const other = await makeExam({ questionIds: [bank.questions[2]?.id as string] });
    ok(await examActions.setFeaturedExam({ id: other }));
    const { data: featured } = await testDb.from('exams').select('id').eq('is_featured', true);
    expect(featured?.map((e) => e.id)).toEqual([other]);
    ok(await examActions.setFeaturedExam({ id: null }));

    expect(await examActions.archiveExam({ id: examId })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    const closed = await makeExam({
      questionIds: [bank.questions[2]?.id as string],
      startsAt: new Date(Date.now() - 7200_000),
      liveEndsAt: new Date(Date.now() - 3600_000),
    });
    ok(await examActions.archiveExam({ id: closed }));
  });

  it('selected audience requires assignees before publish', async () => {
    const created = ok(await examActions.createExam(settings()));
    trackExam(created.id);
    ok(await examActions.setExamQuestions({ id: created.id, questionIds: [bank.questions[1]?.id as string] }));
    ok(await examActions.setExamAudience({ id: created.id, audience: 'selected', studentIds: [] }));
    expect(await examActions.publishExam({ id: created.id })).toMatchObject({ ok: false, error: { code: 'VALIDATION', field: 'audience' } });
    const student = await makeStudent();
    expect(ok(await examActions.setExamAudience({ id: created.id, audience: 'selected', studentIds: [student.id] }))).toEqual({ assigned: 1 });
    ok(await examActions.publishExam({ id: created.id }));
  });
});
