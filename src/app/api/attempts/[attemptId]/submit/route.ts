import { ServiceError } from '@/lib/actions';
import { withStudentRoute } from '@/features/attempts/route-helpers';
import { submitAttemptSchema } from '@/features/attempts/schemas';
import { submitAttempt } from '@/features/attempts/service';

/**
 * POST /api/attempts/:attemptId/submit → { resultUrl } (TRD §7.1, §8.4). Does not require an active
 * subscription, so a student cancelled mid-exam still gets their in-flight answers counted.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return withStudentRoute(request, attemptId, { mutating: true, requireActive: false }, ({ id, student, body }) => {
    const parsed = submitAttemptSchema.safeParse(body);
    if (!parsed.success) throw new ServiceError('VALIDATION');
    return submitAttempt(id, student.student.id, parsed.data.changes, parsed.data.auto);
  });
}
