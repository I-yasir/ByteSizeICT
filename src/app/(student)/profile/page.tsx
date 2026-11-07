import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getStudentPlanName } from '@/features/students/queries';
import { requireStudent } from '@/lib/auth/guards';
import { formatDate } from '@/lib/format';
import { ChangePinCard, LogoutButton, ProfileSettings } from './profile-client';

/** /profile (PRD S-14/S-15, docs/02_AppFlow.md §5.7). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('profile'))('title') };
}

export default async function ProfilePage() {
  const { student, accessState } = await requireStudent({ currentPath: '/profile' });
  const [t, td, locale, plan] = await Promise.all([
    getTranslations('profile'),
    getTranslations('dashboard'),
    getLocale() as Promise<'bn' | 'en'>,
    getStudentPlanName(student.plan_id),
  ]);
  const rows = [
    [t('mobile'), student.mobile],
    [t('email'), student.email],
    [t('plan'), plan ? (locale === 'bn' ? plan.name_bn : plan.name_en) : '—'],
    [t('startsAt'), formatDate(student.access_starts_at, locale, 'date')],
    [t('expiresAt'), formatDate(student.access_expires_at, locale, 'date')],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-fg">{t('title')}</h1>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-fg">{t('account')}</h2>
          <Badge variant={accessState === 'active' ? 'success' : 'danger'}>{td(`state.${accessState}`)}</Badge>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="font-num font-medium break-all text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-fg-subtle">{t('emailNote')}</p>
      </Card>
      <ProfileSettings />
      <ChangePinCard />
      <div>
        <LogoutButton />
      </div>
    </div>
  );
}
