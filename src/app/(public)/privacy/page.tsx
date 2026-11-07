import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getPublicSettings } from '@/features/public/queries';

/** /privacy (TRD §10.14): what is collected, why, retention, sharing, rights, contact. */
export const revalidate = 3600;

const SECTIONS = ['collect', 'use', 'retention', 'sharing', 'rights', 'contact'] as const;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('privacy'))('title') };
}

export default async function PrivacyPage() {
  const [t, settings] = await Promise.all([getTranslations('privacy'), getPublicSettings()]);
  const contact = settings.contact.email ?? settings.contact.whatsapp ?? settings.contact.phone ?? '';
  return (
    <article className="mx-auto max-w-app px-4 py-8 sm:px-6 lg:py-12">
      <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
      <p className="mt-1 text-sm text-fg-subtle">{t('intro', { brand: settings.brand.name })}</p>
      {SECTIONS.map((key) => (
        <section key={key} className="mt-8">
          <h2 className="text-xl font-semibold text-fg">{t(`${key}.title`)}</h2>
          <p className="mt-2 max-w-prose text-base whitespace-pre-line text-fg-muted">{t(`${key}.body`, { contact })}</p>
        </section>
      ))}
    </article>
  );
}
