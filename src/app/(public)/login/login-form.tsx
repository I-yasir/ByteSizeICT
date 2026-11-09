'use client';

import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Countdown } from '@/components/ui/countdown';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { PinInput } from '@/components/ui/pin-input';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { studentLogin } from '@/features/auth/actions';
import { formatDate } from '@/lib/format';
import { mobileSchema } from '@/lib/validation';

type LoginReason = 'new_login' | 'admin' | 'pin_changed' | 'expired';

/** /login (PRD S-01, docs/02_AppFlow.md §4.7). */
export function LoginForm({ reason, next, whatsapp, serverNow }: { reason: LoginReason | null; next: string | null; whatsapp: string | null; serverNow: string }) {
  const t = useTranslations('login');
  const errorText = useErrorMessage();
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();

  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ text: string; suspended?: boolean } | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = mobileSchema.safeParse(mobile);
    if (!parsed.success) {
      setMobileError(errorText({ message: 'errors.mobileInvalid' }));
      return;
    }
    setMobileError(null);
    if (!/^\d{4,6}$/.test(pin)) {
      setFormError({ text: t('pinFormat') });
      return;
    }

    setSubmitting(true);
    try {
      const result = await studentLogin({ mobile, pin, remember, next: next ?? undefined });
      if (result.ok) {
        router.replace(result.data.redirectTo);
        router.refresh();
        return;
      }
      const { code, meta } = result.error;
      setPin('');
      if (code === 'LOCKED' && typeof meta?.lockedUntil === 'string') setLockedUntil(meta.lockedUntil);
      else if (code === 'INVALID_CREDENTIALS') setFormError({ text: errorText(result.error, { attemptsLeft: Number(meta?.attemptsLeft ?? 0) }) });
      else if (code === 'SUSPENDED') setFormError({ text: errorText(result.error), suspended: true });
      else setFormError({ text: errorText(result.error) });
      setSubmitting(false);
    } catch {
      setFormError({ text: t('network') });
      setSubmitting(false);
    }
  }

  // cleared by the countdown's onComplete when the lock expires
  const locked = lockedUntil !== null;

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {reason ? <Banner variant="info">{t(`reasons.${reason}`)}</Banner> : null}
      {locked ? (
        <Banner variant="danger" role="alert">
          {errorText({ message: 'errors.locked' }, { time: formatDate(lockedUntil, locale, 'time') })}{' '}
          <Countdown target={lockedUntil} serverNow={serverNow} onComplete={() => setLockedUntil(null)} />
        </Banner>
      ) : formError ? (
        <Banner variant="danger" role="alert">
          {formError.text}
          {formError.suspended && whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold underline">WhatsApp</a>
          ) : null}
        </Banner>
      ) : null}

      <Field label={t('mobile')} error={mobileError}>
        {(props) => (
          <Input
            {...props}
            name="mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            placeholder="01XXXXXXXXX"
            className="font-num"
            value={mobile}
            disabled={locked}
            onChange={(e) => setMobile(e.target.value)}
          />
        )}
      </Field>
      <Field label={t('pin')}>
        {(props) => <PinInput {...props} name="pin" value={pin} disabled={locked} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />}
      </Field>
      <Checkbox label={t('remember')} checked={remember} onCheckedChange={(value) => setRemember(value === true)} disabled={locked} />
      <Button type="submit" size="lg" fullWidth loading={submitting} disabled={locked}>
        {t('submit')}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Dialog>
          <DialogTrigger className="min-h-11 font-semibold text-primary hover:underline">{t('forgot')}</DialogTrigger>
          <DialogContent title={t('forgotTitle')} description={t('forgotBody')}>
            {whatsapp ? (
              <Button asChild fullWidth leadingIcon={<MessageCircle aria-hidden className="size-5" />}>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">{t('forgotCta')}</a>
              </Button>
            ) : null}
          </DialogContent>
        </Dialog>
        <span className="text-fg-muted">
          {t('noAccount')}{' '}
          <Link href="/#pricing" className="font-semibold text-primary hover:underline">{t('enrollLink')}</Link>
        </span>
      </div>
    </form>
  );
}
