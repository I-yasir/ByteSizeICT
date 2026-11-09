// @vitest-environment node
// Requires the local Supabase stack. Exam runtime routes, results gates, sample, dashboards, settings (P2.16–P2.25).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as resumeRoute } from '@/app/api/attempts/[attemptId]/route';
import { PUT as answersRoute } from '@/app/api/attempts/[attemptId]/answers/route';
import { POST as submitRoute } from '@/app/api/attempts/[attemptId]/submit/route';
import { GET as csvRoute } from '@/app/api/admin/exams/[examId]/results.csv/route';
import { POST as startRoute } from '@/app/api/exams/[examId]/start/route';
import { POST as sampleRoute } from '@/app/api/sample/score/route';
import { buildPaper } from '@/features/attempts/paper';
import { getAdminOverview, getStudentDashboard } from '@/features/dashboard/queries';
import { getExamLobby, getStudentExamCards } from '@/features/exams/student-queries';
import {
  getActivePlans,
  getNextExam,
  getPaymentAccounts,
  getPublicSettings,
  getRoutine,
} from '@/features/public/queries';
import { getExamResultsAdmin } from '@/features/results/admin';
import { getAttemptResult, listStudentResults } from '@/features/results/queries';
import { getSamplePaper } from '@/features/sample/service';
import * as settingsActions from '@/features/settings/actions';
import { getAllSettings, getIntegrationsStatus } from '@/features/settings/queries';
import { testDb } from '../helpers/db';
import {
  cleanup,
  makeAdmin,
  makePlan,
  makeExam,
  makeQuestionBank,
  makeStudent,
  studentContext,
} from '../helpers/fixtures';
import { authState, requestState } from '../helpers/mocks';

vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => import('../helpers/next-server-mock'));
vi.mock('next/headers', () => import('../helpers/next-headers-mock'));

const ok = <T>(result: { ok: true; data: T } | { ok: false; error: { code: string } }): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.data;
};

/** What Settings → Plans does in the browser: signed URL, then PUT the PDF straight to Storage. */
async function uploadRoutinePdf(): Promise<string> {
  const signed = ok(await settingsActions.createRoutineUploadUrl({}));
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const response = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: pdf });
  if (!response.ok) throw new Error(`routine upload failed: ${response.status}`);
  return signed.path;
}

const ORIGIN = 'http://localhost:3000';
const MIN = 60_000;
let bank: Awaited<ReturnType<typeof makeQuestionBank>>;
let admin: Awaited<ReturnType<typeof makeAdmin>>;
const bodies: string[] = []; // every runtime response body, for the leak scan

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loosely typed JSON for response assertions only
type LooseJson = { ok: boolean; data?: any; error?: { code: string; meta?: any } };

async function call(response: Promise<Response>) {
  const res = await response;
  const text = await res.text();
  bodies.push(text);
  return { status: res.status, json: JSON.parse(text) as LooseJson };
}
const params = <K extends string>(key: K, value: string) => ({
  params: Promise.resolve({ [key]: value } as Record<K, string>),
});
const req = (method: string, body?: unknown) =>
  new Request(`${ORIGIN}/api`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const start = (examId: string) => call(startRoute(req('POST'), params('examId', examId)));
const resume = (attemptId: string) =>
  call(resumeRoute(new Request(`${ORIGIN}/api`), params('attemptId', attemptId)));
const save = (attemptId: string, body: unknown) =>
  call(answersRoute(req('PUT', body), params('attemptId', attemptId)));
const submit = (attemptId: string, body: unknown) =>
  call(submitRoute(req('POST', body), params('attemptId', attemptId)));

beforeAll(async () => {
  admin = await makeAdmin();
  bank = await makeQuestionBank(4); // correct answers: A, B, C, D
});
beforeEach(() => {
  authState.admin = null;
  authState.student = null;
});
afterAll(cleanup);

describe('exam runtime routes (P2.16–P2.21)', () => {
  it('start → resume → save → submit with negative marking; idempotent start; second submit 409', async () => {
    const ids = bank.questions.map((q) => q.id);
    const examId = await makeExam({ questionIds: ids, negativeMark: 0.25 });
    const student = await makeStudent();
    authState.student = studentContext(student);

    const [a, b] = await Promise.all([start(examId), start(examId)]);
    expect(a.status).toBe(200);
    expect(b.json.data.attemptId).toBe(a.json.data.attemptId);
    const attemptId = a.json.data.attemptId as string;

    const session = await resume(attemptId);
    expect(session.status).toBe(200);
    expect(session.json.data.questions.map((q: { id: string }) => q.id)).toEqual(ids);
    expect(session.json.data.questions[0].options.map((o: { key: string }) => o.key)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(Date.parse(session.json.data.deadlineAt)).toBeGreaterThan(Date.now() + 29 * MIN);

    const [q1, q2, q3] = ids as [string, string, string, string];
    expect(
      (
        await save(attemptId, {
          changes: [
            { q: q1, o: 'B', m: false, s: 2 },
            { q: q2, o: 'B', m: true, s: 3 },
          ],
          lastQuestionIndex: 1,
        })
      ).json,
    ).toMatchObject({
      ok: true,
      data: { applied: 2 },
    });
    expect(
      (await save(attemptId, { changes: [{ q: q1, o: 'C', m: false, s: 1 }] })).json.data.applied,
    ).toBe(0); // older seq
    expect((await save(attemptId, { changes: [] })).status).toBe(422);
    expect(
      (
        await save(attemptId, {
          changes: Array.from({ length: 201 }, (_, i) => ({ q: q1, o: 'A', m: false, s: i + 10 })),
        })
      ).status,
    ).toBe(422);

    const resumed = await resume(attemptId);
    expect(resumed.json.data.answers[q2]).toEqual({ o: 'B', m: true, s: 3 });
    expect(resumed.json.data.lastQuestionIndex).toBe(1);

    // final: q1 → A (correct, seq 5), q2 B (correct), q3 → A (wrong), q4 skipped ⇒ 2 − 0.25 = 1.75
    const done = await submit(attemptId, {
      auto: false,
      changes: [
        { q: q1, o: 'A', m: false, s: 5 },
        { q: q3, o: 'A', m: false, s: 6 },
      ],
    });
    expect(done.json).toEqual({ ok: true, data: { resultUrl: `/attempts/${attemptId}/result` } });
    const again = await submit(attemptId, { auto: false, changes: [] });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatchObject({
      code: 'ATTEMPT_CLOSED',
      meta: { resultUrl: `/attempts/${attemptId}/result` },
    });
    expect((await resume(attemptId)).status).toBe(409);

    const result = await getAttemptResult(attemptId, { id: student.id, accessState: 'active' });
    if (result.kind !== 'result') throw new Error(result.kind);
    expect(result.result.attempt).toMatchObject({
      score: 1.75,
      correct: 2,
      incorrect: 1,
      skipped: 1,
      accuracy: 66.7,
      status: 'submitted',
    });
  });

  it('another student cannot read or write the attempt (404)', async () => {
    const examId = await makeExam({ questionIds: [bank.questions[0]?.id as string] });
    const owner = await makeStudent();
    authState.student = studentContext(owner);
    const attemptId = (await start(examId)).json.data.attemptId as string;

    authState.student = studentContext(await makeStudent());
    expect((await resume(attemptId)).status).toBe(404);
    expect(
      (await save(attemptId, { changes: [{ q: bank.questions[0]?.id, o: 'A', m: false, s: 1 }] }))
        .status,
    ).toBe(404);
    expect((await submit(attemptId, {})).status).toBe(404);
    expect((await resume('not-a-uuid')).status).toBe(404);
  });

  it('timing: saves after deadline + 15 s → 409; submit past grace ignores late changes and auto-submits', async () => {
    const [q1] = bank.questions.map((q) => q.id) as [string];
    const examId = await makeExam({ questionIds: [q1] });
    const student = await makeStudent();
    authState.student = studentContext(student);
    const attemptId = (await start(examId)).json.data.attemptId as string;
    await save(attemptId, { changes: [{ q: q1, o: 'B', m: false, s: 1 }] });

    // inside the grace period: still accepted
    await testDb
      .from('exam_attempts')
      .update({ deadline_at: new Date(Date.now() - 5_000).toISOString() })
      .eq('id', attemptId);
    expect(
      (await save(attemptId, { changes: [{ q: q1, o: 'C', m: false, s: 2 }] })).json.data.applied,
    ).toBe(1);

    await testDb
      .from('exam_attempts')
      .update({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', attemptId);
    const late = await save(attemptId, { changes: [{ q: q1, o: 'A', m: false, s: 3 }] });
    expect(late.status).toBe(409);
    expect(late.json.error?.code).toBe('ATTEMPT_CLOSED');

    const { data } = await testDb
      .from('exam_attempts')
      .select('status, score')
      .eq('id', attemptId)
      .single();
    expect(data?.status).toBe('in_progress'); // not yet finalized: submit/cron/lazy read does that
    expect(
      (await submit(attemptId, { auto: true, changes: [{ q: q1, o: 'A', m: false, s: 4 }] }))
        .status,
    ).toBe(200);
    const { data: final } = await testDb
      .from('exam_attempts')
      .select('status, score')
      .eq('id', attemptId)
      .single();
    expect(final).toEqual({ status: 'auto_submitted', score: 0 }); // stored C (wrong) counts; late "A" ignored
  });

  it('access rules: inactive student 403 on start/save but may submit; scheduled exam 409; unassigned 404', async () => {
    const [q1] = bank.questions.map((q) => q.id) as [string];
    const examId = await makeExam({ questionIds: [q1] });
    const student = await makeStudent();
    authState.student = studentContext(student);
    const attemptId = (await start(examId)).json.data.attemptId as string;

    authState.student = { ...studentContext(student), accessState: 'cancelled' };
    expect((await start(examId)).status).toBe(403);
    expect((await save(attemptId, { changes: [{ q: q1, o: 'A', m: false, s: 1 }] })).status).toBe(
      403,
    );
    expect(
      (await submit(attemptId, { auto: false, changes: [{ q: q1, o: 'A', m: false, s: 1 }] }))
        .status,
    ).toBe(200);

    authState.student = studentContext(await makeStudent());
    const scheduled = await makeExam({
      questionIds: [q1],
      startsAt: new Date(Date.now() + 60 * MIN),
      liveEndsAt: new Date(Date.now() + 90 * MIN),
    });
    expect((await start(scheduled)).json.error?.code).toBe('EXAM_NOT_STARTED');

    // R1.1: audience by plan — outside the plan (or without one) the exam does not exist for the student.
    const plan = await makePlan();
    const forPlan = await makeExam({ questionIds: [q1], audience: 'plans', planIds: [plan.id] });
    expect((await start(forPlan)).status).toBe(404);
    authState.student = studentContext(await makeStudent({ planId: plan.id }));
    expect((await start(forPlan)).status).toBe(200);
  });

  it('shuffled options: paper display order follows option_order; scoring uses canonical keys', async () => {
    const [q1] = bank.questions.map((q) => q.id) as [string];
    const examId = await makeExam({ questionIds: [q1] });
    await testDb.from('exams').update({ shuffle_options: true }).eq('id', examId);
    const student = await makeStudent();
    authState.student = studentContext(student);
    const attemptId = (await start(examId)).json.data.attemptId as string;
    const { data: attempt } = await testDb
      .from('exam_attempts')
      .select('option_order')
      .eq('id', attemptId)
      .single();
    const order = (attempt?.option_order as Record<string, string>)[q1] as string;

    const session = await resume(attemptId);
    expect(session.json.data.questions[0].options.map((o: { key: string }) => o.key).join('')).toBe(
      order,
    );
    expect(
      session.json.data.questions[0].options.find((o: { key: string }) => o.key === 'A').html,
    ).toContain('a0');

    await submit(attemptId, { changes: [{ q: q1, o: 'A', m: false, s: 1 }] }); // canonical A is correct for q1
    const result = await getAttemptResult(attemptId, { id: student.id, accessState: 'active' });
    if (result.kind !== 'result') throw new Error(result.kind);
    expect(result.result.attempt.correct).toBe(1);
    expect(result.result.questions[0]?.options.map((o) => o.key).join('')).toBe(order);
  });
});

describe('answer-key leak (TRD §10.2)', () => {
  it('no runtime response or paper contains the answer key or explanations', async () => {
    const paper = await buildPaper({
      questionIds: bank.questions.map((q) => q.id),
      imageTtlSeconds: 600,
    });
    const all = [...bodies, JSON.stringify(paper)].join('\n');
    expect(all).not.toMatch(/correct_?option|explanation/i);
    expect(all).not.toContain('EXPLANATION-TOKEN');
    expect(bodies.length).toBeGreaterThan(10);
  });
});

describe('cards, lobby, results gates (P2.17, P2.22)', () => {
  it('audience by plan (R1.1 V2.27): cards, lobby and dashboard follow the plan; past results survive a plan switch', async () => {
    const q = bank.questions[0]?.id as string;
    const [planA, planB] = [await makePlan(), await makePlan()];
    const examId = await makeExam({ questionIds: [q], audience: 'plans', planIds: [planA.id] });
    const a = await makeStudent({ planId: planA.id });
    const b = await makeStudent({ planId: planB.id });
    const none = await makeStudent();
    const visible = async (studentId: string) => (await getStudentExamCards(studentId)).some((c) => c.examId === examId);
    expect(await visible(a.id)).toBe(true);
    expect(await visible(b.id)).toBe(false);
    expect(await visible(none.id)).toBe(false);
    expect(await getExamLobby(examId, a.id)).not.toBeNull();
    expect(await getExamLobby(examId, b.id)).toBeNull();
    // Dashboard: an exam starting in a minute is the student's first "upcoming" card.
    const soon = await makeExam({
      questionIds: [q], audience: 'plans', planIds: [planA.id],
      startsAt: new Date(Date.now() + MIN), liveEndsAt: new Date(Date.now() + 30 * MIN),
    });
    const dashboard = async (student: Awaited<ReturnType<typeof makeStudent>>) => {
      const dash = await getStudentDashboard(student);
      return [dash.primary, ...dash.upcoming].some((c) => c?.examId === soon);
    };
    expect(await dashboard(a)).toBe(true);
    expect(await dashboard(b)).toBe(false);

    const { data: attemptId } = await testDb.rpc('start_attempt', { p_exam_id: examId, p_student_id: a.id });
    await testDb.rpc('submit_attempt', { p_attempt_id: attemptId as string, p_student_id: a.id, p_changes: [], p_auto: false });
    // Renewal into another plan: the exam leaves the student's list, the result stays reachable.
    await testDb.from('students').update({ plan_id: planB.id }).eq('id', a.id);
    expect(await visible(a.id)).toBe(false);
    expect((await listStudentResults(a.id)).items.map((r) => r.attemptId)).toContain(attemptId);
    expect(await getAttemptResult(attemptId as string, { id: a.id, accessState: 'active' })).not.toBeNull();
  });

  it('cards cover live / upcoming / missed / missed_available / completed / locked', async () => {
    const q = bank.questions[0]?.id as string;
    const now = Date.now();
    const live = await makeExam({ questionIds: [q] });
    const upcoming = await makeExam({
      questionIds: [q],
      startsAt: new Date(now + 60 * MIN),
      liveEndsAt: new Date(now + 90 * MIN),
    });
    const missed = await makeExam({
      questionIds: [q],
      startsAt: new Date(now - 120 * MIN),
      liveEndsAt: new Date(now - 60 * MIN),
    });
    const window = await makeExam({
      questionIds: [q],
      accessMode: 'window',
      startsAt: new Date(now - 120 * MIN),
      liveEndsAt: new Date(now - 60 * MIN),
      lateUntil: new Date(now + 60 * MIN),
    });
    const student = await makeStudent();
    await testDb.rpc('start_attempt', { p_exam_id: live, p_student_id: student.id });

    const status = (cards: Awaited<ReturnType<typeof getStudentExamCards>>, id: string) =>
      cards.find((c) => c.examId === id)?.status;
    const cards = await getStudentExamCards(student.id);
    expect([
      status(cards, live),
      status(cards, upcoming),
      status(cards, missed),
      status(cards, window),
    ]).toEqual(['in_progress', 'upcoming', 'missed', 'missed_available']);
    const lobby = await getExamLobby(window, student.id);
    expect(lobby).toMatchObject({ status: 'missed_available', lateAttemptUnranked: true });

    const expired = await makeStudent({ expired: true });
    expect(status(await getStudentExamCards(expired.id), upcoming)).toBe('locked');
  });

  it('rank/answers/stats are hidden until their publish times and not computed', async () => {
    const ids = bank.questions.slice(0, 2).map((q) => q.id) as [string, string];
    const later = new Date(Date.now() + 60 * MIN);
    const examId = await makeExam({
      questionIds: ids,
      resultsPublishAt: later,
      answersPublishAt: later,
    });
    const student = await makeStudent();
    authState.student = studentContext(student);
    const attemptId = (await start(examId)).json.data.attemptId as string;
    await submit(attemptId, { changes: [{ q: ids[0], o: 'A', m: true, s: 1 }] });

    const hidden = await getAttemptResult(attemptId, { id: student.id, accessState: 'active' });
    if (hidden.kind !== 'result') throw new Error(hidden.kind);
    expect(hidden.result.rank).toEqual({
      visible: false,
      publishAt: later.toISOString().replace('Z', '+00:00'),
    });
    expect(hidden.result.answersVisible).toBe(false);
    expect(hidden.result.questions[0]).toMatchObject({
      selected: 'A',
      marked: true,
      status: null,
      correctOption: null,
      explanationHtml: null,
      stats: null,
    });
    expect(JSON.stringify(hidden)).not.toContain('EXPLANATION-TOKEN');

    await testDb
      .from('exams')
      .update({ results_publish_at: null, answers_publish_at: null })
      .eq('id', examId);
    const shown = await getAttemptResult(attemptId, { id: student.id, accessState: 'active' });
    if (shown.kind !== 'result') throw new Error(shown.kind);
    expect(shown.result.rank).toMatchObject({
      visible: true,
      position: 1,
      participants: 1,
      highest: 1,
    });
    expect(shown.result.questions.map((q) => q.status)).toEqual(['correct', 'skipped']);
    expect(shown.result.questions[0]?.explanationHtml).toContain('EXPLANATION-TOKEN');
    expect(shown.result.questions[0]?.stats).toEqual({ A: 100, B: 0, C: 0, D: 0, skipped: 0 });

    await testDb.from('exams').update({ show_option_stats: false }).eq('id', examId);
    const noStats = await getAttemptResult(attemptId, { id: student.id, accessState: 'active' });
    expect(noStats.kind === 'result' && noStats.result.questions[0]?.stats).toBeNull();
  });

  it('competition ranking with ties; late attempts unranked; in-progress and foreign attempts', async () => {
    const ids = bank.questions.slice(0, 2).map((q) => q.id) as [string, string];
    const examId = await makeExam({
      questionIds: ids,
      accessMode: 'always',
      startsAt: new Date(Date.now() - 10 * MIN),
      liveEndsAt: new Date(Date.now() + 60 * MIN),
    });
    const answer = async (o: 'A' | 'D') => {
      const s = await makeStudent();
      authState.student = studentContext(s);
      const id = (await start(examId)).json.data.attemptId as string;
      await submit(id, { changes: [{ q: ids[0], o, m: false, s: 1 }] });
      return { s, id };
    };
    const one = await answer('A');
    const two = await answer('A');
    const three = await answer('D');
    const rank = async (r: { s: { id: string }; id: string }) => {
      const result = await getAttemptResult(r.id, { id: r.s.id, accessState: 'active' });
      return result.kind === 'result' && result.result.rank.visible
        ? result.result.rank.position
        : 'hidden';
    };
    expect([await rank(one), await rank(two), await rank(three)]).toEqual([1, 1, 3]);

    // a late attempt (started after live end) is excluded from ranking by default
    const lateStudent = await makeStudent();
    await testDb
      .from('exams')
      .update({ live_ends_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', examId);
    authState.student = studentContext(lateStudent);
    const lateId = (await start(examId)).json.data.attemptId as string;
    await submit(lateId, { changes: [{ q: ids[0], o: 'A', m: false, s: 1 }] });
    const lateResult = await getAttemptResult(lateId, {
      id: lateStudent.id,
      accessState: 'active',
    });
    expect(lateResult.kind === 'result' && lateResult.result.rank).toMatchObject({
      visible: true,
      position: null,
      participants: 3,
      unrankedLate: true,
    });

    const progressing = await makeStudent();
    const { data: pid } = await testDb.rpc('start_attempt', {
      p_exam_id: examId,
      p_student_id: progressing.id,
    });
    expect(
      await getAttemptResult(pid as string, { id: progressing.id, accessState: 'active' }),
    ).toEqual({ kind: 'in_progress', attemptId: pid });
    expect(await getAttemptResult(one.id, { id: two.s.id, accessState: 'active' })).toEqual({
      kind: 'not_found',
    });

    const admin = await getExamResultsAdmin(examId);
    expect(admin?.table.map((r) => r.rank)).toEqual([1, 1, null, 3]); // late (null) sorted by score with ties
    expect(admin?.summary).toMatchObject({
      participants: 4,
      lateParticipants: 1,
      highest: 1,
      lowest: 0,
    });
    expect(admin?.analysis[0]?.position).toBe(2); // lowest % correct first
  });

  it('hidden for inactive students when results.visibleWhenInactive = false', async () => {
    authState.admin = admin;
    await settingsActions.updateSetting({ key: 'results', value: { visibleWhenInactive: false } });
    expect(
      await getAttemptResult(crypto.randomUUID(), {
        id: crypto.randomUUID(),
        accessState: 'expired',
      }),
    ).toEqual({ kind: 'hidden' });
    await settingsActions.updateSetting({ key: 'results', value: { visibleWhenInactive: true } });
  });
});

describe('sample exam (P2.23)', () => {
  it('paper has no answers; scoring is stateless and rate-limited', async () => {
    // Only one published sample may exist: park the seeded one, restore it in `finally`.
    const { data: parked } = await testDb
      .from('exams')
      .update({ status: 'archived' })
      .eq('is_sample', true)
      .eq('status', 'published')
      .select('id');
    const ids = bank.questions.map((q) => q.id) as [string, string, string, string];
    const sampleId = await makeExam({ questionIds: ids, isSample: true, negativeMark: 0.5 });
    try {
      const paper = await getSamplePaper();
      expect(paper?.questions).toHaveLength(4);
      expect(JSON.stringify(paper)).not.toMatch(/correct_?option|EXPLANATION-TOKEN/i);

      requestState.ip = `10.77.${Math.floor(Math.random() * 250)}.1`;
      const attemptsBefore = (
        await testDb.from('exam_attempts').select('id', { count: 'exact', head: true })
      ).count;
      const score = await call(
        sampleRoute(
          new Request(`${ORIGIN}/api/sample/score`, {
            method: 'POST',
            headers: { origin: ORIGIN },
            body: JSON.stringify({
              answers: { [ids[0]]: 'A', [ids[1]]: 'A', [crypto.randomUUID()]: 'A' },
            }),
          }),
        ),
      );
      expect(score.json.data).toMatchObject({
        score: 0.5,
        total: 4,
        correct: 1,
        incorrect: 1,
        skipped: 2,
      });
      expect(score.json.data.questions[0].explanationHtml).toContain('EXPLANATION-TOKEN');
      expect(
        (await testDb.from('exam_attempts').select('id', { count: 'exact', head: true })).count,
      ).toBe(attemptsBefore);

      for (let i = 0; i < 29; i += 1) {
        await sampleRoute(
          new Request(`${ORIGIN}/api/sample/score`, {
            method: 'POST',
            headers: { origin: ORIGIN },
            body: '{"answers":{}}',
          }),
        );
      }
      const limited = await sampleRoute(
        new Request(`${ORIGIN}/api/sample/score`, {
          method: 'POST',
          headers: { origin: ORIGIN },
          body: '{"answers":{}}',
        }),
      );
      expect(limited.status).toBe(429);
    } finally {
      await testDb.from('rate_limit_events').delete().eq('subject', requestState.ip);
      await testDb.from('exams').update({ status: 'archived' }).eq('id', sampleId);
      for (const exam of parked ?? [])
        await testDb.from('exams').update({ status: 'published' }).eq('id', exam.id);
    }
  });
});

describe('dashboards, CSV, settings, public reads (P2.02, P2.03, P2.24, P2.25)', () => {
  it('plan routine PDFs (R1.1 V2.20–V2.21, D6): required on create, replaceable, public', async () => {
    authState.admin = admin;
    const base = { nameBn: 'রুটিন', nameEn: 'Routine', durationDays: 30, fixedExpiresAt: null, priceBdt: 500 };
    const code = `r-${Date.now().toString(36)}`;
    expect(await settingsActions.upsertPlan({ ...base, code })).toMatchObject({
      ok: false, error: { code: 'ROUTINE_PDF_REQUIRED', field: 'routinePdfPath', message: 'errors.routinePdfRequired' },
    });
    expect(await settingsActions.upsertPlan({ ...base, code, routinePdfPath: `plans/${crypto.randomUUID()}.pdf` })).toMatchObject({
      ok: false, error: { code: 'VALIDATION', field: 'routinePdfPath' }, // not uploaded
    });
    expect(await settingsActions.upsertPlan({ ...base, code, routinePdfPath: 'elsewhere/x.pdf' })).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });

    const first = await uploadRoutinePdf();
    const created = await settingsActions.upsertPlan({ ...base, code, routinePdfPath: first });
    if (!created.ok) throw new Error(created.error.code);
    try {
      const publicPlan = (await getActivePlans()).find((p) => p.code === code);
      expect(publicPlan?.routine?.view).toContain(`/storage/v1/object/public/plan-routines/${first}`);
      expect(publicPlan?.routine?.download).toContain('download');
      const response = await fetch(publicPlan?.routine?.view ?? '');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');

      // Editing without a new file keeps the PDF; a new file replaces it and the old one is removed.
      ok(await settingsActions.upsertPlan({ ...base, id: created.data.id, code, priceBdt: 600 }));
      expect((await testDb.from('plans').select('routine_pdf_path').eq('id', created.data.id).single()).data?.routine_pdf_path).toBe(first);
      const second = await uploadRoutinePdf();
      ok(await settingsActions.upsertPlan({ ...base, id: created.data.id, code, routinePdfPath: second }));
      expect((await testDb.from('plans').select('routine_pdf_path').eq('id', created.data.id).single()).data?.routine_pdf_path).toBe(second);
      const remaining = (await testDb.storage.from('plan-routines').list('plans', { limit: 1000 })).data?.map((f) => `plans/${f.name}`) ?? [];
      expect(remaining).toContain(second);
      expect(remaining).not.toContain(first);

      // A legacy plan (created before R1.1, no PDF) can still be edited and stays public without a routine.
      await testDb.from('plans').update({ routine_pdf_path: null }).eq('id', created.data.id);
      ok(await settingsActions.upsertPlan({ ...base, id: created.data.id, code }));
      expect((await getActivePlans()).find((p) => p.code === code)?.routine).toBeNull();
      await testDb.storage.from('plan-routines').remove([second]);
    } finally {
      await testDb.from('plans').delete().eq('id', created.data.id);
    }
  });

  it('student dashboard stats and results list', async () => {
    const ids = bank.questions.slice(0, 2).map((q) => q.id) as [string, string];
    const examId = await makeExam({ questionIds: ids });
    const student = await makeStudent();
    authState.student = studentContext(student);
    const attemptId = (await start(examId)).json.data.attemptId as string;
    await submit(attemptId, { changes: [{ q: ids[0], o: 'A', m: false, s: 1 }] });

    const dash = await getStudentDashboard(student);
    expect(dash.stats).toMatchObject({ examsTaken: 1, averagePercent: 50, bestPercent: 50 });
    expect(dash.recentResults[0]).toMatchObject({ attemptId, score: 1, total: 2, percent: 50 });
    expect((await listStudentResults(student.id)).total).toBe(1);
  });

  it('admin overview and CSV export (UTF-8 BOM)', async () => {
    const overview = await getAdminOverview();
    expect(overview.students.total).toBeGreaterThanOrEqual(overview.students.active);
    expect(typeof overview.revenueThisMonth).toBe('number');

    const ids = bank.questions.slice(0, 1).map((q) => q.id) as [string];
    const examId = await makeExam({ questionIds: ids });
    const student = await makeStudent();
    await testDb.rpc('start_attempt', { p_exam_id: examId, p_student_id: student.id });
    const { data: attempt } = await testDb
      .from('exam_attempts')
      .select('id')
      .eq('exam_id', examId)
      .single();
    await testDb.rpc('submit_attempt', {
      p_attempt_id: attempt?.id ?? '',
      p_student_id: student.id,
      p_changes: [],
      p_auto: false,
    });

    authState.admin = admin;
    const response = await csvRoute(new Request(`${ORIGIN}/x`), params('examId', examId));
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain(
      'rank,mobile,label,score,total,correct,incorrect,skipped,late,submitted_at',
    );
    expect(text).toContain(`1,${student.mobile},,0,1,0,0,1,no,`);
  });

  it('settings: per-key validation, public visibility, plans, accounts, integrations', async () => {
    authState.admin = admin;
    const before = await getAllSettings();
    expect(
      await settingsActions.updateSetting({ key: 'auth', value: { maxDevices: 3 } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(
      (
        await settingsActions.updateSetting({
          key: 'brand',
          value: { name: 'Test Brand', logoPath: null },
        })
      ).ok,
    ).toBe(true);
    expect((await getPublicSettings()).brand.name).toBe('Test Brand'); // anon can read public keys
    await settingsActions.updateSetting({ key: 'brand', value: before.brand });

    const code = `t-${Date.now().toString(36)}`;
    const plan = await settingsActions.upsertPlan({
      code,
      nameBn: 'টেস্ট',
      nameEn: 'Test',
      durationDays: 7,
      fixedExpiresAt: null,
      priceBdt: 99,
      routinePdfPath: await uploadRoutinePdf(),
    });
    if (!plan.ok) throw new Error(plan.error.code);
    expect((await getActivePlans()).map((p) => p.code)).toContain(code);
    expect(
      await settingsActions.upsertPlan({
        code,
        nameBn: 'x',
        nameEn: 'x',
        durationDays: 7,
        fixedExpiresAt: null,
        priceBdt: 1,
        routinePdfPath: await uploadRoutinePdf(),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', field: 'code' },
    });
    expect((await settingsActions.deletePlan({ id: plan.data.id })).ok).toBe(true);
    expect((await getActivePlans()).map((p) => p.code)).not.toContain(code);
    await testDb.from('plans').delete().eq('id', plan.data.id);

    const account = await settingsActions.upsertPaymentAccount({
      method: 'bank',
      accountNumber: '1234567890',
      accountLabel: 'Test Bank',
      isActive: false,
    });
    if (!account.ok) throw new Error(account.error.code);
    expect((await getPaymentAccounts()).map((a) => a.id)).not.toContain(account.data.id); // inactive hidden from anon
    await testDb.from('payment_accounts').delete().eq('id', account.data.id);

    const failedKey = `test:failed:${crypto.randomUUID()}`;
    await testDb
      .from('outbox')
      .insert({
        kind: 'sheet_result_append',
        payload: {},
        status: 'failed',
        dedupe_key: failedKey,
      });
    expect((await getIntegrationsStatus()).failedCount).toBeGreaterThanOrEqual(1);
    const retry = await settingsActions.retryFailedOutbox({});
    expect(retry.ok && retry.data.requeued).toBeGreaterThanOrEqual(1);
    await testDb.from('outbox').delete().eq('dedupe_key', failedKey);
  });

  it('public queries: routine groups by Dhaka date and hides drafts/samples', async () => {
    const q = bank.questions[0]?.id as string;
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    const published = await makeExam({
      questionIds: [q],
      startsAt,
      liveEndsAt: new Date(startsAt.getTime() + 30 * MIN),
    });
    const draft = await makeExam({
      questionIds: [q],
      status: 'draft',
      startsAt,
      liveEndsAt: new Date(startsAt.getTime() + 30 * MIN),
    });
    const routine = await getRoutine();
    const all = routine.upcoming.flatMap((d) => d.exams.map((e) => e.id));
    expect(all).toContain(published);
    expect(all).not.toContain(draft);
    expect(routine.upcoming.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
    expect(await getNextExam()).not.toBeNull();
  });
});
