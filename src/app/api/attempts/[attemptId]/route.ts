import { withStudentRoute } from '@/features/attempts/route-helpers';
import { getAttemptSession } from '@/features/attempts/service';

/** GET /api/attempts/:attemptId → AttemptSession (resume payload; TRD §7.1). */
export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return withStudentRoute(request, attemptId, { mutating: false, requireActive: true }, ({ id, student }) =>
    getAttemptSession(id, student.student.id),
  );
}
