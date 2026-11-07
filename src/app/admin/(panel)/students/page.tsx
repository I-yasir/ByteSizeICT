import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterChips, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { listStudentLabels, listStudents } from '@/features/students/queries';
import { StudentsTable } from './students-table';

/** /admin/students (PRD A-05, docs/02_AppFlow.md §6.4). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.students'))('title') };
}

const STATES = ['all', 'active', 'expired', 'cancelled', 'suspended'] as const;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ state?: string; label?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const state = (STATES as readonly string[]).includes(sp.state ?? '') ? (sp.state as (typeof STATES)[number]) : 'all';
  const page = Math.max(1, Number(sp.page) || 1);
  const [t, data, labels] = await Promise.all([
    getTranslations('admin.students'),
    listStudents({ state, label: sp.label || undefined, q: sp.q, page }),
    listStudentLabels(),
  ]);
  const base = { label: sp.label, q: sp.q };
  const qs = (s: string) => `/admin/students?${new URLSearchParams(Object.entries({ ...base, state: s }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

  return (
    <>
      <PageHeader title={t('title')} />
      <FilterChips items={STATES.map((s) => ({ href: qs(s), label: t(`states.${s}`), active: s === state }))} />
      <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="state" value={state} />
        <Input name="q" defaultValue={sp.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="sm:max-w-sm" />
        <Select name="label" defaultValue={sp.label ?? ''} aria-label={t('label')} className="sm:max-w-48">
          <option value="">{t('allLabels')}</option>
          {labels.map((label) => (
            <option key={label} value={label}>{label}</option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">{t('apply')}</Button>
      </form>
      <StudentsTable rows={data.items} />
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        basePath="/admin/students"
        params={{ ...base, state }}
        labels={{
          showing: t('showing', { from: data.total ? (data.page - 1) * data.pageSize + 1 : 0, to: Math.min(data.page * data.pageSize, data.total), total: data.total }),
          prev: t('prev'),
          next: t('next'),
        }}
      />
    </>
  );
}
