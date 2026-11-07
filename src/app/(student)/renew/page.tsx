import { CalendarClock, MessageCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getActivePlans, getPublicSettings } from '@/features/public/queries';
import { getSetting } from '@/features/settings/queries';
import { requireStudent } from '@/lib/auth/guards';
import { formatDate, formatNumber, formatTaka } from '@/lib/format';

/** /renew (PRD S-13, docs/02_AppFlow.md §5.8). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('renew'))('title') };
}

export default async function RenewPage() {
  const { student, accessState } = await requireStudent({ currentPath: '/renew' });
  const [t, locale, plans, settings, results] = await Promise.all([
    getTranslations('renew'),
    getLocale() as Promise<'bn' | 'en'>,
    getActivePlans(),
    getPublicSettings(),
    getSetting('results'),
  ]);
  const nowMs = new Date().getTime();
  const notYetStarted = accessState === 'expired' && Date.parse(student.access_starts_at) > nowMs;
  const variant = accessState === 'active' ? 'active' : accessState === 'cancelled' ? 'cancelled' : notYetStarted ? 'future' : 'expired';
  const Icon = variant === 'active' ? ShieldCheck : variant === 'future' ? CalendarClock : ShieldAlert;
  const date = formatDate(variant === 'future' ? student.access_starts_at : student.access_expires_at, locale, 'date');

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-start gap-4">
        <span aria-hidden className={`flex size-12 shrink-0 items-center justify-center rounded-full ${variant === 'active' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
          <Icon className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-fg">{t(`${variant}.title`, { date })}</h1>
          <p className="mt-1 text-base text-fg-muted">{t(`${variant}.body`)}</p>
        </div>
      </Card>

      {variant !== 'future' ? (
        <section aria-labelledby="renew-plans">
          <h2 id="renew-plans" className="mb-3 text-lg font-semibold text-fg">{t('choosePlan')}</h2>
          <ul className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Card className="flex h-full flex-col gap-2">
                  <h3 className="font-semibold text-fg">{locale === 'bn' ? plan.nameBn : plan.nameEn}</h3>
                  <p className="font-num text-2xl font-bold text-fg">{formatTaka(plan.priceBdt, locale)}</p>
                  <p className="text-sm text-fg-muted">
                    {plan.durationDays ? t('days', { days: formatNumber(plan.durationDays, locale) }) : plan.fixedExpiresAt ? t('until', { date: formatDate(plan.fixedExpiresAt, locale, 'date') }) : null}
                  </p>
                  <Button asChild variant={plan.isHighlighted ? 'primary' : 'secondary'} className="mt-auto">
                    <Link href={`/enroll?plan=${encodeURIComponent(plan.code)}&kind=renewal`}>{t('renewWith')}</Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {results.visibleWhenInactive || accessState === 'active' ? (
          <Button asChild variant="secondary">
            <Link href="/results">{t('pastResults')}</Link>
          </Button>
        ) : null}
        {settings.contact.whatsapp ? (
          <Button asChild variant="ghost" leadingIcon={<MessageCircle aria-hidden className="size-4" />}>
            <a href={settings.contact.whatsapp} target="_blank" rel="noopener noreferrer">{t('support')}</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
