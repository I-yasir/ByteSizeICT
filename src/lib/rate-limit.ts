import 'server-only';
import { MINUTE_MS } from '@/lib/auth/constants';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** Buckets and limits from TRD §6.3, backed by `rate_limit_events`. */
export const RATE_LIMITS = {
  login_fail_mobile: { limit: 5, windowMs: 15 * MINUTE_MS },
  login_ip: { limit: 20, windowMs: 10 * MINUTE_MS },
  admin_login_fail: { limit: 5, windowMs: 15 * MINUTE_MS },
  admin_login_ip: { limit: 20, windowMs: 10 * MINUTE_MS },
  enroll_ip: { limit: 5, windowMs: 60 * MINUTE_MS },
  sample_ip: { limit: 30, windowMs: 60 * MINUTE_MS },
} as const;
export type RateBucket = keyof typeof RATE_LIMITS;

export type LimitStatus = { limited: boolean; count: number; retryAt: Date | null };

/**
 * Counts events in the bucket's window. When the limit is reached, `retryAt` is when the oldest of
 * the newest `limit` events leaves the window.
 */
export async function checkLimit(bucket: RateBucket, subject: string, now = new Date()): Promise<LimitStatus> {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const { data, error } = await supabaseAdmin
    .from('rate_limit_events')
    .select('created_at')
    .eq('bucket', bucket)
    .eq('subject', subject)
    .gte('created_at', new Date(now.getTime() - windowMs).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const count = data.length;
  const oldest = data[limit - 1];
  return {
    limited: count >= limit,
    count,
    retryAt: count >= limit && oldest ? new Date(Date.parse(oldest.created_at) + windowMs) : null,
  };
}

export async function recordHit(bucket: RateBucket, subject: string): Promise<void> {
  const { error } = await supabaseAdmin.from('rate_limit_events').insert({ bucket, subject });
  if (error) throw error;
}

export async function clearHits(bucket: RateBucket, subject: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('rate_limit_events')
    .delete()
    .eq('bucket', bucket)
    .eq('subject', subject);
  if (error) throw error;
}

/** Throttle helper for IP buckets: rejects when already limited, otherwise records this hit. */
export async function consume(bucket: RateBucket, subject: string): Promise<LimitStatus> {
  const status = await checkLimit(bucket, subject);
  if (!status.limited) await recordHit(bucket, subject);
  return status;
}
