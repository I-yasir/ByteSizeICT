'use client';

import { Copy, Library, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { useState } from 'react';
import { type Column, DataTable } from '@/components/admin/data-table';
import { useAction } from '@/components/admin/use-action';
import { RichText } from '@/components/content/rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { duplicateQuestion, setQuestionStatus } from '@/features/questions/actions';
import type { searchQuestions } from '@/features/questions/queries';
import { formatNumber } from '@/lib/format';
import { DeleteQuestionsDialog } from './delete-questions-dialog';

type Row = Awaited<ReturnType<typeof searchQuestions>>['items'][number];
const STATUS = { active: 'success', draft: 'neutral', archived: 'warning' } as const;

/** Question list + bulk actions (docs/02_AppFlow.md §6.5). */
export function QuestionsTable({ rows, hasFilters }: { rows: Row[]; hasFilters: boolean }) {
  const t = useTranslations('admin.questions');
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  const { run, pending } = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  // Remounting the table clears its internal selection after a delete.
  const [tableKey, setTableKey] = useState(0);

  const columns: Column<Row>[] = [
    { id: 'stem', header: t('cols.stem'), cell: (r) => <RichText html={r.stemHtml} className="line-clamp-2 max-w-md text-sm" />, className: 'max-w-md' },
    { id: 'chapter', header: t('cols.chapter'), cell: (r) => <span className="text-sm">{r.chapter ? `${r.chapter.number}. ${r.chapter.name_en}` : '—'}{r.topic ? <span className="block text-xs text-fg-muted">{r.topic.name_en}</span> : null}</span> },
    { id: 'used', header: t('cols.used'), cell: (r) => <span className="font-num">{formatNumber(r.times_used, locale)}×</span> },
    { id: 'correct', header: t('cols.correct'), cell: (r) => <span className="font-num">{r.correctPercent === null ? '—' : `${formatNumber(r.correctPercent, locale, 1)}%`}</span> },
    { id: 'status', header: t('cols.status'), cell: (r) => <Badge variant={STATUS[r.status]}>{t(`statuses.${r.status}`)}</Badge> },
    {
      id: 'actions',
      header: t('cols.actions'),
      cell: (r) => (
        <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button asChild size="icon" variant="ghost" aria-label={t('edit')}><Link href={`/admin/questions/${r.id}`}><Pencil aria-hidden className="size-4" /></Link></Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('duplicate')}
            onClick={async () => {
              const result = await run(() => duplicateQuestion({ id: r.id }), { success: t('duplicated'), refresh: false });
              if (result.ok) router.push(`/admin/questions/${result.data.id}`);
            }}
          >
            <Copy aria-hidden className="size-4" />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      {selected.length ? (
        <div className="sticky top-15 z-dropdown mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary-soft p-3">
          <span className="text-sm font-semibold text-primary">{t('selected', { n: selected.length })}</span>
          {(['active', 'draft', 'archived'] as const).map((s) => (
            <Button key={s} size="sm" variant="ghost" loading={pending} onClick={() => run(() => setQuestionStatus({ ids: selected, status: s }), { success: t('bulkDone') })}>{t(`setStatus.${s}`)}</Button>
          ))}
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft" leadingIcon={<Trash2 aria-hidden className="size-4" />} onClick={() => setDeleting(true)}>{t('delete.action')}</Button>
        </div>
      ) : null}
      <DataTable
        key={tableKey}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        onSelectionChange={setSelected}
        onRowClick={(r) => router.push(`/admin/questions/${r.id}`)}
        empty={<EmptyState icon={<Library />} title={hasFilters ? t('emptyFiltered') : t('emptyBank')} />}
      />
      {deleting ? (
        <DeleteQuestionsDialog
          ids={selected}
          bulk
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            setSelected([]);
            setTableKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
