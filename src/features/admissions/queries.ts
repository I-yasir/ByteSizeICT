import 'server-only';
import { unwrap, unwrapMaybe } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { escapeLike, type Paged, pageRange, sanitizeSearch } from '@/lib/validation';
import { type AdmissionFilter, admissionFilterSchema } from './schemas';

/** Admissions queue + drawer (docs/02_AppFlow.md §6.3). */
const LIST_COLUMNS =
  'id, kind, mobile, email, payment_method, trx_id, amount_bdt, status, duplicate_flags, reject_reason, created_at, reviewed_at, student_id, plan:plans(id, code, name_en, name_bn, duration_days, fixed_expires_at, price_bdt)';

export async function listAdmissions(filter: AdmissionFilter = {}) {
  const f = admissionFilterSchema.parse(filter);
  let query = supabaseAdmin
    .from('admissions')
    .select(LIST_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: f.status === 'pending' })
    .range(...pageRange(f));
  if (f.status !== 'all') query = query.eq('status', f.status);
  if (f.method) query = query.eq('payment_method', f.method);
  if (f.from) query = query.gte('created_at', f.from);
  if (f.to) query = query.lt('created_at', f.to);
  const q = sanitizeSearch(f.q);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    query = query.or(`mobile.ilike.${like},email.ilike.${like},trx_id_normalized.ilike.%${escapeLike(q.replace(/[\s-]/g, '').toUpperCase())}%`);
  }
  const { data, count, error } = await query;
  const items = unwrap({ data, error });
  return { items, total: count ?? 0, page: f.page, pageSize: f.pageSize } satisfies Paged<(typeof items)[number]>;
}
export type AdmissionListItem = Awaited<ReturnType<typeof listAdmissions>>['items'][number];

export async function getAdmissionDetail(id: string) {
  const admission = unwrapMaybe(
    await supabaseAdmin.from('admissions').select(`${LIST_COLUMNS}, review_note, reviewed_by_admin:admins(email)`).eq('id', id).maybeSingle(),
  );
  if (!admission) return null;
  const [history, student] = await Promise.all([
    supabaseAdmin
      .from('admissions')
      .select('id, kind, status, trx_id, amount_bdt, payment_method, created_at, reviewed_at')
      .eq('mobile', admission.mobile)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .then(unwrap),
    supabaseAdmin
      .from('students')
      .select('id, mobile, email, status, access_starts_at, access_expires_at')
      .eq('mobile', admission.mobile)
      .maybeSingle()
      .then(unwrapMaybe),
  ]);
  return { admission, history, existingStudent: student };
}

export async function countPendingAdmissions(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('admissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw error;
  return count ?? 0;
}
