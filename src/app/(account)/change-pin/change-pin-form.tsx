'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { PinInput } from '@/components/ui/pin-input';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { changePinForced } from '@/features/auth/actions';

/** Forced first-login PIN change (PRD S-02, docs/02_AppFlow.md §5.1). */
export function ChangePinForm() {
  const t = useTranslations('changePin');
  const errorText = useErrorMessage();
  const router = useRouter();
  const [newPin, setNewPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ newPin?: string; confirm?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(newPin)) return setErrors({ newPin: t('rules') });
    if (newPin !== confirm) return setErrors({ confirm: t('mismatch') });
    setErrors({});
    setSubmitting(true);
    try {
      const result = await changePinForced({ newPin, confirm });
      if (result.ok) {
        notify.success(t('success'));
        // No router.refresh(): refreshing /change-pin (which now redirects) races this navigation
        // and leaves the client router stuck on the old page (found by P4.02).
        router.replace(result.data.redirectTo);
        return;
      }
      if (result.error.code === 'PIN_TOO_WEAK' || result.error.code === 'PIN_SAME_AS_OLD') setErrors({ newPin: errorText(result.error) });
      else if (result.error.code === 'UNAUTHENTICATED' || result.error.code === 'SESSION_REVOKED') router.replace('/login?reason=expired');
      else setErrors({ form: errorText(result.error) });
    } catch {
      setErrors({ form: errorText({ message: 'errors.internal' }) });
    }
    setSubmitting(false);
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {errors.form ? <Banner variant="danger">{errors.form}</Banner> : null}
      <Field label={t('newPin')} helper={t('rules')} error={errors.newPin}>
        {(props) => <PinInput {...props} autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))} />}
      </Field>
      <Field label={t('confirm')} error={errors.confirm}>
        {(props) => <PinInput {...props} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} />}
      </Field>
      <Button type="submit" size="lg" fullWidth loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
