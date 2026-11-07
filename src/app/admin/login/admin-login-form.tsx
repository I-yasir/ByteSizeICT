'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { adminLogin } from '@/features/auth/actions';
import { formatDate } from '@/lib/format';

/** /admin/login (PRD A-01, docs/02_AppFlow.md §6.1). No attempts-left disclosure for admins. */
export function AdminLoginForm({ next }: { next: string | null }) {
  const t = useTranslations('adminLogin');
  const errorText = useErrorMessage();
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await adminLogin({ email, password, next: next ?? undefined });
      if (result.ok) {
        router.replace(result.data.redirectTo);
        router.refresh();
        return;
      }
      const lockedUntil = result.error.meta?.lockedUntil;
      setError(
        result.error.code === 'LOCKED' && typeof lockedUntil === 'string'
          ? errorText(result.error, { time: formatDate(lockedUntil, locale, 'time') })
          : errorText(result.error),
      );
    } catch {
      setError(errorText({ message: 'errors.internal' }));
    }
    setPassword('');
    setSubmitting(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Banner variant="danger" role="alert">{error}</Banner> : null}
      <Field label={t('email')}>
        {(props) => <Input {...props} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />}
      </Field>
      <Field label={t('password')}>
        {(props) => <Input {...props} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
