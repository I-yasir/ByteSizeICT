import { Plus, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { searchQuestions } from '@/features/questions/queries';
import { getTaxonomy } from '@/features/taxonomy/queries';
import { QuestionsTable } from './questions-table';

/** /admin/questions (PRD A-06/A-09, docs/02_AppFlow.md §6.5). Filters are GET params (survive reload). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.questions'))('title') };
}

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const many = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean);

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = many(sp.status).filter((s): s is 'draft' | 'active' | 'archived' => ['draft', 'active', 'archived'].includes(s));
  const filters = {
    subjectId: one(sp.subject),
    chapterId: one(sp.chapter),
    status: status.length ? status : (['active', 'draft'] as ('draft' | 'active' | 'archived')[]),
    unusedOnly: one(sp.unused) === '1',
    q: one(sp.q),
    sort: (one(sp.sort) ?? 'newest') as 'newest' | 'most_used' | 'lowest_correct',
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
  const [t, taxonomy] = await Promise.all([getTranslations('admin.questions'), getTaxonomy()]);
  const valid = (id: string | undefined) => (id && /^[0-9a-f-]{36}$/i.test(id) ? id : undefined);
  const data = await searchQuestions({ ...filters, subjectId: valid(filters.subjectId), chapterId: valid(filters.chapterId) });
  const params = Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'page').map(([k, v]) => [k, one(v)]));

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <Button asChild variant="secondary" leadingIcon={<Upload aria-hidden className="size-4" />}><Link href="/admin/questions/import">{t('import')}</Link></Button>
            <Button asChild leadingIcon={<Plus aria-hidden className="size-4" />}><Link href="/admin/questions/new">{t('new')}</Link></Button>
          </>
        }
      />
      <form method="get" className="mb-4 grid gap-2 rounded-lg bg-surface p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Input name="q" defaultValue={filters.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="lg:col-span-2" />
        <Select name="chapter" defaultValue={filters.chapterId ?? ''} aria-label={t('chapter')}>
          <option value="">{t('allChapters')}</option>
          {taxonomy.subjects.map((s) => (
            <optgroup key={s.id} label={s.name_en}>
              {s.chapters.map((c) => <option key={c.id} value={c.id}>{c.number}. {c.name_en}</option>)}
            </optgroup>
          ))}
        </Select>
        <Select name="sort" defaultValue={filters.sort} aria-label={t('sort')}>
          {(['newest', 'most_used', 'lowest_correct'] as const).map((d) => <option key={d} value={d}>{t(`sorts.${d}`)}</option>)}
        </Select>
        <fieldset className="flex flex-wrap items-center gap-x-3 text-sm sm:col-span-2 lg:col-span-3">
          <legend className="sr-only">{t('status')}</legend>
          {(['active', 'draft', 'archived'] as const).map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-1.5">
              <input type="checkbox" name="status" value={s} defaultChecked={filters.status.includes(s)} className="size-4 accent-primary" />
              {t(`statuses.${s}`)}
            </label>
          ))}
          <label className="flex min-h-11 items-center gap-1.5">
            <input type="checkbox" name="unused" value="1" defaultChecked={filters.unusedOnly} className="size-4 accent-primary" />
            {t('unusedOnly')}
          </label>
        </fieldset>
        <Button type="submit" variant="secondary" className="lg:col-start-4">{t('apply')}</Button>
      </form>
      <QuestionsTable rows={data.items} hasFilters={Object.keys(params).length > 0} />
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        basePath="/admin/questions"
        params={params}
        labels={{ showing: t('showing', { from: data.total ? (data.page - 1) * data.pageSize + 1 : 0, to: Math.min(data.page * data.pageSize, data.total), total: data.total }), prev: t('prev'), next: t('next') }}
      />
    </>
  );
}
