import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { OutboxKind } from './enqueue';
import { createHandlers, type OutboxHandler } from './handlers';

const SHEET_KINDS: OutboxKind[] = ['sheet_admission_append', 'sheet_admission_update', 'sheet_student_upsert', 'sheet_result_append'];
const EMAIL_KINDS: OutboxKind[] = ['email_renewal', 'email_rejection', 'email_admin_alert'];

export type DrainResult = { processed: number; failed: number };

/**
 * Claims due jobs (FOR UPDATE SKIP LOCKED) and runs them. Sheet jobs run one at a time in id order
 * so upserts never race (TRD §9.2); emails also run sequentially to stay well inside rate limits.
 */
export async function drainOutbox(
  options: { limit?: number; handlers?: Partial<Record<OutboxKind, OutboxHandler>> } = {},
): Promise<DrainResult> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const handlers = { ...createHandlers(), ...options.handlers };
  const result: DrainResult = { processed: 0, failed: 0 };

  for (const kinds of [EMAIL_KINDS, SHEET_KINDS]) {
    const { data: jobs, error } = await supabaseAdmin.rpc('claim_outbox', { p_limit: limit, p_kinds: kinds });
    if (error) throw error;

    for (const job of [...(jobs ?? [])].sort((a, b) => a.id - b.id)) {
      let ok = true;
      let message: string | undefined;
      try {
        await handlers[job.kind](job.payload);
      } catch (error) {
        ok = false;
        message = error instanceof Error ? error.message : String(error);
      }
      const { error: completeError } = await supabaseAdmin.rpc('complete_outbox', {
        p_id: job.id,
        p_ok: ok,
        ...(message ? { p_error: message } : {}),
      });
      if (completeError) throw completeError;
      result.processed += 1;
      if (!ok) result.failed += 1;
    }
  }
  return result;
}
