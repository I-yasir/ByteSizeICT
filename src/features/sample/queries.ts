import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Cheap existence check for the homepage "Try a Free Sample Exam" button. */
export async function hasSampleExam(): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from('exams')
    .select('id', { count: 'exact', head: true })
    .eq('is_sample', true)
    .eq('status', 'published')
    .gt('question_count', 0);
  if (error) throw error;
  return (count ?? 0) > 0;
}
