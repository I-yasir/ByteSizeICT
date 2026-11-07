'use client';

import { ErrorView } from '@/components/layout/boundaries';

/** Answers stay in localStorage, so "try again" resumes where the student left off. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} homeHref="/dashboard" />;
}
