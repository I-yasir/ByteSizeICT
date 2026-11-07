'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState, useTransition } from 'react';
import { LanguageToggle, ThemeToggle } from '@/components/layout/toggles';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { PinInput } from '@/components/ui/pin-input';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { changePin, studentLogout } from '@/features/auth/actions';

/** Profile settings + Change PIN + Log out (docs/02_AppFlow.md §5.7). */
export function ProfileSettings() {
  const t = useTranslations('profile');
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-semibold text-fg">{t('settings')}</h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-fg-muted">{t('language')}</span>
        <LanguageToggle withLabel />
        <span className="ml-4 text-sm text-fg-muted">{t('theme')}</span>
        <ThemeToggle withLabel />
      </div>
    </Card>
  );
}

export function ChangePinCard() {
  const t = useTranslations('profile');
  const errorText = useErrorMessage();
  const [values, setValues] = useState({ currentPin: '', newPin: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof values | 'form', string>>>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value.replace(/\D/g, '') }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (values.newPin !== values.confirm) return setErrors({ confirm: t('mismatch') });
    setErrors({});
    setSaving(true);
    try {
      const result = await changePin(values);
      if (result.ok) {
        notify.success(t('pinChanged'));
        setValues({ currentPin: '', newPin: '', confirm: '' });
      } else if (result.error.field === 'currentPin') setErrors({ currentPin: t('wrongCurrent') });
      else if (result.error.field) setErrors({ [result.error.field]: errorText(result.error) });
      else setErrors({ form: errorText(result.error) });
    } catch {
      setErrors({ form: errorText({ message: 'errors.internal' }) });
    }
    setSaving(false);
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-fg">{t('changePin')}</h2>
      <form noValidate onSubmit={onSubmit} className="flex max-w-form flex-col gap-4">
        {errors.form ? <p className="text-sm text-danger">{errors.form}</p> : null}
        <Field label={t('currentPin')} error={errors.currentPin}>{(p) => <PinInput {...p} value={values.currentPin} onChange={set('currentPin')} />}</Field>
        <Field label={t('newPin')} helper={t('pinRules')} error={errors.newPin}>{(p) => <PinInput {...p} autoComplete="new-password" value={values.newPin} onChange={set('newPin')} />}</Field>
        <Field label={t('confirmPin')} error={errors.confirm}>{(p) => <PinInput {...p} autoComplete="new-password" value={values.confirm} onChange={set('confirm')} />}</Field>
        <Button type="submit" loading={saving} className="self-start">{t('savePin')}</Button>
      </form>
    </Card>
  );
}

export function LogoutButton() {
  const t = useTranslations('profile');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={pending}
      leadingIcon={<LogOut aria-hidden className="size-4" />}
      onClick={() =>
        startTransition(async () => {
          const result = await studentLogout();
          router.replace(result.ok ? result.data.redirectTo : '/login');
          router.refresh();
        })
      }
    >
      {t('logout')}
    </Button>
  );
}
