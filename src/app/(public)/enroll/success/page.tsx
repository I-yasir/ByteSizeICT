import { CircleCheck, Clock, KeyRound, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { hasSampleExam } from '@/features/sample/queries';

/** /enroll/success (docs/02_AppFlow.md §4.4) — stateless; renders even when visited directly. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('enrollSuccess'))('title') };
}

export default async function EnrollSuccessPage() {
  const [t, sample] = await Promise.all([getTranslations('enrollSuccess'), hasSampleExam()]);
  const steps = [
    { Icon: Clock, text: t('next.verify') },
    { Icon: Mail, text: t('next.email') },
    { Icon: KeyRound, text: t('next.login') },
  ];
  return (
    <div className="mx-auto flex max-w-form flex-col items-center px-4 py-12 text-center">
      <span aria-hidden className="flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
        <CircleCheck className="size-10" />
      </span>
      <h1 className="mt-6 text-2xl font-bold text-fg">{t('title')}</h1>
      <p className="mt-2 text-base text-fg-muted">{t('body')}</p>
      <Card className="mt-8 w-full text-left">
        <h2 className="font-semibold text-fg">{t('next.title')}</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {steps.map(({ Icon, text }, i) => (
            <li key={i} className="flex gap-3 text-sm text-fg-muted">
              <Icon aria-hidden className="size-5 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ol>
      </Card>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {sample ? (
          <Button asChild size="lg">
            <Link href="/sample">{t('trySample')}</Link>
          </Button>
        ) : null}
        <Button asChild size="lg" variant="secondary">
          <Link href="/">{t('backHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
