import 'server-only';
import { z } from 'zod';
import { unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { type Paged, pageRange, paginationSchema, uuidSchema } from '@/lib/validation';

/** /admin/audit (docs/02_AppFlow.md §6.12). */
export const auditFilterSchema = paginationSchema.extend({
  action: z.string().max(60).optional(),
  actorAdminId: uuidSchema.optional(),
  entityType: z.enum(['admission', 'student', 'exam', 'question', 'setting', 'plan', 'payment_account', 'session']).optional(),
  entityId: z.string().max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditFilter = z.input<typeof auditFilterSchema>;

export type AuditEntry = {
  id: number;
  createdAt: string;
  actorType: 'admin' | 'student' | 'system';
  actorLabel: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  meta: unknown;
};

export async function listAuditLog(filter: AuditFilter = {}): Promise<Paged<AuditEntry>> {
  const f = auditFilterSchema.parse(filter);
  let query = supabaseAdmin
    .from('audit_log')
    .select(
      'id, created_at, actor_type, action, entity_type, entity_id, before, after, meta, admin:admins(email), student:students(mobile)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(...pageRange(f));
  if (f.action) query = query.eq('action', f.action);
  if (f.actorAdminId) query = query.eq('actor_admin_id', f.actorAdminId);
  if (f.entityType) query = query.eq('entity_type', f.entityType);
  if (f.entityId) query = query.eq('entity_id', f.entityId);
  if (f.from) query = query.gte('created_at', f.from);
  if (f.to) query = query.lt('created_at', f.to);

  const { data, count, error } = await query;
  const rows = unwrap({ data, error });
  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      actorType: row.actor_type,
      actorLabel: row.admin?.email ?? row.student?.mobile ?? null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before: row.before,
      after: row.after,
      meta: row.meta,
    })),
    total: count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  };
}
