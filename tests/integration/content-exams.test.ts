// @vitest-environment node
// Requires the local Supabase stack. Taxonomy, question bank, import, exam builder (P2.10, P2.12–P2.15).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as examActions from '@/features/exams/actions';
import { getExamForBuilder, getExamPreview, listExamsAdmin } from '@/features/exams/queries';
import { buildErrorReportCsv, buildTemplateCsv, buildTemplateXlsx, parseImportFile } from '@/features/questions/import';
import * as questionActions from '@/features/questions/actions';
import { getQuestionForEdit, searchQuestions } from '@/features/questions/queries';
import * as taxonomyActions from '@/features/taxonomy/actions';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { testDb } from '../helpers/db';
import { cleanup, makeAdmin, makeExam, makeQuestionBank, makeStudent, trackExam, trackQuestion } from '../helpers/fixtures';
import { authState } from '../helpers/mocks';

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
  it('creates topics/tags, rejects duplicates, and blocks deleting a used topic', async () => {
    const topic = ok(await taxonomyActions.upsertTopic({ chapterId: bank.chapterId, nameBn: 'বাইনারি', nameEn: `Binary ${bank.slug}` }));
    expect(await taxonomyActions.upsertTopic({ chapterId: bank.chapterId, nameBn: 'x', nameEn: `Binary ${bank.slug}` })).toMatchObject({
      ok: false, error: { code: 'VALIDATION', field: 'nameEn' },
    });
    const tag = ok(await taxonomyActions.upsertTag({ name: `tag-${bank.slug}` }));

    const q = ok(await questionActions.createQuestion({ question: question({ topicId: topic.id, tagIds: [tag.id] }) }));
    trackQuestion(q.id);
    expect(await taxonomyActions.deleteTopic({ id: topic.id })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const tree = await getTaxonomy();
    const chapter = tree.subjects.flatMap((s) => s.chapters).find((c) => c.id === bank.chapterId);
    expect(chapter?.topics.map((t) => t.id)).toContain(topic.id);
    expect(ok(await taxonomyActions.deleteTag({ id: tag.id }))).toEqual({ deleted: true });
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

  it('search: filters, tags all-of, unused-only, sort, status and bulk ops', async () => {
    const [q1, q2] = bank.questions;
    if (!q1 || !q2) throw new Error('fixture');
    const tagA = ok(await taxonomyActions.upsertTag({ name: `a-${bank.slug}` }));
    const tagB = ok(await taxonomyActions.upsertTag({ name: `b-${bank.slug}` }));
    ok(await questionActions.bulkTag({ ids: [q1.id, q2.id], tagIds: [tagA.id], op: 'add' }));
    ok(await questionActions.bulkTag({ ids: [q2.id], tagIds: [tagB.id], op: 'add' }));

    const both = await searchQuestions({ tagIds: [tagA.id, tagB.id] });
    expect(both.items.map((q) => q.id)).toEqual([q2.id]);
    const text = await searchQuestions({ chapterId: bank.chapterId, q: `${bank.slug} question 2` });
    expect(text.items.map((q) => q.id)).toEqual([q2.id]);
    expect(text.items[0]?.stemHtml).toContain('katex');

    const subject = await searchQuestions({ subjectId: bank.subjectId, unusedOnly: true, sort: 'most_used' });
    expect(subject.items.every((q) => q.times_used === 0)).toBe(true);

    ok(await questionActions.setQuestionStatus({ ids: [q2.id], status: 'archived' }));
    expect((await searchQuestions({ chapterId: bank.chapterId })).items.map((q) => q.id)).not.toContain(q2.id);
    expect((await searchQuestions({ chapterId: bank.chapterId, status: ['archived'] })).items.map((q) => q.id)).toEqual([q2.id]);
    ok(await questionActions.setQuestionStatus({ ids: [q2.id], status: 'active' }));
    ok(await questionActions.bulkTag({ ids: [q2.id], tagIds: [tagB.id], op: 'remove' }));
    expect((await searchQuestions({ tagIds: [tagB.id] })).items).toHaveLength(0);
  });

  it('signed upload URL for question media', async () => {
    const upload = ok(await questionActions.createMediaUploadUrl({ ext: 'png' }));
    expect(upload.path).toMatch(/^questions\/[0-9a-f-]{36}\.png$/);
    expect(upload.signedUrl).toContain('/storage/v1/object/upload/sign/question-media/');
  });
});

describe('bulk import (P2.14)', () => {
  const header = 'subject,chapter_number,topic,stem,option_a,option_b,option_c,option_d,correct,explanation,difficulty,type,source,board_year,tags';
  const csvFile = (lines: string[]) => {
    const form = new FormData();
    form.set('file', new File([`${header}\n${lines.join('\n')}\n`], 'questions.csv', { type: 'text/csv' }));
    return form;
  };

  it('previews good, invalid and duplicate rows, then commits valid ones with topics and tags', async () => {
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
      `${bank.slug},1,,"bad year",a,b,c,d,A,,,,,1999,`,
    ];
    const preview = ok(await questionActions.previewImport(csvFile(lines)));
    expect(preview).toMatchObject({ total: 7, valid: 2, invalid: 3, duplicates: 2 });
    expect(preview.duplicateRows).toEqual([{ row: 4, reason: 'in_file' }, { row: 5, reason: 'in_bank' }]);
    expect(preview.errors.map((e) => [e.row, e.column])).toEqual([[6, 'chapter_number'], [7, 'correct'], [8, 'board_year']]);
    expect(buildErrorReportCsv(preview.errors)).toContain('6,chapter_number,Chapter 9 does not exist');

    const result = ok(await questionActions.commitImport({ importToken: preview.importToken as string, defaultStatus: 'draft' }));
    expect(result).toEqual({ imported: 2, duplicatesSkipped: 2, invalid: 3 });
    const imported = await searchQuestions({ q: s, status: ['draft'] });
    expect(imported.total).toBe(2);
    const first = imported.items.find((q) => q.stem.includes('প্রশ্ন ১'));
    expect(first?.correct_option).toBe('A');
    expect(first?.topic?.name_en).toBe(`New Topic ${s}`);
    expect(first?.tags.map((t) => t.name).sort()).toEqual([`${s}-t1`, `${s}-t2`]);
    for (const q of imported.items) trackQuestion(q.id);

    expect(await questionActions.commitImport({ importToken: preview.importToken as string, defaultStatus: 'draft' })).toMatchObject({
      ok: false, error: { code: 'NOT_FOUND' },
    });
  });

  it('rejects wrong headers, too many rows, and unsupported files', async () => {
    const wrong = new FormData();
    wrong.set('file', new File(['question,answer\nx,y\n'], 'q.csv'));
    expect(await questionActions.previewImport(wrong)).toMatchObject({ ok: false, error: { code: 'IMPORT_BAD_HEADERS' } });

    const many = Array.from({ length: 2001 }, (_, i) => `,1,,"q${i}",a,b,c,d,A,,,,,,`);
    expect(await questionActions.previewImport(csvFile(many))).toMatchObject({ ok: false, error: { code: 'IMPORT_TOO_LARGE' } });

    const pdf = new FormData();
    pdf.set('file', new File(['%PDF'], 'q.pdf'));
    expect(await questionActions.previewImport(pdf)).toMatchObject({ ok: false, error: { code: 'IMPORT_BAD_HEADERS' } });
  });

  it('templates round-trip through the parser (CSV and XLSX)', async () => {
    const csvRows = await parseImportFile({ name: 't.csv', bytes: new TextEncoder().encode(buildTemplateCsv()).buffer as ArrayBuffer });
    const xlsxRows = await parseImportFile({ name: 't.xlsx', bytes: await buildTemplateXlsx() });
    expect(csvRows).toHaveLength(1);
    expect(xlsxRows[0]).toEqual(csvRows[0]);
    expect(csvRows[0]?.stem).toContain('এর দশমিক মান');
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
