import type { ReactNode } from 'react';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { StickyEnrollBar, WhatsAppFab } from '@/components/layout/public-chrome';
import { getPublicSettings } from '@/features/public/queries';
import { Analytics } from '@vercel/analytics/next';
import { Toaster } from '@/components/ui/toast';

/** Public chrome (docs/02_AppFlow.md §2): header, footer, sticky Enroll bar (mobile), WhatsApp FAB. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const settings = await getPublicSettings();
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader brandName={settings.brand.name} logoUrl={settings.logoUrl} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PublicFooter brandName={settings.brand.name} contact={settings.contact} />
      <StickyEnrollBar />
      <WhatsAppFab href={settings.contact.whatsapp} />
      <Toaster />
      <Analytics />
    </div>
  );
}
