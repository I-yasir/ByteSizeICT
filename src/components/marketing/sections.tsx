import { BookOpen, CalendarCheck, CreditCard, Lightbulb, Mail, PlayCircle, Quote, RotateCcw, Trophy, Zap } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Accordion, AccordionItem } from '@/components/ui/controls';
import { SectionHeading } from '@/components/ui/misc';
import type { PublicPlan } from '@/features/public/queries';
import type { SettingValue } from '@/features/settings/schemas';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Homepage sections 4–9 (docs/02_AppFlow.md §4.1). */
export function Section({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('mx-auto max-w-marketing px-4 py-12 sm:px-6 lg:px-8 lg:py-20', className)}>
      {children}
    </section>
  );
}

const WHY = [
  { key: 'daily', Icon: CalendarCheck },
  { key: 'chapter', Icon: BookOpen },
  { key: 'instant', Icon: Zap },
  { key: 'solutions', Icon: Lightbulb },
  { key: 'rank', Icon: Trophy },
  { key: 'recovery', Icon: RotateCcw },
] as const;

export async function WhyJoin() {
  const t = await getTranslations('home.why');
  return (
    <Section id="why">
      <div id="why-title">
        <SectionHeading title={t('title')} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WHY.map(({ key, Icon }) => (
          <li key={key}>
            <Card className="flex h-full gap-4">
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon className="size-6" />
              </span>
              <div>
                <h3 className="font-semibold text-fg">{t(`items.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-fg-muted">{t(`items.${key}.body`)}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export async function SocialProof({ homepage }: { homepage: SettingValue<'homepage'> }) {
  if (homepage.testimonials.length === 0 && homepage.topPerformers.length === 0) return null;
  const t = await getTranslations('home.proof');
  const locale = (await getLocale()) as 'bn' | 'en';
  return (
    <Section id="results" className="bg-surface-2/50">
      <div id="results-title">
        <SectionHeading title={t('title')} />
      </div>
      {homepage.topPerformers.length > 0 ? (
        <>
          <h3 className="mb-3 text-sm font-semibold text-fg-muted">{t('topPerformers')}</h3>
          <ol className="mb-8 grid gap-3 sm:grid-cols-3">
            {homepage.topPerformers.map((p, i) => (
              <li key={`${p.label}-${i}`} className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-sm">
                <span className="flex size-10 items-center justify-center rounded-full bg-warning-soft font-num font-bold text-warning">{i + 1}</span>
                <span className="font-num text-sm text-fg-muted">{p.label}</span>
                <span className="ml-auto font-num text-lg font-bold text-fg">{p.scoreText}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      {homepage.testimonials.length > 0 ? (
        <>
          <h3 className="mb-3 text-sm font-semibold text-fg-muted">{t('testimonials')}</h3>
          <ul className="grid gap-3 md:grid-cols-2">
            {homepage.testimonials.map((item, i) => (
              <li key={i}>
                <Card className="h-full">
                  <Quote aria-hidden className="size-6 text-primary" />
                  <blockquote className="mt-2 text-base text-fg">{item.text[locale]}</blockquote>
                  <p className="mt-3 text-sm text-fg-muted">— {item.attribution}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

const STEPS = [
  { key: 'pay', Icon: CreditCard },
  { key: 'email', Icon: Mail },
  { key: 'start', Icon: PlayCircle },
] as const;

export async function HowItWorks() {
  const t = await getTranslations('home.how');
  return (
    <Section id="how">
      <div id="how-title">
        <SectionHeading title={t('title')} />
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {STEPS.map(({ key, Icon }, i) => (
          <li key={key}>
            <Card className="h-full">
              <span className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary font-num font-bold text-on-primary">{i + 1}</span>
                <Icon aria-hidden className="size-6 text-primary" />
              </span>
              <h3 className="mt-3 font-semibold text-fg">{t(`steps.${key}.title`)}</h3>
              <p className="mt-1 text-sm text-fg-muted">{t(`steps.${key}.body`)}</p>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export async function Pricing({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) return null;
  const t = await getTranslations('home.pricing');
  const locale = (await getLocale()) as 'bn' | 'en';
  return (
    <Section id="pricing">
      <div id="pricing-title">
        <SectionHeading title={t('title')} subtitle={t('subtitle')} />
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <li key={plan.id}>
            <Card className={cn('flex h-full flex-col gap-3', plan.isHighlighted && 'ring-2 ring-primary')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-fg">{locale === 'bn' ? plan.nameBn : plan.nameEn}</h3>
                {plan.isHighlighted ? <Badge variant="primary">{t('popular')}</Badge> : null}
              </div>
              <p className="font-num text-4xl font-bold text-fg">{formatTaka(plan.priceBdt, locale)}</p>
              <p className="text-sm text-fg-muted">
                {plan.durationDays
                  ? t('days', { days: formatNumber(plan.durationDays, locale) })
                  : plan.fixedExpiresAt
                    ? t('until', { date: formatDate(plan.fixedExpiresAt, locale, 'date') })
                    : null}
              </p>
              {plan.features.length > 0 ? (
                <ul className="flex flex-col gap-1.5 text-sm text-fg">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="text-success">✓</span>
                      {feature[locale]}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button asChild variant={plan.isHighlighted ? 'primary' : 'secondary'} fullWidth className="mt-auto">
                <Link href={`/enroll?plan=${encodeURIComponent(plan.code)}`}>{t('choose')}</Link>
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export async function SampleCta() {
  const t = await getTranslations('home.sample');
  return (
    <Section id="sample">
      <Card className="flex flex-col items-start gap-4 bg-primary-soft p-6 shadow-none md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <h2 id="sample-title" className="text-2xl font-bold text-fg">{t('title')}</h2>
          <p className="mt-1 text-base text-fg-muted">{t('body')}</p>
        </div>
        <Button asChild size="lg">
          <Link href="/sample">{t('cta')}</Link>
        </Button>
      </Card>
    </Section>
  );
}

export async function FaqList({ items, limit }: { items: SettingValue<'faq'>; limit?: number }) {
  const locale = (await getLocale()) as 'bn' | 'en';
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <Accordion type="single" collapsible className="rounded-lg bg-surface px-4 shadow-sm">
      {shown.map((item, i) => (
        <AccordionItem key={i} value={`faq-${i}`} question={item.q[locale]}>
          <p className="whitespace-pre-line">{item.a[locale]}</p>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export async function FaqPreview({ items }: { items: SettingValue<'faq'> }) {
  if (items.length === 0) return null;
  const t = await getTranslations('home.faq');
  return (
    <Section id="faq">
      <div id="faq-title">
        <SectionHeading
          title={t('title')}
          action={
            items.length > 6 ? (
              <Button asChild variant="ghost">
                <Link href="/faq">{t('more')}</Link>
              </Button>
            ) : null
          }
        />
      </div>
      <FaqList items={items} limit={6} />
    </Section>
  );
}
