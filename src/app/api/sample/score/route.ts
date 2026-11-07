import { scoreSample, sampleScoreSchema } from '@/features/sample/service';
import { run } from '@/lib/actions';
import { fail, getRequestContext, isAllowedOrigin, jsonResult } from '@/lib/http';

/** POST /api/sample/score — public, stateless sample scoring (docs/02_AppFlow.md §4.5). */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get('origin'))) return jsonResult(fail('FORBIDDEN'));
  const text = await request.text();
  if (text.length > 32 * 1024) return jsonResult(fail('VALIDATION'));
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return jsonResult(fail('VALIDATION'));
  }
  const parsed = sampleScoreSchema.safeParse(body);
  if (!parsed.success) return jsonResult(fail('VALIDATION'));
  const { ip } = await getRequestContext();
  return jsonResult(await run('sample.score', () => scoreSample(parsed.data.answers, ip)));
}
