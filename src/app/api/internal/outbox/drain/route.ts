import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/lib/env';
import { fail, jsonResult, ok } from '@/lib/http';
import { drainOutbox } from '@/lib/outbox/drain';

/** Called by pg_cron via pg_net (`kick_outbox`). Authenticated only by `x-cron-secret`; cookies ignored. */
export const dynamic = 'force-dynamic';

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const bodySchema = z.object({ limit: z.number().int().min(1).max(50).optional() }).catch({});

export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-cron-secret'))) return jsonResult(fail('UNAUTHENTICATED'));
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  return jsonResult(ok(await drainOutbox({ limit: body.limit ?? 25 })));
}
