import 'server-only';
import { SETTING_DEFAULTS, type SettingKey, type SettingValue, settingSchemas } from '@/features/settings/schemas';
import { unwrap } from '@/lib/actions';
import { supabaseAnon } from '@/lib/supabase/anon';
import { planRoutineUrls, publicAssetUrl } from '@/lib/supabase/storage';
import { addDays, dhakaDateKey, startOfDhakaDay } from '@/lib/time';

/**
 * Marketing-page reads through the anon client (TRD §4.2, docs/05_Schema.md §7): RLS limits these to
 * published non-sample exams, active plans/accounts and public settings.
 */
const ROUTINE_COLUMNS =
  'id, title, description, chapter_label, starts_at, live_ends_at, access_mode, duration_minutes, marks_per_question, negative_mark, question_count, is_featured';

export type RoutineExam = {
  id: string;
  title: string;
  description: string | null;
  chapterLabel: string | null;
  startsAt: string;
  liveEndsAt: string;
  durationMinutes: number;
  questionCount: number;
  totalMarks: number;
  negativeMark: number;
  isFeatured: boolean;
};

type ExamRow = {
  id: string;
  title: string;
  description: string | null;
  chapter_label: string | null;
  starts_at: string | null;
  live_ends_at: string | null;
  duration_minutes: number;
  marks_per_question: number;
  negative_mark: number;
  question_count: number;
  is_featured: boolean;
};

function toRoutineExam(row: ExamRow): RoutineExam {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    chapterLabel: row.chapter_label,
    startsAt: row.starts_at ?? '',
    liveEndsAt: row.live_ends_at ?? '',
    durationMinutes: row.duration_minutes,
    questionCount: row.question_count,
    totalMarks: row.question_count * Number(row.marks_per_question),
    negativeMark: Number(row.negative_mark),
    isFeatured: row.is_featured,
  };
}

/** Homepage strip (V-02): the featured exam if it is still ahead or live, else the earliest upcoming. */
export async function getNextExam(now = new Date()): Promise<RoutineExam | null> {
  const rows = unwrap(
    await supabaseAnon
      .from('exams')
      .select(ROUTINE_COLUMNS)
      .gt('live_ends_at', now.toISOString())
      .order('starts_at', { ascending: true })
      .limit(20),
  ) as ExamRow[];
  const exams = rows.map(toRoutineExam);
  return exams.find((exam) => exam.isFeatured) ?? exams[0] ?? null;
}

export type RoutineDay = { date: string; exams: RoutineExam[] };

/** /routine (V-03): upcoming exams grouped by Dhaka date, plus the past 7 days as "recent". */
export async function getRoutine(options: { now?: Date; limit?: number; days?: number } = {}): Promise<{
  upcoming: RoutineDay[];
  recent: RoutineDay[];
}> {
  const now = options.now ?? new Date();
  const today = startOfDhakaDay(now);
  let query = supabaseAnon
    .from('exams')
    .select(ROUTINE_COLUMNS)
    .gte('starts_at', addDays(today, -7).toISOString())
    .order('starts_at', { ascending: true });
  if (options.days) query = query.lt('starts_at', addDays(today, options.days).toISOString());
  const exams = (unwrap(await query.limit(500)) as ExamRow[]).map(toRoutineExam);

  const group = (list: RoutineExam[]) => {
    const days = new Map<string, RoutineExam[]>();
    for (const exam of list) {
      const key = dhakaDateKey(new Date(exam.startsAt));
      days.set(key, [...(days.get(key) ?? []), exam]);
    }
    return [...days.entries()].map(([date, items]) => ({ date, exams: items }));
  };

  const upcoming = exams.filter((exam) => Date.parse(exam.startsAt) >= today.getTime());
  const recent = exams.filter((exam) => Date.parse(exam.startsAt) < today.getTime()).reverse();
  return { upcoming: group(options.limit ? upcoming.slice(0, options.limit) : upcoming), recent: group(recent) };
}

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
