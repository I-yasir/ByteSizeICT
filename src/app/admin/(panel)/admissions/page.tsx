import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FilterChips, PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { listAdmissions } from '@/features/admissions/queries';
import { listPlansAdmin } from '@/features/settings/queries';
import { AdmissionsTable } from './admissions-table';

/** /admin/admissions (PRD A-03/A-04, docs/02_AppFlow.md §6.3). Filters live in the URL. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.admissions'))('title') };
}

type Search = { status?: string; method?: string; q?: string; page?: string };
const STATUSES = ['pending', 'approved', 'rejected', 'all'] as const;

export default async function AdmissionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? '') ? (sp.status as (typeof STATUSES)[number]) : 'pending';
  const method = ['bkash', 'nagad', 'rocket', 'bank'].includes(sp.method ?? '') ? (sp.method as 'bkash') : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [t, data, plans] = await Promise.all([
    getTranslations('admin.admissions'),
    listAdmissions({ status, method, q: sp.q, page }),
    listPlansAdmin(),
  ]);
  const base = { method: sp.method, q: sp.q };
  const qs = (extra: Record<string, string | undefined>) =>
    `/admin/admissions?${new URLSearchParams(Object.entries({ ...base, ...extra }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

  return (
    <>
      <PageHeader title={t('title')} />
      <FilterChips items={STATUSES.map((s) => ({ href: qs({ status: s }), label: t(`status.${s}`), active: s === status }))} />
      <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="status" value={status} />
        <Input name="q" defaultValue={sp.q ?? ''} placeholder={t('search')} aria-label={t('search')} className="sm:max-w-sm" />
        <Select name="method" defaultValue={sp.method ?? ''} aria-label={t('method')} className="sm:max-w-48">
          <option value="">{t('allMethods')}</option>
          <option value="bkash">bKash</option>
          <option value="nagad">Nagad</option>
          <option value="rocket">Rocket</option>
          <option value="bank">Bank</option>
        </Select>
        <Button type="submit" variant="secondary">{t('apply')}</Button>
      </form>
      <AdmissionsTable rows={data.items} plans={plans} emptyAllDone={status === 'pending'} />
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        basePath="/admin/admissions"
        params={{ ...base, status }}
        labels={{
          showing: t('showing', { from: data.total ? (data.page - 1) * data.pageSize + 1 : 0, to: Math.min(data.page * data.pageSize, data.total), total: data.total }),
          prev: t('prev'),
          next: t('next'),
        }}
      />
    </>
  );
}
