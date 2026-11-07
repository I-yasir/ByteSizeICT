'use client';

import { ErrorView } from '@/components/layout/boundaries';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} homeHref="/admin" />;
}
