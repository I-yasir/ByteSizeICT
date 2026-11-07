import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { computeAccessState } from '@/lib/auth/access';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { escapeLike, type Paged, pageRange, sanitizeSearch } from '@/lib/validation';
import { type StudentFilter, studentFilterSchema } from './schemas';

/** /admin/students list and profile (docs/02_AppFlow.md §6.4). */
const LIST_COLUMNS =
  'id, mobile, email, status, access_starts_at, access_expires_at, admin_label, last_login_at, credentials_status, created_at, plan:plans(name_en, name_bn)';

export async function listStudents(filter: StudentFilter = {}, now = new Date()) {
  const f = studentFilterSchema.parse(filter);
  const iso = now.toISOString();
  let query = supabaseAdmin
    .from('students')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(...pageRange(f));

  // Derived access state as SQL filters (mirrors student_access_state()).
  if (f.state === 'suspended' || f.state === 'cancelled') query = query.eq('status', f.state);
  if (f.state === 'active') query = query.eq('status', 'active').lte('access_starts_at', iso).gt('access_expires_at', iso);
  if (f.state === 'expired') query = query.eq('status', 'active').or(`access_expires_at.lte.${iso},access_starts_at.gt.${iso}`);
  if (f.label) query = query.eq('admin_label', f.label);
  const q = sanitizeSearch(f.q);
  if (q) query = query.or(`mobile.ilike.%${escapeLike(q)}%,email.ilike.%${escapeLike(q)}%`);

  const { data, count, error } = await query;
  const rows = unwrap({ data, error });

  const ids = rows.map((row) => row.id);
  const taken = new Map<string, number>();
  if (ids.length > 0) {
    const attempts = unwrap(
      await supabaseAdmin.from('exam_attempts').select('student_id').in('student_id', ids).neq('status', 'in_progress'),
    );
    for (const attempt of attempts) taken.set(attempt.student_id, (taken.get(attempt.student_id) ?? 0) + 1);
  }

  return {
    items: rows.map((row) => ({ ...row, accessState: computeAccessState(row, now), examsTaken: taken.get(row.id) ?? 0 })),
    total: count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  } satisfies Paged<unknown>;
}

export async function listStudentLabels(): Promise<string[]> {
  const rows = unwrap(await supabaseAdmin.from('students').select('admin_label').not('admin_label', 'is', null));
  return [...new Set(rows.map((row) => row.admin_label as string))].sort();
}

export async function getStudentProfile(studentId: string) {
  const student = unwrapMaybe(
    await supabaseAdmin
      .from('students')
      .select(`${LIST_COLUMNS}, must_change_pin, credentials_sent_at, admin_note, status_reason, status_changed_at, plan_id`)
      .eq('id', studentId)
      .maybeSingle(),
  );
  if (!student) return null;

  const [payments, attempts, audit] = await Promise.all([
    supabaseAdmin
      .from('admissions')
      .select('id, kind, status, payment_method, trx_id, amount_bdt, created_at, reviewed_at, reject_reason, plan:plans(name_en)')
      .eq('mobile', student.mobile)
      .order('created_at', { ascending: false })
      .then(unwrap),
    supabaseAdmin
      .from('exam_attempts')
      .select('id, status, score, correct_count, incorrect_count, skipped_count, is_late, started_at, submitted_at, exam:exams(id, title, question_count, marks_per_question)')
      .eq('student_id', studentId)
      .order('started_at', { ascending: false })
      .then(unwrap),
    supabaseAdmin
      .from('audit_log')
      .select('id, created_at, actor_type, action, before, after, meta, admin:admins(email)')
      .eq('entity_type', 'student')
      .eq('entity_id', studentId)
      .order('created_at', { ascending: false })
      .limit(100)
      .then(unwrap),
  ]);

  return {
    student: { ...student, accessState: computeAccessState(student) },
    payments,
    attempts: attempts.map((attempt) => ({
      ...attempt,
      totalMarks: (attempt.exam?.question_count ?? 0) * Number(attempt.exam?.marks_per_question ?? 0),
    })),
    audit,
  };
}

/** Plan names for the student's own profile. */
export async function getStudentPlanName(planId: string | null) {
  if (!planId) return null;
  return unwrapMaybe(await supabaseAdmin.from('plans').select('name_bn, name_en').eq('id', planId).maybeSingle());
}
