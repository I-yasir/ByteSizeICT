import { CalendarX, ChevronDown, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { RoutineList } from '@/components/marketing/routine-list';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { getPublicSettings, getRoutine } from '@/features/public/queries';

/** /routine (docs/02_AppFlow.md §4.2). */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('routinePage'))('title') };
}

export default async function RoutinePage() {
  const [t, routine, settings] = await Promise.all([getTranslations('routinePage'), getRoutine(), getPublicSettings()]);
  return (
    <div className="mx-auto max-w-marketing px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-base text-fg-muted">{t('subtitle')}</p>

      <div className="mt-6">
        {routine.upcoming.length > 0 ? (
          <RoutineList days={routine.upcoming} />
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

      {routine.recent.length > 0 ? (
        <details className="group mt-10">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-base font-semibold text-fg-muted">
            <ChevronDown aria-hidden className="size-5 transition-transform duration-180 group-open:rotate-180" />
            {t('recent')}
          </summary>
          <div className="mt-4 opacity-80">
            <RoutineList days={routine.recent} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
