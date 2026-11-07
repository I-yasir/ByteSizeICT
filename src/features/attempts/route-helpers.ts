import 'server-only';
import { toFailure } from '@/lib/actions';
import { getStudentAuth, type StudentContext } from '@/lib/auth/guards';
import { type ActionResult, fail, isAllowedOrigin, jsonResult } from '@/lib/http';
import { uuidSchema } from '@/lib/validation';
import { MAX_RUNTIME_BODY_BYTES } from './schemas';

/** Shared guard/parse plumbing for the exam runtime Route Handlers (TRD §6.4, §7.1). */
type Options = { mutating: boolean; requireActive: boolean };

export async function withStudentRoute<T>(
  request: Request,
  rawId: string,
  options: Options,
  handler: (ctx: { id: string; student: StudentContext; body: unknown }) => Promise<T>,
): Promise<Response> {
  if (options.mutating && !isAllowedOrigin(request.headers.get('origin'))) return jsonResult(fail('FORBIDDEN'));

  const auth = await getStudentAuth();
  if (!auth.ok) return jsonResult(fail(auth.code));
  const student = auth.context;
  if (student.student.must_change_pin) return jsonResult(fail('FORBIDDEN'));
  if (options.requireActive && student.accessState !== 'active') return jsonResult(fail('ACCESS_INACTIVE'));

  const id = uuidSchema.safeParse(rawId);
  if (!id.success) return jsonResult(fail('NOT_FOUND'));

  let body: unknown = undefined;
  if (options.mutating) {
    const text = await request.text();
    if (text.length > MAX_RUNTIME_BODY_BYTES) return jsonResult(fail('VALIDATION'));
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return jsonResult(fail('VALIDATION'));
    }
  }

  let result: ActionResult<T>;
  try {
    result = { ok: true, data: await handler({ id: id.data, student, body }) };
  } catch (error) {
    result = toFailure<T>(error, `route:${new URL(request.url).pathname}`);
  }
  return jsonResult(result);
}
