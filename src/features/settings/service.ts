import 'server-only';
import type { z } from 'zod';
import { logAdminAudit } from '@/features/audit/log';
import { check, ServiceError, unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLAN_ROUTINES_BUCKET, PUBLIC_ASSETS_BUCKET } from '@/lib/supabase/storage';
import type { Json } from '@/types/database';
import {
  PUBLIC_SETTING_KEYS,
  type SettingKey,
  settingSchemas,
  type paymentAccountSchema,
  type planSchema,
} from './schemas';

/** Settings writes (docs/02_AppFlow.md §6.11). */
export async function updateSetting(adminId: string, key: SettingKey, raw: unknown): Promise<{ key: SettingKey }> {
  const parsed = settingSchemas[key].safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError('VALIDATION', { field: `value.${parsed.error.issues[0]?.path.join('.') ?? ''}` });
  }
  const value = parsed.data as Json;
  check(
    await supabaseAdmin
      .from('app_settings')
      .upsert({ key, value, is_public: PUBLIC_SETTING_KEYS.includes(key), updated_by: adminId }, { onConflict: 'key' }),
  );
  await logAdminAudit({ adminId, action: 'setting.update', entityType: 'setting', entityId: key, after: value });
  return { key };
}

/** The browser uploads the PDF itself; only accept a path that really exists in the bucket. */
async function assertRoutineUploaded(path: string) {
  const name = path.slice('plans/'.length);
  const files = unwrap(await supabaseAdmin.storage.from(PLAN_ROUTINES_BUCKET).list('plans', { search: name, limit: 1 }));
  if (!files.some((file) => file.name === name)) throw new ServiceError('VALIDATION', { field: 'routinePdfPath' });
}

export async function upsertPlan(adminId: string, plan: z.output<typeof planSchema>): Promise<{ id: string }> {
  if (!plan.id && !plan.routinePdfPath) throw new ServiceError('ROUTINE_PDF_REQUIRED', { field: 'routinePdfPath' });
  if (plan.routinePdfPath) await assertRoutineUploaded(plan.routinePdfPath);
  const previous = plan.id && plan.routinePdfPath
    ? unwrap(await supabaseAdmin.from('plans').select('routine_pdf_path').eq('id', plan.id).single()).routine_pdf_path
    : null;
  const row = {
    code: plan.code,
    name_bn: plan.nameBn,
    name_en: plan.nameEn,
    duration_days: plan.durationDays,
    fixed_expires_at: plan.fixedExpiresAt,
    price_bdt: plan.priceBdt,
    features: plan.features,
    is_highlighted: plan.isHighlighted,
    is_active: plan.isActive,
    sort_order: plan.sortOrder,
    ...(plan.routinePdfPath ? { routine_pdf_path: plan.routinePdfPath } : {}),
  };
  const result = plan.id
    ? await supabaseAdmin.from('plans').update(row).eq('id', plan.id).select('id').single()
    : await supabaseAdmin.from('plans').insert(row).select('id').single();
  if (result.error?.code === '23505') throw new ServiceError('VALIDATION', { field: 'code' });
  const { id } = unwrap(result);
  await logAdminAudit({ adminId, action: 'plan.upsert', entityType: 'plan', entityId: id, after: row as Json });
  // A replaced routine is no longer linked anywhere; removing it is best effort.
  if (previous && previous !== plan.routinePdfPath) {
    const { error } = await supabaseAdmin.storage.from(PLAN_ROUTINES_BUCKET).remove([previous]);
    if (error) console.error(JSON.stringify({ level: 'warn', context: 'settings.plan.routine', path: previous, error: error.message }));
  }
  return { id };
}

/** Signed upload of a routine PDF straight to the public bucket (≤ 5 MB, application/pdf: bucket limits). */
export async function createRoutineUploadUrl() {
  const path = `plans/${crypto.randomUUID()}.pdf`;
  const data = unwrap(await supabaseAdmin.storage.from(PLAN_ROUTINES_BUCKET).createSignedUploadUrl(path));
  return { path, signedUrl: data.signedUrl };
}

/** Plans are never hard-deleted (admissions reference them); deactivation hides them publicly. */
export async function deletePlan(adminId: string, id: string): Promise<{ id: string }> {
  check(await supabaseAdmin.from('plans').update({ is_active: false }).eq('id', id));
  await logAdminAudit({ adminId, action: 'plan.upsert', entityType: 'plan', entityId: id, after: { is_active: false } });
  return { id };
}

export async function upsertPaymentAccount(adminId: string, account: z.output<typeof paymentAccountSchema>): Promise<{ id: string }> {
  const row = {
    method: account.method,
    account_number: account.accountNumber,
    account_label: account.accountLabel,
    account_holder: account.accountHolder,
    instructions_bn: account.instructionsBn,
    instructions_en: account.instructionsEn,
    is_active: account.isActive,
    sort_order: account.sortOrder,
  };
  const { id } = unwrap(
    account.id
      ? await supabaseAdmin.from('payment_accounts').update(row).eq('id', account.id).select('id').single()
      : await supabaseAdmin.from('payment_accounts').insert(row).select('id').single(),
  );
  await logAdminAudit({ adminId, action: 'payment_account.upsert', entityType: 'payment_account', entityId: id, after: row });
  return { id };
}

export async function createAssetUploadUrl(kind: 'logo' | 'testimonial', ext: string) {
  const path = `${kind}/${crypto.randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const data = unwrap(await supabaseAdmin.storage.from(PUBLIC_ASSETS_BUCKET).createSignedUploadUrl(path));
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Settings → Integrations "Retry failed". */
export async function retryFailedOutbox(): Promise<{ requeued: number }> {
  const rows = unwrap(
    await supabaseAdmin
      .from('outbox')
      .update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
      .eq('status', 'failed')
      .select('id'),
  );
  return { requeued: rows.length };
}
