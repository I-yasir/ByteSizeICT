'use client';

import { useRouter } from 'next/navigation';
import { Countdown } from '@/components/ui/countdown';

/** Countdown that refreshes the server component when it reaches zero (status changes server-side). */
export function InlineCountdown({ target, serverNow, className }: { target: string; serverNow: string; className?: string }) {
  const router = useRouter();
  return <Countdown target={target} serverNow={serverNow} onComplete={() => router.refresh()} className={className} />;
}
