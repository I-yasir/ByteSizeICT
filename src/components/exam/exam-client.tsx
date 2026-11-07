'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/misc';
import type { ExamPageProps } from './exam-page';

/**
 * Client-only exam page: local answers are restored synchronously from localStorage in state
 * initialisers, which would otherwise mismatch the server render.
 */
export function ExamSkeleton() {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto flex max-w-exam flex-col gap-3 px-4 pt-4">
        <Skeleton className="h-16" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}

const ExamPage = dynamic(() => import('./exam-page'), { ssr: false, loading: ExamSkeleton });

export function ExamClient(props: ExamPageProps) {
  return <ExamPage {...props} />;
}
