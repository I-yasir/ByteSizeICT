import { Mail, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SettingValue } from '@/features/settings/schemas';

export async function PublicFooter({ brandName, contact }: { brandName: string; contact: SettingValue<'contact'> }) {
  const t = await getTranslations();
  return (
    <footer className="border-t border-border bg-surface pb-24 md:pb-0">
      <div className="mx-auto grid max-w-marketing gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="text-lg font-bold text-fg">{brandName}</p>
          <p className="mt-2 text-sm text-fg-muted">{t('footer.tagline')}</p>
        </div>
        <nav aria-label={t('footer.links')} className="flex flex-col gap-1 text-sm">
          <Link className="min-h-11 content-center text-fg-muted hover:text-fg" href="/#pricing">{t('nav.enroll')}</Link>
          <Link className="min-h-11 content-center text-fg-muted hover:text-fg" href="/routine">{t('nav.routine')}</Link>
          <Link className="min-h-11 content-center text-fg-muted hover:text-fg" href="/faq">{t('nav.faq')}</Link>
          <Link className="min-h-11 content-center text-fg-muted hover:text-fg" href="/privacy">{t('footer.privacy')}</Link>
        </nav>
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-fg">{t('footer.contact')}</p>
          {contact.whatsapp ? (
            <a className="inline-flex min-h-11 items-center gap-2 text-fg-muted hover:text-fg" href={contact.whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden className="size-4" /> WhatsApp
            </a>
          ) : null}
          {contact.phone ? (
            <a className="inline-flex min-h-11 items-center gap-2 font-num text-fg-muted hover:text-fg" href={`tel:${contact.phone}`}>
              <Phone aria-hidden className="size-4" /> {contact.phone}
            </a>
          ) : null}
          {contact.email ? (
            <a className="inline-flex min-h-11 items-center gap-2 text-fg-muted hover:text-fg" href={`mailto:${contact.email}`}>
              <Mail aria-hidden className="size-4" /> {contact.email}
            </a>
          ) : null}
        </div>
      </div>
      <p className="border-t border-border px-4 py-4 text-center text-xs text-fg-subtle">
        {t('footer.rights', { year: new Date().getFullYear().toString(), brand: brandName })}
      </p>
    </footer>
  );
}
