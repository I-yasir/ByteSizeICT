import 'server-only';
import { check } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/**
 * App-side audit writes for actions not already audited inside a SQL function (docs/05_Schema.md §6).
 * Canonical action names only.
 */
export type AuditAction =
  | 'student.force_logout'
  | 'student.update'
  | 'student.credentials_email_failed'
  | 'exam.create'
  | 'exam.publish'
  | 'exam.unpublish'
  | 'exam.archive'
  | 'question.import'
  | 'setting.update'
  | 'plan.upsert'
  | 'payment_account.upsert';

export type AuditEntity = 'admission' | 'student' | 'exam' | 'question' | 'setting' | 'plan' | 'payment_account' | 'session';

export async function logAdminAudit(input: {
  adminId: string | null;
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  before?: Json | null;
  after?: Json | null;
  meta?: Json;
}): Promise<void> {
  check(
    await supabaseAdmin.rpc('log_audit', {
      p_actor: input.adminId ? 'admin' : 'system',
      p_action: input.action,
      p_entity_type: input.entityType,
      ...(input.entityId ? { p_entity_id: input.entityId } : {}),
      ...(input.adminId ? { p_admin: input.adminId } : {}),
      ...(input.before != null ? { p_before: input.before } : {}),
      ...(input.after != null ? { p_after: input.after } : {}),
      ...(input.meta ? { p_meta: input.meta } : {}),
    }),
  );
}
