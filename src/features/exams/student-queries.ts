import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Student-facing exam lists (docs/02_AppFlow.md §3.5, §5.2–5.3). */
export type CardStatus = 'completed' | 'in_progress' | 'locked' | 'upcoming' | 'live' | 'missed_available' | 'missed';

export type ExamCard = {
  examId: string;
  title: string;
  chapterLabel: string | null;
  startsAt: string;
  liveEndsAt: string;
  lateUntil: string | null;
  accessMode: 'fixed' | 'window' | 'always';
  durationMinutes: number;
  questionCount: number;
  totalMarks: number;
  negativeMark: number;
  phase: string;
  status: CardStatus;
  attemptId: string | null;
  attemptStatus: 'in_progress' | 'submitted' | 'auto_submitted' | null;
  score: number | null;
  isLate: boolean | null;
};

const SORT_RANK: Record<CardStatus, number> = {
  in_progress: 0, live: 1, missed_available: 2, upcoming: 3, locked: 4, completed: 5, missed: 6,
};

/** All published exams assigned to the student, sorted as on /exams (live, missed-available, upcoming…). */
export async function getStudentExamCards(studentId: string): Promise<ExamCard[]> {
  const rows = unwrap(await supabaseAdmin.rpc('student_exam_cards', { p_student_id: studentId }));
  const cards: ExamCard[] = rows.map((row) => ({
    examId: row.exam_id,
    title: row.title,
    chapterLabel: row.chapter_label,
    startsAt: row.starts_at,
    liveEndsAt: row.live_ends_at,
    lateUntil: row.late_until,
    accessMode: row.access_mode,
    durationMinutes: row.duration_minutes,
    questionCount: row.question_count,
    totalMarks: Number(row.total_marks),
    negativeMark: Number(row.negative_mark),
    phase: row.phase,
    status: row.card_status as CardStatus,
    attemptId: row.attempt_id,
    attemptStatus: row.attempt_status,
    score: row.score === null ? null : Number(row.score),
    isLate: row.is_late,
  }));
  return cards.sort((a, b) => {
    const rank = SORT_RANK[a.status] - SORT_RANK[b.status];
    if (rank !== 0) return rank;
    const time = Date.parse(a.startsAt) - Date.parse(b.startsAt);
    // upcoming ascending; completed/missed most recent first
    return a.status === 'completed' || a.status === 'missed' ? -time : time;
  });
}

/** /exams/[examId] lobby. `null` when the exam is not visible to the student (unassigned/unpublished). */
export async function getExamLobby(examId: string, studentId: string) {
  const card = (await getStudentExamCards(studentId)).find((c) => c.examId === examId);
  if (!card) return null;
  const exam = unwrapMaybe(
    await supabaseAdmin
      .from('exams')
      .select('description, marks_per_question, rank_late_attempts, allow_mark_for_review')
      .eq('id', examId)
      .maybeSingle(),
  );
  if (!exam) return null;
  return {
    ...card,
    description: exam.description,
    marksPerQuestion: Number(exam.marks_per_question),
    rankLateAttempts: exam.rank_late_attempts,
    allowMarkForReview: exam.allow_mark_for_review,
    /** A late attempt started now would be unranked. */
    lateAttemptUnranked: card.status === 'missed_available' && !exam.rank_late_attempts,
  };
}
