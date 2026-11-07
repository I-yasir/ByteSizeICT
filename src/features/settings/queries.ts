import 'server-only';
import { unwrap } from '@/lib/actions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SETTING_DEFAULTS, type SettingKey, type SettingValue, settingSchemas } from './schemas';

/** Settings reads for server code (service_role). Invalid/missing rows fall back to defaults. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const { data } = await supabaseAdmin.from('app_settings').select('value').eq('key', key).maybeSingle();
  const parsed = settingSchemas[key].safeParse(data?.value);
  return (parsed.success ? parsed.data : SETTING_DEFAULTS[key]) as SettingValue<K>;
}

export async function getAllSettings(): Promise<{ [K in SettingKey]: SettingValue<K> }> {
  const rows = unwrap(await supabaseAdmin.from('app_settings').select('key, value'));
  const result = { ...SETTING_DEFAULTS } as Record<SettingKey, unknown>;
  for (const row of rows) {
    const key = row.key as SettingKey;
    const parsed = settingSchemas[key]?.safeParse(row.value);
    if (parsed?.success) result[key] = parsed.data;
  }
  return result as { [K in SettingKey]: SettingValue<K> };
}

export async function listPlansAdmin() {
  return unwrap(await supabaseAdmin.from('plans').select('*').order('sort_order').order('created_at'));
}

export async function listPaymentAccountsAdmin() {
  return unwrap(await supabaseAdmin.from('payment_accounts').select('*').order('sort_order').order('created_at'));
}

/** Settings → Integrations (docs/02_AppFlow.md §6.11). */
export async function getIntegrationsStatus() {
  const [pending, failed, lastSheet, failures] = await Promise.all([
    supabaseAdmin.from('outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing']),
    supabaseAdmin.from('outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabaseAdmin
      .from('outbox')
      .select('done_at')
      .eq('status', 'done')
      .like('kind', 'sheet_%')
      .order('done_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('outbox')
      .select('id, kind, attempts, last_error, created_at')
      .eq('status', 'failed')
      .order('id', { ascending: false })
      .limit(20),
  ]);
  return {
    pendingCount: pending.count ?? 0,
    failedCount: failed.count ?? 0,
    lastSheetSyncAt: lastSheet.data?.done_at ?? null,
    failures: unwrap(failures),
  };
}
