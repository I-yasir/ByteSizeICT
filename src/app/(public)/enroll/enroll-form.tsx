'use client';

import { track } from '@vercel/analytics';
import { MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { METHOD_LABEL, PaymentMethodBadge } from '@/components/marketing/payment-method-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioCard, RadioCards, Segmented, SegmentedItem } from '@/components/ui/controls';
import { CopyField } from '@/components/ui/copy-field';
import { Field, Input } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { submitAdmission } from '@/features/admissions/actions';
import { submitAdmissionSchema } from '@/features/admissions/schemas';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';
import type { PublicPlan } from '@/features/public/queries';

type Method = keyof typeof METHOD_LABEL;
type Account = {
  id: string;
  method: Method;
  accountNumber: string;
  accountLabel: string | null;
  accountHolder: string | null;
  instructionsBn: string | null;
  instructionsEn: string | null;
};
type FieldName = 'mobile' | 'email' | 'method' | 'trxId';
type FormBanner = 'pending' | 'rateLimited' | 'network' | null;

/** /enroll (PRD V-06/V-07, docs/02_AppFlow.md §4.3). Exactly four fields; no name. */
export function EnrollForm({
  plans,
  accounts,
  initialPlanId,
  defaultMobile,
  isRenewal,
  whatsapp,
}: {
  plans: PublicPlan[];
  accounts: Account[];
  initialPlanId: string | null;
  defaultMobile: string;
  isRenewal: boolean;
  whatsapp: string | null;
}) {
  const t = useTranslations('enroll');
  const errorText = useErrorMessage();
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();

  const [planId, setPlanId] = useState<string | null>(initialPlanId);
  const [values, setValues] = useState({ mobile: defaultMobile, email: '', method: '' as Method | '', trxId: '' });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [trxDuplicate, setTrxDuplicate] = useState(false);
  const [banner, setBanner] = useState<FormBanner>(null);
  const [submitting, setSubmitting] = useState(false);

  const methods = useMemo(() => [...new Set(accounts.map((a) => a.method))], [accounts]);
  const plan = plans.find((p) => p.id === planId) ?? null;

  function validateField(name: FieldName, value: string) {
    const schema = submitAdmissionSchema.shape[name];
    const result = schema.safeParse(value);
    setErrors((prev) => ({ ...prev, [name]: result.success ? undefined : errorText({ message: result.error.issues[0]?.message ?? 'errors.validation' }) }));
    return result.success;
  }

  function set(name: FieldName, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) validateField(name, value);
    if (name === 'trxId') setTrxDuplicate(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    const checks = (['mobile', 'email', 'method', 'trxId'] as const).map((name) => validateField(name, values[name]));
    if (checks.includes(false)) return;

    setSubmitting(true);
    try {
      const result = await submitAdmission({ ...values, planId });
      if (result.ok) {
        track('enroll_submit');
        router.push('/enroll/success');
        return;
      }
      const { code, field } = result.error;
      if (code === 'TRX_DUPLICATE') setTrxDuplicate(true);
      else if (code === 'PENDING_EXISTS') setBanner('pending');
      else if (code === 'RATE_LIMITED') setBanner('rateLimited');
      else if (code === 'VALIDATION' && field) setErrors((prev) => ({ ...prev, [field]: errorText(result.error) }));
      else setBanner('network');
    } catch {
      setBanner('network'); // values are kept
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Step 1 — Pay */}
      <section aria-labelledby="step-pay">
        <h2 id="step-pay" className="mb-3 text-lg font-semibold text-fg">
          <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary font-num text-sm text-on-primary">1</span>
          {t('step1')}
        </h2>
        {plans.length > 0 ? (
          <RadioCards
            value={planId ?? ''}
            onValueChange={(value) => setPlanId(value)}
            aria-label={t('choosePlan')}
            className="mb-4 grid gap-2 sm:grid-cols-3"
          >
            {plans.map((p) => (
              <RadioCard key={p.id} value={p.id} className="flex-col items-start gap-1">
                <span className="font-semibold text-fg">{locale === 'bn' ? p.nameBn : p.nameEn}</span>
                <span className="font-num text-xl font-bold text-fg">{formatTaka(p.priceBdt, locale)}</span>
                <span className="text-xs text-fg-muted">
                  {p.durationDays
                    ? t('days', { days: formatNumber(p.durationDays, locale) })
                    : p.fixedExpiresAt
                      ? t('until', { date: formatDate(p.fixedExpiresAt, locale, 'date') })
                      : null}
                </span>
              </RadioCard>
            ))}
          </RadioCards>
        ) : null}

        {plan ? (
          <p className="mb-4 rounded-md bg-primary-soft px-4 py-3 text-base text-fg">
            {t('amount')}: <strong className="font-num text-primary">{formatTaka(plan.priceBdt, locale)}</strong>
          </p>
        ) : null}

        {accounts.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {accounts.map((account) => {
              const instructions = locale === 'bn' ? account.instructionsBn : account.instructionsEn;
              return (
                <li key={account.id}>
                  <Card className="flex h-full flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <PaymentMethodBadge method={account.method} />
                      <div>
                        <p className="font-semibold text-fg">{METHOD_LABEL[account.method]}</p>
                        {account.accountLabel || account.accountHolder ? (
                          <p className="text-sm text-fg-muted">{[account.accountLabel, account.accountHolder].filter(Boolean).join(' · ')}</p>
                        ) : null}
                      </div>
                    </div>
                    <CopyField value={account.accountNumber} label={METHOD_LABEL[account.method]} />
                    {instructions ? <p className="text-sm whitespace-pre-line text-fg-muted">{instructions}</p> : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <Banner variant="info">{t('noAccounts')}</Banner>
        )}
      </section>

      {/* Step 2 — Submit details */}
      <section aria-labelledby="step-details">
        <h2 id="step-details" className="mb-3 text-lg font-semibold text-fg">
          <span className="mr-2 inline-flex size-7 items-center justify-center rounded-full bg-primary font-num text-sm text-on-primary">2</span>
          {t('step2')}
        </h2>
        {isRenewal ? <Banner className="mb-4" variant="info">{t('renewalNote')}</Banner> : null}
        {banner ? (
          <Banner className="mb-4" variant={banner === 'pending' ? 'info' : 'danger'} role="alert">
            {t(`banner.${banner}`)}
          </Banner>
        ) : null}

        <form noValidate onSubmit={onSubmit} className="mx-auto flex max-w-form flex-col gap-4 sm:mx-0">
          <Field label={t('form.mobile')} helper={t('form.mobileHelper')} error={errors.mobile}>
            {(props) => (
              <Input
                {...props}
                name="mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="01XXXXXXXXX"
                className="font-num"
                value={values.mobile}
                onChange={(e) => set('mobile', e.target.value)}
                onBlur={(e) => e.target.value && validateField('mobile', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('form.email')} helper={t('form.emailHelper')} error={errors.email}>
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                autoComplete="email"
                value={values.email}
                onChange={(e) => set('email', e.target.value)}
                onBlur={(e) => e.target.value && validateField('email', e.target.value)}
              />
            )}
          </Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-fg">{t('form.method')}</legend>
            <Segmented
              value={values.method}
              onValueChange={(value) => set('method', value)}
              aria-invalid={errors.method ? true : undefined}
              aria-label={t('form.method')}
            >
              {(methods.length ? methods : (['bkash', 'nagad', 'rocket', 'bank'] as Method[])).map((method) => (
                <SegmentedItem key={method} value={method}>
                  {METHOD_LABEL[method]}
                </SegmentedItem>
              ))}
            </Segmented>
            {errors.method ? <p className="mt-1 text-sm text-danger">{errors.method}</p> : null}
          </fieldset>
          <Field
            label={t('form.trx')}
            helper={t('form.trxHelper')}
            error={
              trxDuplicate ? (
                <>
                  {errorText({ message: 'errors.trxDuplicate' })}
                  {whatsapp ? (
                    <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 font-semibold underline">
                      <MessageCircle aria-hidden className="size-4" /> WhatsApp
                    </a>
                  ) : null}
                </>
              ) : (
                errors.trxId
              )
            }
          >
            {(props) => (
              <Input
                {...props}
                name="trxId"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="font-num uppercase"
                value={values.trxId}
                onChange={(e) => set('trxId', e.target.value)}
                onBlur={(e) => e.target.value && validateField('trxId', e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {submitting ? t('form.submitting') : t('form.submit')}
          </Button>
        </form>
      </section>
    </div>
  );
}
