import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { fail, jsonResult, ok } from '@/lib/http';
import { devMailbox } from '@/lib/email/send';

/**
 * E2E-only read of the dev mailbox (P4.01). Exists only while email is not configured
 * (no RESEND_API_KEY) and never on Vercel production; additionally requires `x-cron-secret`.
 */
export const dynamic = 'force-dynamic';

function secretMatches(provided: string | null): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (env.RESEND_API_KEY || env.VERCEL_ENV === 'production') return jsonResult(fail('NOT_FOUND'));
  if (!secretMatches(request.headers.get('x-cron-secret'))) return jsonResult(fail('UNAUTHENTICATED'));
  const to = new URL(request.url).searchParams.get('to')?.toLowerCase();
  const mails = to ? devMailbox.filter((m) => m.to.toLowerCase() === to) : devMailbox;
  return jsonResult(ok(mails.map(({ to: recipient, subject, text, at }) => ({ to: recipient, subject, text, at }))));
}
