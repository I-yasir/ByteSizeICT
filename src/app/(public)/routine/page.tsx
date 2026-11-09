import { CalendarClock, CalendarX, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PlanCard } from '@/components/marketing/plan-card';
import { RoutineDays } from '@/components/student/routine-days';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { getStudentExamCards } from '@/features/exams/student-queries';
import { getActivePlans, getPublicSettings } from '@/features/public/queries';
import { getOptionalStudent } from '@/lib/auth/guards';
import { startOfDhakaDay } from '@/lib/time';

/**
 * /routine (docs/02_AppFlow.md §4.2, D4): every active plan's routine PDF for everyone; a logged-in
 * student first sees "Your routine" — their own exams (audience by plan) from today on. Visitors never
 * get exam data (CR5).
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('routinePage'))('title') };
}

export default async function RoutinePage() {
  const [t, plans, settings, session] = await Promise.all([getTranslations('routinePage'), getActivePlans(), getPublicSettings(), getOptionalStudent()]);
  const today = startOfDhakaDay().getTime();
  const mine = session ? (await getStudentExamCards(session.student.id)).filter((card) => Date.parse(card.startsAt) >= today) : null;

  return (
    <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-base text-fg-muted">{t('subtitle')}</p>

      {mine ? (
        <section aria-labelledby="your-routine" className="mt-8" data-testid="your-routine">
          <h2 id="your-routine" className="mb-4 text-xl font-semibold text-fg">{t('yours')}</h2>
          {mine.length > 0 ? <RoutineDays cards={mine} /> : <EmptyState icon={<CalendarClock />} title={t('yoursEmpty')} />}
        </section>
      ) : null}

      <section aria-labelledby="plan-routines" className="mt-8">
        <h2 id="plan-routines" className="mb-4 text-xl font-semibold text-fg">{t('plans')}</h2>
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
      </section>
    </div>
  );
}
