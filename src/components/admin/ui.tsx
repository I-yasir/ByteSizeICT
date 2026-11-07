import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Small server-safe building blocks for admin pages. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatTile({ label, value, href, highlight = false }: { label: string; value: string; href?: string; highlight?: boolean }) {
  const body = (
    <>
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={cn('font-num text-2xl font-bold', highlight ? 'text-danger' : 'text-fg')}>{value}</span>
    </>
  );
  const className = cn('flex flex-col gap-1 rounded-lg bg-surface p-4 shadow-sm', highlight && 'ring-2 ring-danger', href && 'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus-ring');
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** "Showing 1–25 of 312" + prev/next links, preserving other query params. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
  labels: { showing: string; prev: string; next: string };
}) {
  const href = (p: number) => {
    const search = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1])));
    return `${basePath}?${search.toString()}`;
  };
  const last = Math.max(1, Math.ceil(total / pageSize));
  const link = 'inline-flex size-11 items-center justify-center rounded-md border border-border-strong bg-surface text-fg hover:bg-surface-2';
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-fg-muted">
      <span className="font-num">{labels.showing}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} aria-label={labels.prev} className={link}><ChevronLeft aria-hidden className="size-5" /></Link>
        ) : null}
        {page < last ? (
          <Link href={href(page + 1)} aria-label={labels.next} className={link}><ChevronRight aria-hidden className="size-5" /></Link>
        ) : null}
      </div>
    </div>
  );
}

/** Pill-style link filters (status/phase chips). */
export function FilterChips({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-semibold',
            item.active ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-fg-muted hover:bg-surface-2',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
