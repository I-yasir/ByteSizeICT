import { withStudentRoute } from '@/features/attempts/route-helpers';
import { startAttempt } from '@/features/attempts/service';

/** POST /api/exams/:examId/start → { attemptId } (idempotent; TRD §7.1). */
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return withStudentRoute(request, examId, { mutating: true, requireActive: true }, ({ id, student }) =>
    startAttempt(id, student.student.id),
  );
}
