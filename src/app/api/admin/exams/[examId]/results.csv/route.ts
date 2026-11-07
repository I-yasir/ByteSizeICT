import { buildResultsCsv, getExamResultsAdmin } from '@/features/results/admin';
import { getAdminAuth } from '@/lib/auth/guards';
import { fail, jsonResult } from '@/lib/http';
import { uuidSchema } from '@/lib/validation';

/** GET /api/admin/exams/:examId/results.csv (PRD A-12; R1 exports CSV only). */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const auth = await getAdminAuth();
  if (!auth.ok) return jsonResult(fail(auth.code));
  const id = uuidSchema.safeParse((await params).examId);
  if (!id.success) return jsonResult(fail('NOT_FOUND'));

  const data = await getExamResultsAdmin(id.data);
  if (!data) return jsonResult(fail('NOT_FOUND'));
  return new Response(buildResultsCsv(data), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="exam-${id.data}-results.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
