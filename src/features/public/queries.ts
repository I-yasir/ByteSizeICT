import 'server-only';
import { SETTING_DEFAULTS, type SettingKey, type SettingValue, settingSchemas } from '@/features/settings/schemas';
import { unwrap } from '@/lib/actions';
import { supabaseAnon } from '@/lib/supabase/anon';
import { planRoutineUrls, publicAssetUrl } from '@/lib/supabase/storage';

/**
 * Marketing-page reads through the anon client (TRD §4.2, docs/05_Schema.md §7): RLS limits these to
 * active plans/accounts and public settings. R1.1: exams are not public (CR5).
 */
export async function getActivePlans() {
  const rows = unwrap(
    await supabaseAnon
      .from('plans')
      .select('id, code, name_bn, name_en, duration_days, fixed_expires_at, price_bdt, features, is_highlighted, sort_order, routine_pdf_path')
      .eq('is_active', true)
      .order('sort_order'),
  );
  return rows.map((plan) => ({
    id: plan.id,
    code: plan.code,
    nameBn: plan.name_bn,
    nameEn: plan.name_en,
    durationDays: plan.duration_days,
    fixedExpiresAt: plan.fixed_expires_at,
    priceBdt: plan.price_bdt,
    features: (Array.isArray(plan.features) ? plan.features : []) as { bn: string; en: string }[],
    isHighlighted: plan.is_highlighted,
    routine: planRoutineUrls(plan.routine_pdf_path),
  }));
}
export type PublicPlan = Awaited<ReturnType<typeof getActivePlans>>[number];

export async function getPaymentAccounts() {
  const rows = unwrap(
    await supabaseAnon
      .from('payment_accounts')
      .select('id, method, account_number, account_label, account_holder, instructions_bn, instructions_en, sort_order')
      .eq('is_active', true)
      .order('sort_order'),
  );
  return rows.map((account) => ({
    id: account.id,
    method: account.method,
    accountNumber: account.account_number,
    accountLabel: account.account_label,
    accountHolder: account.account_holder,
    instructionsBn: account.instructions_bn,
    instructionsEn: account.instructions_en,
  }));
}

type PublicSettings = { [K in Extract<SettingKey, 'brand' | 'contact' | 'homepage' | 'faq'>]: SettingValue<K> } & {
  logoUrl: string | null;
};

export async function getPublicSettings(): Promise<PublicSettings> {
  const rows = unwrap(await supabaseAnon.from('app_settings').select('key, value'));
  const pick = <K extends 'brand' | 'contact' | 'homepage' | 'faq'>(key: K): SettingValue<K> => {
    const parsed = settingSchemas[key].safeParse(rows.find((row) => row.key === key)?.value);
    return (parsed.success ? parsed.data : SETTING_DEFAULTS[key]) as SettingValue<K>;
  };
  const brand = pick('brand');
  return {
    brand,
    contact: pick('contact'),
    homepage: pick('homepage'),
    faq: pick('faq'),
    logoUrl: publicAssetUrl(brand.logoPath),
  };
}
