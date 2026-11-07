import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { HeroIllustration } from '@/components/marketing/hero-illustration';
import { NextExamStrip } from '@/components/marketing/next-exam-strip';
import { RoutineList } from '@/components/marketing/routine-list';
import { FaqPreview, HowItWorks, Pricing, SampleCta, Section, SocialProof, WhyJoin } from '@/components/marketing/sections';
import { Button } from '@/components/ui/button';
import { EmptyState, SectionHeading } from '@/components/ui/misc';
import { getActivePlans, getNextExam, getPublicSettings, getRoutine } from '@/features/public/queries';
import { hasSampleExam } from '@/features/sample/queries';
import { CalendarX } from 'lucide-react';

/** Homepage (PRD V-01…V-04, docs/02_AppFlow.md §4.1). */
export const revalidate = 60;

export default async function HomePage() {
  const [t, locale, settings, nextExam, routine, plans, sampleAvailable] = await Promise.all([
    getTranslations('home'),
    getLocale() as Promise<'bn' | 'en'>,
    getPublicSettings(),
    getNextExam(),
    getRoutine({ limit: 10, days: 14 }),
    getActivePlans(),
    hasSampleExam(),
  ]);
  const serverNow = new Date().toISOString();
  const heroTitle = settings.homepage.heroTitle?.[locale] ?? t('hero.title');
  const heroSubtitle = settings.homepage.heroSubtitle?.[locale] ?? t('hero.subtitle');

  return (
    <>
      {/* 1 Hero */}
      <section className="mx-auto grid max-w-marketing items-center gap-8 px-4 pt-8 pb-6 sm:px-6 md:grid-cols-2 lg:px-8 lg:pt-16">
        <div>
          <h1 className="text-4xl font-bold text-fg lg:text-display">{heroTitle}</h1>
          <p className="mt-4 text-lg text-fg-muted">{heroSubtitle}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/enroll">{t('hero.enroll')}</Link>
            </Button>
            {sampleAvailable ? (
              <Button asChild size="lg" variant="secondary">
                <Link href="/sample">{t('hero.trySample')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <HeroIllustration className="mx-auto hidden w-full max-w-sm md:block" />
      </section>

      {/* 2 Live routine strip */}
      {nextExam ? (
        <div className="mx-auto max-w-marketing px-4 sm:px-6 lg:px-8">
          <NextExamStrip exam={nextExam} serverNow={serverNow} />
        </div>
      ) : null}

      {/* 3 Routine */}
      <Section id="routine">
        <div id="routine-title">
          <SectionHeading
            title={t('routine.title')}
            subtitle={t('routine.subtitle')}
            action={
              routine.upcoming.length > 0 ? (
                <Button asChild variant="ghost">
                  <Link href="/routine">{t('routine.seeAll')}</Link>
                </Button>
              ) : null
            }
          />
        </div>
        {routine.upcoming.length > 0 ? (
          <RoutineList days={routine.upcoming} />
        ) : (
          <EmptyState
            icon={<CalendarX />}
            title={t('routine.empty')}
            description={settings.contact.whatsapp ? t('routine.followUs') : undefined}
            action={
              settings.contact.whatsapp ? (
                <Button asChild variant="secondary" leadingIcon={<MessageCircle aria-hidden className="size-4" />}>
                  <a href={settings.contact.whatsapp} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </Button>
              ) : null
            }
          />
        )}
      </Section>

      {/* 4–9 */}
      <WhyJoin />
      <SocialProof homepage={settings.homepage} />
      <HowItWorks />
      <Pricing plans={plans} />
      {sampleAvailable ? <SampleCta /> : null}
      <FaqPreview items={settings.faq} />
    </>
  );
}
