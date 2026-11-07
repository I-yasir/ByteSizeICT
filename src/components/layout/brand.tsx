import { GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Logo (left of every header): the uploaded logo or an icon + brand name. */
export function Brand({ name, logoUrl, href, className }: { name: string; logoUrl?: string | null; href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn('inline-flex min-h-11 items-center gap-2 rounded-md text-lg font-bold text-fg focus-visible:outline-2 focus-visible:outline-focus-ring', className)}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo from public storage; sizes unknown
        <img src={logoUrl} alt="" className="h-7 w-auto" />
      ) : (
        <span aria-hidden className="flex size-8 items-center justify-center rounded-md bg-primary text-on-primary">
          <GraduationCap className="size-5" />
        </span>
      )}
      <span>{name}</span>
    </Link>
  );
}
