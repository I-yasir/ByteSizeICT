'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogActions, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { notify } from '@/components/ui/toast';
import { createAssetUploadUrl, deletePlan, retryFailedOutbox, updateSetting, upsertPaymentAccount, upsertPlan } from '@/features/settings/actions';
import type { SettingKey, SettingValue } from '@/features/settings/schemas';
import { formatDate, fromDhakaInput, toDhakaInput } from '@/lib/format';

type AllSettings = { [K in SettingKey]: SettingValue<K> };
type Plan = { id: string; code: string; name_bn: string; name_en: string; duration_days: number | null; fixed_expires_at: string | null; price_bdt: number; features: unknown; is_highlighted: boolean; is_active: boolean; sort_order: number };
type Account = { id: string; method: 'bkash' | 'nagad' | 'rocket' | 'bank'; account_number: string; account_label: string | null; account_holder: string | null; instructions_bn: string | null; instructions_en: string | null; is_active: boolean; sort_order: number };
type Integrations = { pendingCount: number; failedCount: number; lastSheetSyncAt: string | null; failures: { id: number; kind: string; attempts: number; last_error: string | null; created_at: string }[] };

/** Settings tabs; each saves independently (docs/02_AppFlow.md §6.11). */
export function SettingsTabs({ settings, plans, accounts, integrations, logoUrl }: { settings: AllSettings; plans: Plan[]; accounts: Account[]; integrations: Integrations; logoUrl: string | null }) {
  const t = useTranslations('admin.settings');
  return (
    <Tabs defaultValue="brand">
      <TabsList>
        {(['brand', 'contact', 'payments', 'plans', 'homepage', 'policies', 'integrations'] as const).map((key) => (
          <TabsTrigger key={key} value={key}>{t(`tabs.${key}`)}</TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="brand" className="pt-4"><BrandTab value={settings.brand} logoUrl={logoUrl} /></TabsContent>
      <TabsContent value="contact" className="pt-4"><ContactTab value={settings.contact} /></TabsContent>
      <TabsContent value="payments" className="pt-4"><PaymentsTab accounts={accounts} /></TabsContent>
      <TabsContent value="plans" className="pt-4"><PlansTab plans={plans} /></TabsContent>
      <TabsContent value="homepage" className="pt-4"><HomepageTab homepage={settings.homepage} faq={settings.faq} /></TabsContent>
      <TabsContent value="policies" className="pt-4"><PoliciesTab auth={settings.auth} results={settings.results} /></TabsContent>
      <TabsContent value="integrations" className="pt-4"><IntegrationsTab data={integrations} /></TabsContent>
    </Tabs>
  );
}

function SaveButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  const t = useTranslations('admin.settings');
  return <Button loading={pending} onClick={onClick} className="self-start">{t('save')}</Button>;
}

function BrandTab({ value, logoUrl }: { value: SettingValue<'brand'>; logoUrl: string | null }) {
  const t = useTranslations('admin.settings');
  const { run, pending } = useAction();
  const [name, setName] = useState(value.name);
  const [logoPath, setLogoPath] = useState(value.logoPath);
  async function upload(file: File) {
    if (file.size > 512 * 1024) return notify.error(t('logoTooLarge'));
    const ext = file.name.split('.').pop()?.toLowerCase() as 'png' | 'jpg' | 'webp' | 'svg';
    const signed = await run(() => createAssetUploadUrl({ kind: 'logo', ext }), { refresh: false });
    if (!signed.ok) return;
    const response = await fetch(signed.data.signedUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (response.ok) setLogoPath(signed.data.path);
    else notify.error(t('uploadFailed'));
  }
  return (
    <Card className="flex max-w-form flex-col gap-4">
      <Field label={t('brandName')}>{(p) => <Input {...p} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}</Field>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
        {logoUrl && logoPath === value.logoPath ? <img src={logoUrl} alt="" className="h-10 w-auto rounded-md bg-image-matte p-1" /> : null}
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border-strong px-4 text-sm font-semibold hover:bg-surface-2">
          {logoPath ? t('replaceLogo') : t('uploadLogo')}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
        {logoPath ? <Button variant="ghost" size="sm" onClick={() => setLogoPath(null)}>{t('removeLogo')}</Button> : null}
      </div>
      <SaveButton pending={pending} onClick={() => run(() => updateSetting({ key: 'brand', value: { name, logoPath } }), { success: t('saved') })} />
    </Card>
  );
}

function ContactTab({ value }: { value: SettingValue<'contact'> }) {
  const t = useTranslations('admin.settings');
  const { run, pending } = useAction();
  const [v, setV] = useState({ whatsapp: value.whatsapp ?? '', messenger: value.messenger ?? '', phone: value.phone ?? '', email: value.email ?? '' });
  return (
    <Card className="flex max-w-form flex-col gap-4">
      <Field label={t('whatsapp')} helper="https://wa.me/8801XXXXXXXXX">{(p) => <Input {...p} type="url" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} />}</Field>
      <Field label={t('messenger')} optionalLabel={t('optional')}>{(p) => <Input {...p} type="url" value={v.messenger} onChange={(e) => setV({ ...v, messenger: e.target.value })} />}</Field>
      <Field label={t('phone')} optionalLabel={t('optional')}>{(p) => <Input {...p} type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />}</Field>
      <Field label={t('email')} optionalLabel={t('optional')}>{(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
      <SaveButton pending={pending} onClick={() => run(() => updateSetting({ key: 'contact', value: { whatsapp: v.whatsapp || null, messenger: v.messenger || null, phone: v.phone || null, email: v.email || null } }), { success: t('saved') })} />
    </Card>
  );
}

function PaymentsTab({ accounts }: { accounts: Account[] }) {
  const t = useTranslations('admin.settings');
  const { run, pending } = useAction();
  const blank: Account = { id: '', method: 'bkash', account_number: '', account_label: null, account_holder: null, instructions_bn: null, instructions_en: null, is_active: true, sort_order: accounts.length + 1 };
  const [editing, setEditing] = useState<Account | null>(null);
  return (
    <div className="flex max-w-app flex-col gap-3">
      {accounts.map((a) => (
        <Card key={a.id} className="flex items-center justify-between gap-3">
          <span>
            <span className="font-semibold text-fg">{a.method}</span> · <span className="font-num">{a.account_number}</span> {a.account_label ? `· ${a.account_label}` : ''}
            {!a.is_active ? <Badge className="ml-2">{t('inactive')}</Badge> : null}
          </span>
          <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => setEditing(a)}><Pencil aria-hidden className="size-4" /></Button>
        </Card>
      ))}
      <Button variant="secondary" className="self-start" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing(blank)}>{t('addAccount')}</Button>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? t('editAccount') : t('addAccount')}>
            <div className="flex flex-col gap-3">
              <Field label={t('method')}>{(p) => <Select {...p} value={editing.method} onChange={(e) => setEditing({ ...editing, method: e.target.value as Account['method'] })}>{['bkash', 'nagad', 'rocket', 'bank'].map((m) => <option key={m} value={m}>{m}</option>)}</Select>}</Field>
              <Field label={t('accountNumber')}>{(p) => <Input {...p} value={editing.account_number} onChange={(e) => setEditing({ ...editing, account_number: e.target.value })} />}</Field>
              <Field label={t('accountLabel')} optionalLabel={t('optional')}>{(p) => <Input {...p} value={editing.account_label ?? ''} onChange={(e) => setEditing({ ...editing, account_label: e.target.value })} />}</Field>
              <Field label={t('accountHolder')} optionalLabel={t('optional')}>{(p) => <Input {...p} value={editing.account_holder ?? ''} onChange={(e) => setEditing({ ...editing, account_holder: e.target.value })} />}</Field>
              <Field label={t('instructionsBn')} optionalLabel={t('optional')}>{(p) => <Textarea {...p} value={editing.instructions_bn ?? ''} onChange={(e) => setEditing({ ...editing, instructions_bn: e.target.value })} className="min-h-20" />}</Field>
              <Field label={t('instructionsEn')} optionalLabel={t('optional')}>{(p) => <Textarea {...p} value={editing.instructions_en ?? ''} onChange={(e) => setEditing({ ...editing, instructions_en: e.target.value })} className="min-h-20" />}</Field>
              <Field label={t('sortOrder')}>{(p) => <Input {...p} type="number" min={0} value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />}</Field>
              <Checkbox label={t('active')} checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v === true })} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button
                loading={pending}
                onClick={async () => {
                  const result = await run(() => upsertPaymentAccount({ ...(editing.id ? { id: editing.id } : {}), method: editing.method, accountNumber: editing.account_number, accountLabel: editing.account_label, accountHolder: editing.account_holder, instructionsBn: editing.instructions_bn, instructionsEn: editing.instructions_en, isActive: editing.is_active, sortOrder: editing.sort_order }), { success: t('saved') });
                  if (result.ok) setEditing(null);
                }}
              >
                {t('save')}
              </Button>
            </DialogActions>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function PlansTab({ plans }: { plans: Plan[] }) {
  const t = useTranslations('admin.settings');
  const locale = useLocale() as 'bn' | 'en';
  const { run, pending } = useAction();
  type Draft = { id?: string; code: string; nameBn: string; nameEn: string; kind: 'days' | 'fixed'; durationDays: string; fixedExpiresAt: string; priceBdt: string; features: string; isHighlighted: boolean; isActive: boolean; sortOrder: string };
  const toDraft = (p?: Plan): Draft => ({
    ...(p ? { id: p.id } : {}),
    code: p?.code ?? '',
    nameBn: p?.name_bn ?? '',
    nameEn: p?.name_en ?? '',
    kind: p?.fixed_expires_at ? 'fixed' : 'days',
    durationDays: String(p?.duration_days ?? 30),
    fixedExpiresAt: toDhakaInput(p?.fixed_expires_at),
    priceBdt: String(p?.price_bdt ?? 0),
    features: Array.isArray(p?.features) ? (p.features as { bn: string; en: string }[]).map((f) => `${f.bn} | ${f.en}`).join('\n') : '',
    isHighlighted: p?.is_highlighted ?? false,
    isActive: p?.is_active ?? true,
    sortOrder: String(p?.sort_order ?? plans.length + 1),
  });
  const [editing, setEditing] = useState<Draft | null>(null);
  async function save(d: Draft) {
    const features = d.features
      .split('\n')
      .map((line) => line.split('|').map((s) => s.trim()))
      .filter(([bn]) => bn)
      .map(([bn, en]) => ({ bn: bn as string, en: en || (bn as string) }));
    const result = await run(
      () =>
        upsertPlan({
          ...(d.id ? { id: d.id } : {}),
          code: d.code,
          nameBn: d.nameBn,
          nameEn: d.nameEn,
          durationDays: d.kind === 'days' ? Number(d.durationDays) : null,
          fixedExpiresAt: d.kind === 'fixed' ? fromDhakaInput(d.fixedExpiresAt) : null,
          priceBdt: Number(d.priceBdt),
          features,
          isHighlighted: d.isHighlighted,
          isActive: d.isActive,
          sortOrder: Number(d.sortOrder),
        }),
      { success: t('saved') },
    );
    if (result.ok) setEditing(null);
  }
  return (
    <div className="flex max-w-app flex-col gap-3">
      {plans.map((p) => (
        <Card key={p.id} className="flex items-center justify-between gap-3">
          <span>
            <span className="font-semibold text-fg">{locale === 'bn' ? p.name_bn : p.name_en}</span> · <span className="font-num">৳{p.price_bdt}</span> ·{' '}
            <span className="text-sm text-fg-muted">{p.duration_days ? t('daysN', { n: p.duration_days }) : p.fixed_expires_at ? formatDate(p.fixed_expires_at, locale, 'date') : ''}</span>
            {p.is_highlighted ? <Badge variant="primary" className="ml-2">{t('highlighted')}</Badge> : null}
            {!p.is_active ? <Badge className="ml-2">{t('inactive')}</Badge> : null}
          </span>
          <span className="flex">
            <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => setEditing(toDraft(p))}><Pencil aria-hidden className="size-4" /></Button>
            {p.is_active ? <Button size="icon" variant="ghost" aria-label={t('deactivate')} onClick={() => run(() => deletePlan({ id: p.id }), { success: t('saved') })}><Trash2 aria-hidden className="size-4" /></Button> : null}
          </span>
        </Card>
      ))}
      <Button variant="secondary" className="self-start" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing(toDraft())}>{t('addPlan')}</Button>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={editing.id ? t('editPlan') : t('addPlan')}>
            <div className="flex flex-col gap-3">
              <Field label={t('code')} helper={t('codeHelp')}>{(p) => <Input {...p} value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />}</Field>
              <Field label={t('nameBn')}>{(p) => <Input {...p} value={editing.nameBn} onChange={(e) => setEditing({ ...editing, nameBn: e.target.value })} />}</Field>
              <Field label={t('nameEn')}>{(p) => <Input {...p} value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />}</Field>
              <Field label={t('validity')}>{(p) => <Select {...p} value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Draft['kind'] })}><option value="days">{t('validityDays')}</option><option value="fixed">{t('validityFixed')}</option></Select>}</Field>
              {editing.kind === 'days' ? (
                <Field label={t('durationDays')}>{(p) => <Input {...p} type="number" min={1} value={editing.durationDays} onChange={(e) => setEditing({ ...editing, durationDays: e.target.value })} />}</Field>
              ) : (
                <Field label={t('fixedExpiresAt')}>{(p) => <Input {...p} type="datetime-local" value={editing.fixedExpiresAt} onChange={(e) => setEditing({ ...editing, fixedExpiresAt: e.target.value })} />}</Field>
              )}
              <Field label={t('price')}>{(p) => <Input {...p} type="number" min={0} value={editing.priceBdt} onChange={(e) => setEditing({ ...editing, priceBdt: e.target.value })} />}</Field>
              <Field label={t('features')} helper={t('featuresHelp')}>{(p) => <Textarea {...p} value={editing.features} onChange={(e) => setEditing({ ...editing, features: e.target.value })} />}</Field>
              <Field label={t('sortOrder')}>{(p) => <Input {...p} type="number" min={0} value={editing.sortOrder} onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })} />}</Field>
              <Checkbox label={t('highlighted')} checked={editing.isHighlighted} onCheckedChange={(v) => setEditing({ ...editing, isHighlighted: v === true })} />
              <Checkbox label={t('active')} checked={editing.isActive} onCheckedChange={(v) => setEditing({ ...editing, isActive: v === true })} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button loading={pending} onClick={() => save(editing)}>{t('save')}</Button>
            </DialogActions>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

type Pair = { bn: string; en: string };
function ListEditor<T>({ items, onChange, render, blank, addLabel }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, update: (item: T) => void) => React.ReactNode; blank: T; addLabel: string }) {
  const t = useTranslations('admin.settings');
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 rounded-md border border-border p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">{render(item, (next) => onChange(items.map((x, j) => (j === i ? next : x))))}</div>
          <Button size="icon" variant="ghost" aria-label={t('removeItem')} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 aria-hidden className="size-4" /></Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" className="self-start" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => onChange([...items, blank])}>{addLabel}</Button>
    </div>
  );
}

function HomepageTab({ homepage, faq }: { homepage: SettingValue<'homepage'>; faq: SettingValue<'faq'> }) {
  const t = useTranslations('admin.settings');
  const { run, pending } = useAction();
  const [hero, setHero] = useState({ titleBn: homepage.heroTitle?.bn ?? '', titleEn: homepage.heroTitle?.en ?? '', subBn: homepage.heroSubtitle?.bn ?? '', subEn: homepage.heroSubtitle?.en ?? '' });
  const [testimonials, setTestimonials] = useState(homepage.testimonials);
  const [performers, setPerformers] = useState(homepage.topPerformers);
  const [faqs, setFaqs] = useState(faq);
  const pair = (value: Pair, update: (v: Pair) => void, label: string) => (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input aria-label={`${label} (বাংলা)`} placeholder={`${label} (বাংলা)`} value={value.bn} onChange={(e) => update({ ...value, bn: e.target.value })} />
      <Input aria-label={`${label} (English)`} placeholder={`${label} (English)`} value={value.en} onChange={(e) => update({ ...value, en: e.target.value })} />
    </div>
  );
  async function save() {
    const opt = (bn: string, en: string) => (bn.trim() && en.trim() ? { bn, en } : null);
    const r1 = await run(() => updateSetting({ key: 'homepage', value: { heroTitle: opt(hero.titleBn, hero.titleEn), heroSubtitle: opt(hero.subBn, hero.subEn), testimonials, topPerformers: performers } }), { refresh: false });
    if (!r1.ok) return;
    await run(() => updateSetting({ key: 'faq', value: faqs }), { success: t('saved') });
  }
  return (
    <div className="flex max-w-app flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('hero')}</h2>
        <p className="text-sm text-fg-muted">{t('heroHelp')}</p>
        {pair({ bn: hero.titleBn, en: hero.titleEn }, (v) => setHero({ ...hero, titleBn: v.bn, titleEn: v.en }), t('heroTitle'))}
        {pair({ bn: hero.subBn, en: hero.subEn }, (v) => setHero({ ...hero, subBn: v.bn, subEn: v.en }), t('heroSubtitle'))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('testimonials')}</h2>
        <ListEditor
          items={testimonials}
          onChange={setTestimonials}
          blank={{ text: { bn: '', en: '' }, attribution: '', photoPath: null }}
          addLabel={t('addTestimonial')}
          render={(item, update) => (
            <>
              {pair(item.text, (text) => update({ ...item, text }), t('quote'))}
              <Input aria-label={t('attribution')} placeholder={t('attribution')} value={item.attribution} onChange={(e) => update({ ...item, attribution: e.target.value })} />
            </>
          )}
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('topPerformers')}</h2>
        <ListEditor
          items={performers}
          onChange={setPerformers}
          blank={{ label: '', scoreText: '' }}
          addLabel={t('addPerformer')}
          render={(item, update) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label={t('performerLabel')} placeholder="017XX-XXX-001" value={item.label} onChange={(e) => update({ ...item, label: e.target.value })} />
              <Input aria-label={t('scoreText')} placeholder="48/50" value={item.scoreText} onChange={(e) => update({ ...item, scoreText: e.target.value })} />
            </div>
          )}
        />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('faq')}</h2>
        <ListEditor
          items={faqs}
          onChange={setFaqs}
          blank={{ q: { bn: '', en: '' }, a: { bn: '', en: '' } }}
          addLabel={t('addFaq')}
          render={(item, update) => (
            <>
              {pair(item.q, (q) => update({ ...item, q }), t('question'))}
              {pair(item.a, (a) => update({ ...item, a }), t('answer'))}
            </>
          )}
        />
      </Card>
      <SaveButton pending={pending} onClick={save} />
    </div>
  );
}

function PoliciesTab({ auth, results }: { auth: SettingValue<'auth'>; results: SettingValue<'results'> }) {
  const t = useTranslations('admin.settings');
  const { run, pending } = useAction();
  const [maxDevices, setMaxDevices] = useState<1 | 2>(auth.maxDevices);
  const [visible, setVisible] = useState(results.visibleWhenInactive);
  async function save() {
    const r = await run(() => updateSetting({ key: 'auth', value: { maxDevices } }), { refresh: false });
    if (r.ok) await run(() => updateSetting({ key: 'results', value: { visibleWhenInactive: visible } }), { success: t('saved') });
  }
  return (
    <Card className="flex max-w-form flex-col gap-4">
      <Field label={t('maxDevices')} helper={t('maxDevicesHelp')}>{(p) => <Select {...p} value={maxDevices} onChange={(e) => setMaxDevices(Number(e.target.value) as 1 | 2)}><option value={1}>1</option><option value={2}>2</option></Select>}</Field>
      <Checkbox label={t('visibleWhenInactive')} checked={visible} onCheckedChange={(v) => setVisible(v === true)} />
      <SaveButton pending={pending} onClick={save} />
    </Card>
  );
}

function IntegrationsTab({ data }: { data: Integrations }) {
  const t = useTranslations('admin.settings');
  const locale = useLocale() as 'bn' | 'en';
  const { run, pending } = useAction();
  return (
    <div className="flex max-w-app flex-col gap-4">
      <Card className="grid gap-3 sm:grid-cols-3">
        <div><p className="text-sm text-fg-muted">{t('lastSync')}</p><p className="font-num font-semibold">{data.lastSheetSyncAt ? formatDate(data.lastSheetSyncAt, locale, 'dateTime') : '—'}</p></div>
        <div><p className="text-sm text-fg-muted">{t('pendingJobs')}</p><p className="font-num font-semibold">{data.pendingCount}</p></div>
        <div><p className="text-sm text-fg-muted">{t('failedJobs')}</p><p className="font-num font-semibold text-danger">{data.failedCount}</p></div>
      </Card>
      {data.failures.length ? (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {data.failures.map((f) => (
              <li key={f.id} className="rounded-md bg-surface-2 p-3">
                <span className="font-mono text-xs">{f.kind}</span> · <span className="font-num">{f.attempts}×</span>
                <p className="mt-1 text-xs break-all text-danger">{f.last_error}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Button className="self-start" disabled={data.failedCount === 0} loading={pending} onClick={() => run(() => retryFailedOutbox({}), { success: t('retried') })}>{t('retryFailed')}</Button>
    </div>
  );
}
