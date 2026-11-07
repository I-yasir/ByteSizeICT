import 'server-only';
import { type ExamCard, getStudentExamCards } from '@/features/exams/student-queries';
import { listStudentResults } from '@/features/results/queries';
import { unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { addDays, startOfDhakaDay, startOfDhakaMonth } from '@/lib/time';

/** Student dashboard (docs/02_AppFlow.md §5.2) and admin overview (§6.2). */

/**
 * Current streak: consecutive closed live windows (newest first) the student attempted on time,
 * counting only exams that started after the student's access began.
 */
export function computeStreak(cards: ExamCard[], accessStartsAt: string, now = new Date()): number {
  const windows = cards
    .filter((c) => Date.parse(c.liveEndsAt) <= now.getTime() && Date.parse(c.startsAt) >= Date.parse(accessStartsAt))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  let streak = 0;
  for (const card of windows) {
    if (card.attemptId && card.isLate === false && card.attemptStatus !== 'in_progress') streak += 1;
    else break;
  }
  return streak;
}

export async function getStudentDashboard(student: { id: string; access_starts_at: string }, now = new Date()) {
  const [cards, recent, finals] = await Promise.all([
    getStudentExamCards(student.id),
    listStudentResults(student.id, { pageSize: 5 }),
    supabaseAdmin
      .from('exam_attempts')
      .select('score, question_order, exam:exams(marks_per_question)')
      .eq('student_id', student.id)
      .neq('status', 'in_progress')
      .then(unwrap),
  ]);
  const percents = finals
    .map((a) => {
      const total = a.question_order.length * Number(a.exam?.marks_per_question ?? 0);
      return total > 0 ? (Number(a.score) / total) * 100 : null;
    })
    .filter((value): value is number => value !== null);
  const round1 = (value: number) => Math.round(value * 10) / 10;

  const primary =
    cards.find((c) => c.status === 'in_progress') ??
    cards.find((c) => c.status === 'live') ??
    cards.find((c) => c.status === 'missed_available') ??
    cards.find((c) => c.status === 'upcoming') ??
    null;

  return {
    primary,
    upcoming: cards.filter((c) => c.status === 'upcoming').slice(0, 5),
    missed: cards.filter(
      (c) => (c.status === 'missed' || c.status === 'missed_available') && Date.parse(c.liveEndsAt) >= addDays(now, -14).getTime(),
    ),
    stats: {
      examsTaken: finals.length,
      averagePercent: percents.length ? round1(percents.reduce((a, b) => a + b, 0) / percents.length) : null,
      bestPercent: percents.length ? round1(Math.max(...percents)) : null,
      streak: computeStreak(cards, student.access_starts_at, now),
    },
    recentResults: recent.items,
  };
}

export async function getAdminOverview(now = new Date()) {
  const iso = now.toISOString();
  const count = async (build: () => PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await build();
    if (error) throw error;
    return n ?? 0;
  };
  const students = () => supabaseAdmin.from('students').select('id', { count: 'exact', head: true });
  const today = startOfDhakaDay(now);

  const [total, active, expired, cancelled, suspended, pending, revenueRows, examsThisWeek, upcoming, activity] = await Promise.all([
    count(() => students()),
    count(() => students().eq('status', 'active').lte('access_starts_at', iso).gt('access_expires_at', iso)),
    count(() => students().eq('status', 'active').or(`access_expires_at.lte.${iso},access_starts_at.gt.${iso}`)),
    count(() => students().eq('status', 'cancelled')),
    count(() => students().eq('status', 'suspended')),
    count(() => supabaseAdmin.from('admissions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    supabaseAdmin
      .from('admissions')
      .select('amount_bdt')
      .eq('status', 'approved')
      .gte('reviewed_at', startOfDhakaMonth(now).toISOString())
      .then(unwrap),
    // "this week" = the next 7 days starting today (Dhaka)
    count(() =>
      supabaseAdmin
        .from('exams')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('is_sample', false)
        .gte('starts_at', today.toISOString())
        .lt('starts_at', addDays(today, 7).toISOString()),
    ),
    supabaseAdmin
      .from('exams')
      .select('id, title, starts_at, question_count')
      .eq('status', 'published')
      .eq('is_sample', false)
      .gt('starts_at', iso)
      .order('starts_at')
      .limit(5)
      .then(unwrap),
    supabaseAdmin
      .from('audit_log')
      .select('id, created_at, actor_type, action, entity_type, entity_id, admin:admins(email)')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(unwrap),
  ]);

  return {
    students: { total, active, expired, cancelled, suspended },
    pendingAdmissions: pending,
    revenueThisMonth: revenueRows.reduce((sum, row) => sum + (row.amount_bdt ?? 0), 0),
    examsThisWeek,
    upcomingExams: upcoming,
    recentActivity: activity,
  };
}
