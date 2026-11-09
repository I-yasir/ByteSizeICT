import { timingSafeEqual } from 'node:crypto';
import { cleanupStaleImports } from '@/features/questions/import';
import { env } from '@/lib/env';
import { fail, jsonResult, ok } from '@/lib/http';

/** Called by pg_cron via pg_net (`kick_import_cleanup`). Authenticated only by `x-cron-secret`; cookies ignored. */
export const dynamic = 'force-dynamic';

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-cron-secret'))) return jsonResult(fail('UNAUTHENTICATED'));
  return jsonResult(ok(await cleanupStaleImports()));
}
