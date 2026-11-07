import { jsonResult, ok } from '@/lib/http';

/** Server clock for client offset calculations (TRD §7.1). `jsonResult` sets `Cache-Control: no-store`. */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return jsonResult(ok({ serverNow: new Date().toISOString() }));
}
