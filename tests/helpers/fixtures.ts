import { randomInt } from 'node:crypto';
import type { AdminContext, StudentContext } from '@/lib/auth/guards';
import { computeAccessState } from '@/lib/auth/access';
import { randomMobile, testDb } from './db';

/** Self-contained fixtures for integration tests; `cleanup()` removes everything they created. */
const DAY = 86_400_000;
const created = {
  admins: [] as string[],
  students: [] as string[],
  subjects: [] as string[],
  chapters: [] as string[],
  questions: [] as string[],
  exams: [] as string[],
  plans: [] as string[],
  admissionsByMobile: [] as string[],
};

const must = <T>(result: { data: T; error: unknown }): NonNullable<T> => {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
};

export async function makeAdmin(): Promise<AdminContext> {
  const email = `admin-${Date.now()}-${randomInt(1e6)}@test.local`;
  const admin = must(
    await testDb.from('admins').insert({ email, display_name: 'Test Admin', password_hash: 'x' }).select('id, email, display_name, is_active').single(),
  );
  created.admins.push(admin.id);
  return { sessionId: crypto.randomUUID(), admin };
}

export async function makeStudent(
  options: {
    expired?: boolean;
    status?: 'active' | 'suspended' | 'cancelled';
    mobile?: string;
    pinHash?: string;
    mustChangePin?: boolean;
    startsInFuture?: boolean;
    planId?: string;
  } = {},
) {
  const mobile = options.mobile ?? randomMobile();
  const now = Date.now();
  const student = must(
    await testDb
      .from('students')
      .insert({
        mobile,
        email: `${mobile}@test.local`,
        pin_hash: options.pinHash ?? 'x',
        must_change_pin: options.mustChangePin ?? false,
        status: options.status ?? 'active',
        access_starts_at: new Date(options.startsInFuture ? now + 2 * DAY : now - 30 * DAY).toISOString(),
        access_expires_at: new Date(options.expired ? now - DAY : now + 30 * DAY).toISOString(),
        plan_id: options.planId ?? null,
      })
      .select('id, mobile, email, status, must_change_pin, access_starts_at, access_expires_at, plan_id, credentials_status')
      .single(),
  );
  created.students.push(student.id);
  created.admissionsByMobile.push(mobile);
  return student;
}

/** A plan for exam-audience tests (R1.1). Inactive, so it never shows on public pages; the audience
 * rule only looks at the student's plan_id. */
export async function makePlan(): Promise<{ id: string; code: string }> {
  const code = `p-${Date.now().toString(36)}-${randomInt(1e6).toString(36)}`;
  const plan = must(
    await testDb.from('plans').insert({ code, name_bn: `প্ল্যান ${code}`, name_en: `Plan ${code}`, duration_days: 30, price_bdt: 100, sort_order: 900, is_active: false }).select('id, code').single(),
  );
  created.plans.push(plan.id);
  return plan;
}

export function studentContext(student: Awaited<ReturnType<typeof makeStudent>>): StudentContext {
  return { sessionId: crypto.randomUUID(), student, accessState: computeAccessState(student) };
}

export function trackMobile(mobile: string) {
  created.admissionsByMobile.push(mobile);
}
export function trackStudent(id: string) {
  created.students.push(id);
}

/** A private subject + chapter with `n` active questions whose correct answers cycle A,B,C,D. */
export async function makeQuestionBank(n = 4) {
  const slug = `t-${Date.now().toString(36)}-${randomInt(1e6).toString(36)}`;
  const subject = must(await testDb.from('subjects').insert({ slug, name_bn: 'টেস্ট', name_en: 'Test' }).select('id').single());
  created.subjects.push(subject.id);
  const chapter = must(
    await testDb.from('chapters').insert({ subject_id: subject.id, number: 1, name_bn: 'অধ্যায়', name_en: 'Chapter' }).select('id').single(),
  );
  created.chapters.push(chapter.id);
  const keys = ['A', 'B', 'C', 'D'] as const;
  const questions = must(
    await testDb
      .from('questions')
      .insert(
        Array.from({ length: n }, (_, i) => ({
          chapter_id: chapter.id,
          stem: `${slug} question ${i + 1} $x^${i}$`,
          option_a: `a${i}`,
          option_b: `b${i}`,
          option_c: `c${i}`,
          option_d: `d${i}`,
          correct_option: keys[i % 4] as (typeof keys)[number],
          explanation: `EXPLANATION-TOKEN-${slug}-${i}`,
          status: 'active' as const,
        })),
      )
      .select('id, correct_option, explanation'),
  );
  created.questions.push(...questions.map((q) => q.id));
  return { subjectId: subject.id, chapterId: chapter.id, questions, slug };
}

export async function makeExam(input: {
  questionIds: string[];
  startsAt?: Date;
  liveEndsAt?: Date;
  lateUntil?: Date | null;
  accessMode?: 'fixed' | 'window' | 'always';
  status?: 'draft' | 'published';
  negativeMark?: number;
  durationMinutes?: number;
  resultsPublishAt?: Date | null;
  answersPublishAt?: Date | null;
  showOptionStats?: boolean;
  rankLateAttempts?: boolean;
  isSample?: boolean;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  marksPerQuestion?: number;
  audience?: 'all_active' | 'plans';
  /** With audience = 'plans': the targeted plans. */
  planIds?: string[];
}) {
  const now = Date.now();
  const exam = must(
    await testDb
      .from('exams')
      .insert({
        title: `Test exam ${randomInt(1e6)}`,
        status: input.status ?? 'published',
        is_sample: input.isSample ?? false,
        access_mode: input.accessMode ?? 'fixed',
        starts_at: input.isSample ? null : (input.startsAt ?? new Date(now - 5 * 60_000)).toISOString(),
        live_ends_at: input.isSample ? null : (input.liveEndsAt ?? new Date(now + 60 * 60_000)).toISOString(),
        late_until: input.lateUntil ? input.lateUntil.toISOString() : null,
        duration_minutes: input.durationMinutes ?? 30,
        negative_mark: input.negativeMark ?? 0,
        results_publish_at: input.resultsPublishAt ? input.resultsPublishAt.toISOString() : null,
        answers_publish_at: input.answersPublishAt ? input.answersPublishAt.toISOString() : null,
        show_option_stats: input.showOptionStats ?? true,
        rank_late_attempts: input.rankLateAttempts ?? false,
        shuffle_questions: input.shuffleQuestions ?? false,
        shuffle_options: input.shuffleOptions ?? false,
        marks_per_question: input.marksPerQuestion ?? 1,
        audience: input.audience ?? 'all_active',
      })
      .select('id')
      .single(),
  );
  created.exams.push(exam.id);
  if (input.questionIds.length) {
    must(
      await testDb
        .from('exam_questions')
        .insert(input.questionIds.map((question_id, i) => ({ exam_id: exam.id, question_id, position: i + 1 })))
        .select('exam_id'),
    );
  }
  if (input.planIds?.length) {
    must(await testDb.from('exam_audience_plans').insert(input.planIds.map((plan_id) => ({ exam_id: exam.id, plan_id }))).select('exam_id'));
  }
  return exam.id;
}

export function trackExam(id: string) {
  created.exams.push(id);
}
export function trackQuestion(id: string) {
  created.questions.push(id);
}

export async function cleanup(): Promise<void> {
  if (created.exams.length) {
    await testDb.from('exam_attempts').delete().in('exam_id', created.exams);
    await testDb.from('exams').delete().in('id', created.exams);
  }
  if (created.students.length) await testDb.from('exam_attempts').delete().in('student_id', created.students);
  if (created.questions.length) await testDb.from('questions').delete().in('id', created.questions);
  if (created.chapters.length) {
    await testDb.from('questions').delete().in('chapter_id', created.chapters);
    await testDb.from('topics').delete().in('chapter_id', created.chapters);
    await testDb.from('chapters').delete().in('id', created.chapters);
  }
  if (created.subjects.length) await testDb.from('subjects').delete().in('id', created.subjects);
  if (created.admissionsByMobile.length) {
    await testDb.from('admissions').delete().in('mobile', created.admissionsByMobile);
    await testDb.from('rate_limit_events').delete().in('subject', created.admissionsByMobile);
  }
  if (created.students.length) {
    await testDb.from('admissions').delete().in('student_id', created.students);
    await testDb.from('students').delete().in('id', created.students);
  }
  if (created.plans.length) {
    await testDb.from('admissions').update({ plan_id: null }).in('plan_id', created.plans);
    await testDb.from('plans').delete().in('id', created.plans);
  }
  if (created.admins.length) {
    await testDb.from('question_import_batches').delete().in('admin_id', created.admins);
    await testDb.from('admins').delete().in('id', created.admins);
  }
  for (const list of Object.values(created)) list.length = 0;
}
