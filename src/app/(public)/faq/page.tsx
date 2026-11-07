import { Mail, MessageCircle, MessagesSquare, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FaqList } from '@/components/marketing/sections';
import { Card } from '@/components/ui/card';
import { getPublicSettings } from '@/features/public/queries';

/** /faq (docs/02_AppFlow.md §4.6): accordion + contact card; contact only when there is no FAQ. */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('faqPage'))('title') };
}

export default async function FaqPage() {
  const [t, settings] = await Promise.all([getTranslations('faqPage'), getPublicSettings()]);
  const { contact } = settings;
  const channels = [
    contact.whatsapp && { href: contact.whatsapp, label: 'WhatsApp', Icon: MessageCircle, external: true },
    contact.messenger && { href: contact.messenger, label: 'Messenger', Icon: MessagesSquare, external: true },
    contact.phone && { href: `tel:${contact.phone}`, label: contact.phone, Icon: Phone, external: false },
    contact.email && { href: `mailto:${contact.email}`, label: contact.email, Icon: Mail, external: false },
  ].filter((c): c is { href: string; label: string; Icon: typeof Mail; external: boolean } => Boolean(c));

  return (
    <div className="mx-auto grid max-w-marketing gap-8 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-8 lg:py-12">
      <div className="lg:col-span-2">
        <h1 className="text-2xl font-bold text-fg lg:text-3xl">{t('title')}</h1>
        <p className="mt-1 mb-6 text-base text-fg-muted">{t('subtitle')}</p>
        {settings.faq.length > 0 ? <FaqList items={settings.faq} /> : <p className="text-fg-muted">{t('empty')}</p>}
      </div>
      <aside>
        <Card>
          <h2 className="text-lg font-semibold text-fg">{t('contactTitle')}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t('contactBody')}</p>
          <ul className="mt-4 flex flex-col gap-1">
            {channels.map(({ href, label, Icon, external }) => (
              <li key={href}>
                <a
                  href={href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="flex min-h-12 items-center gap-3 rounded-md px-2 text-base text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <Icon aria-hidden className="size-5 text-primary" />
                  <span className="font-num">{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
