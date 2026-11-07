import 'server-only';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Database, Json } from '@/types/database';

export type OutboxKind = Database['public']['Enums']['outbox_kind'];

/** Adds a job (TRD ADR-05). Payloads hold ids only — never PINs, passwords or tokens. */
export async function enqueue(kind: OutboxKind, payload: Json, dedupeKey?: string): Promise<void> {
  const { error } = dedupeKey
    ? await supabaseAdmin
        .from('outbox')
        .upsert({ kind, payload, dedupe_key: dedupeKey }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    : await supabaseAdmin.from('outbox').insert({ kind, payload });
  if (error) throw error;
}

/**
 * Drains a few jobs after the response is sent. pg_cron (`kick_outbox`) is the safety net, so a
 * failure here only delays delivery.
 */
export function kickOutbox(): void {
  after(async () => {
    try {
      const { drainOutbox } = await import('./drain');
      await drainOutbox({ limit: 10 });
    } catch (error) {
      // PostgREST errors are plain objects, so String() would print "[object Object]".
      const detail = error instanceof Error ? error.message : JSON.stringify(error);
      console.error(JSON.stringify({ level: 'error', event: 'outbox.kick_failed', error: detail }));
    }
  });
}
