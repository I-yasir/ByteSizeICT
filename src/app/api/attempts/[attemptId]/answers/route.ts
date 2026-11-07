import { ServiceError } from '@/lib/actions';
import { withStudentRoute } from '@/features/attempts/route-helpers';
import { saveAnswersSchema } from '@/features/attempts/schemas';
import { saveAnswers } from '@/features/attempts/service';

/** PUT /api/attempts/:attemptId/answers → { applied, serverNow } (TRD §7.1, §8.3). */
export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return withStudentRoute(request, attemptId, { mutating: true, requireActive: true }, ({ id, student, body }) => {
    const parsed = saveAnswersSchema.safeParse(body);
    if (!parsed.success) throw new ServiceError('VALIDATION');
    return saveAnswers(id, student.student.id, parsed.data.changes, parsed.data.lastQuestionIndex);
  });
}
