import { CalendarX, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlanCard } from '@/components/marketing/plan-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { getActivePlans, getPublicSettings } from '@/features/public/queries';

/**
 * /routine (docs/02_AppFlow.md §4.2, D4): every active plan's routine PDF. Exams are no longer public
 * (CR5); a logged-in student's personal routine is added above this list in V2.34.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('routinePage'))('title') };
}

export default async function RoutinePage() {
  const [t, plans, settings] = await Promise.all([getTranslations('routinePage'), getActivePlans(), getPublicSettings()]);
  return (
    <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-base text-fg-muted">{t('subtitle')}</p>

      <div className="mt-6">
        {plans.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id}>
                <PlanCard plan={plan} routineFallback />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<CalendarX />}
            title={t('empty')}
            description={settings.contact.whatsapp ? t('followUs') : undefined}
            action={
              settings.contact.whatsapp ? (
                <Button asChild variant="secondary" leadingIcon={<MessageCircle aria-hidden className="size-4" />}>
                  <a href={settings.contact.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </Button>
              ) : null
            }
          />
        )}
      </div>
    </div>
  );
}
