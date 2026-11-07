'use client';

import { Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { type Column, DataTable } from '@/components/admin/data-table';
import { STATE_BADGE } from '@/components/admin/badges';
import { useAction } from '@/components/admin/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/misc';
import { extendStudents } from '@/features/students/actions';
import type { listStudents } from '@/features/students/queries';
import { formatDate, formatNumber } from '@/lib/format';

type Row = Awaited<ReturnType<typeof listStudents>>['items'][number];

/** Students table with selection + bulk "extend by N days" (docs/02_AppFlow.md §6.4). */
export function StudentsTable({ rows }: { rows: Row[] }) {
  const t = useTranslations('admin.students');
  const locale = useLocale() as 'bn' | 'en';
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState('7');
  const { run, pending } = useAction();

  const columns: Column<Row>[] = [
    { id: 'mobile', header: t('cols.mobile'), cell: (r) => <Link href={`/admin/students/${r.id}`} className="font-num font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{r.mobile}</Link> },
    { id: 'email', header: t('cols.email'), cell: (r) => <span className="break-all">{r.email}</span>, desktopOnly: true },
    { id: 'label', header: t('cols.label'), cell: (r) => r.admin_label ?? '—' },
    { id: 'state', header: t('cols.state'), cell: (r) => <Badge variant={STATE_BADGE[r.accessState]}>{t(`states.${r.accessState}`)}</Badge> },
    { id: 'expiry', header: t('cols.expiry'), cell: (r) => <span className="font-num text-sm">{formatDate(r.access_expires_at, locale, 'date')}</span> },
    { id: 'login', header: t('cols.lastLogin'), cell: (r) => <span className="font-num text-xs text-fg-muted">{r.last_login_at ? formatDate(r.last_login_at, locale, 'dateTime') : '—'}</span>, desktopOnly: true },
    { id: 'exams', header: t('cols.exams'), cell: (r) => <span className="font-num">{formatNumber(r.examsTaken, locale)}</span> },
  ];

  return (
    <>
      {selected.length ? (
        <div className="sticky top-15 z-dropdown mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft p-3">
          <span className="text-sm font-semibold text-primary">{t('selected', { n: selected.length })}</span>
          <label className="ml-auto flex items-center gap-2 text-sm">
            {t('extendBy')}
            <Input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="h-10 w-24" />
            {t('days')}
          </label>
          <Button
            size="sm"
            loading={pending}
            onClick={() => run(() => extendStudents({ studentIds: selected, days: Number(days) }), { success: t('extended', { n: selected.length }) })}
          >
            {t('extend')}
          </Button>
        </div>
      ) : null}
      <DataTable rows={rows} columns={columns} getRowId={(r) => r.id} selectable onSelectionChange={setSelected} empty={<EmptyState icon={<Users />} title={t('empty')} />} />
    </>
  );
}
