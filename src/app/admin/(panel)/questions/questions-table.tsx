'use client';

import { Copy, Library, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { type Column, DataTable } from '@/components/admin/data-table';
import { useAction } from '@/components/admin/use-action';
import { RichText } from '@/components/content/rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/misc';
import { bulkTag, duplicateQuestion, setQuestionStatus } from '@/features/questions/actions';
import type { searchQuestions } from '@/features/questions/queries';
import { formatNumber } from '@/lib/format';

type Row = Awaited<ReturnType<typeof searchQuestions>>['items'][number];
const DIFFICULTY = { easy: 'success', medium: 'warning', hard: 'danger' } as const;
const STATUS = { active: 'success', draft: 'neutral', archived: 'warning' } as const;

/** Question list + bulk actions (docs/02_AppFlow.md §6.5). */
export function QuestionsTable({ rows, tags, hasFilters }: { rows: Row[]; tags: { id: string; name: string }[]; hasFilters: boolean }) {
  const t = useTranslations('admin.questions');
  const locale = useLocale() as 'bn' | 'en';
  const router = useRouter();
  const { run, pending } = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [tagId, setTagId] = useState('');

  const columns: Column<Row>[] = [
    { id: 'stem', header: t('cols.stem'), cell: (r) => <RichText html={r.stemHtml} className="line-clamp-2 max-w-md text-sm" />, className: 'max-w-md' },
    { id: 'chapter', header: t('cols.chapter'), cell: (r) => <span className="text-sm">{r.chapter ? `${r.chapter.number}. ${r.chapter.name_en}` : '—'}{r.topic ? <span className="block text-xs text-fg-muted">{r.topic.name_en}</span> : null}</span> },
    { id: 'difficulty', header: t('cols.difficulty'), cell: (r) => <Badge variant={DIFFICULTY[r.difficulty]}>{t(`difficulties.${r.difficulty}`)}</Badge> },
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
          <Select value={tagId} onChange={(e) => setTagId(e.target.value)} aria-label={t('tags')} className="h-10 w-44">
            <option value="">{t('chooseTag')}</option>
            {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </Select>
          <Button size="sm" variant="secondary" disabled={!tagId} loading={pending} onClick={() => run(() => bulkTag({ ids: selected, tagIds: [tagId], op: 'add' }), { success: t('bulkDone') })}>{t('addTag')}</Button>
          <Button size="sm" variant="secondary" disabled={!tagId} loading={pending} onClick={() => run(() => bulkTag({ ids: selected, tagIds: [tagId], op: 'remove' }), { success: t('bulkDone') })}>{t('removeTag')}</Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
          {(['active', 'draft', 'archived'] as const).map((s) => (
            <Button key={s} size="sm" variant="ghost" loading={pending} onClick={() => run(() => setQuestionStatus({ ids: selected, status: s }), { success: t('bulkDone') })}>{t(`setStatus.${s}`)}</Button>
          ))}
        </div>
      ) : null}
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        selectable
        onSelectionChange={setSelected}
        onRowClick={(r) => router.push(`/admin/questions/${r.id}`)}
        empty={<EmptyState icon={<Library />} title={hasFilters ? t('emptyFiltered') : t('emptyBank')} />}
      />
    </>
  );
}
