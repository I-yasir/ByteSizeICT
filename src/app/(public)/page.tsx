import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { HeroIllustration } from '@/components/marketing/hero-illustration';
import { FaqPreview, HowItWorks, Pricing, SampleCta, SocialProof, WhyJoin } from '@/components/marketing/sections';
import { Button } from '@/components/ui/button';
import { getActivePlans, getPublicSettings } from '@/features/public/queries';
import { hasSampleExam } from '@/features/sample/queries';

/** Homepage (PRD V-01, V-04…, docs/02_AppFlow.md §4.1). */
export const revalidate = 60;

export default async function HomePage() {
  const [t, locale, settings, plans, sampleAvailable] = await Promise.all([
    getTranslations('home'),
    getLocale() as Promise<'bn' | 'en'>,
    getPublicSettings(),
    getActivePlans(),
    hasSampleExam(),
  ]);
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
              <Link href="/#pricing">{t('hero.enroll')}</Link>
            </Button>
            {sampleAvailable ? (
              <Button asChild size="lg" variant="secondary">
                <Link href="/sample">{t('hero.trial')}</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <HeroIllustration className="mx-auto hidden w-full max-w-sm md:block" />
      </section>

      {/* 2–8 (R1.1: no exam strip or routine section: exams are shown only to students) */}
      <WhyJoin />
      <SocialProof homepage={settings.homepage} />
      <HowItWorks />
      <Pricing plans={plans} whatsapp={settings.contact.whatsapp} />
      {sampleAvailable ? <SampleCta /> : null}
      <FaqPreview items={settings.faq} />
    </>
  );
}
