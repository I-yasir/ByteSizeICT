import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader, Pagination } from '@/components/admin/ui';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { listAuditLog } from '@/features/audit/queries';
import { formatDate, fromDhakaInput } from '@/lib/format';

/** /admin/audit (PRD A-16, docs/02_AppFlow.md §6.12) — read-only. */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.audit'))('title') };
}

const ENTITIES = ['admission', 'student', 'exam', 'question', 'setting', 'plan', 'payment_account', 'session'] as const;
type Search = { action?: string; entity?: string; entityId?: string; from?: string; to?: string; page?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const entity = (ENTITIES as readonly string[]).includes(sp.entity ?? '') ? (sp.entity as (typeof ENTITIES)[number]) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [t, locale, data] = await Promise.all([
    getTranslations('admin.audit'),
    getLocale() as Promise<'bn' | 'en'>,
    listAuditLog({
      action: sp.action || undefined,
      entityType: entity,
      entityId: sp.entityId || undefined,
      from: fromDhakaInput(sp.from ? `${sp.from}T00:00` : null) ?? undefined,
      to: fromDhakaInput(sp.to ? `${sp.to}T23:59` : null) ?? undefined,
      page,
    }),
  ]);
  const params = { action: sp.action, entity: sp.entity, entityId: sp.entityId, from: sp.from, to: sp.to };
  const summary = (value: unknown) => (value ? JSON.stringify(value).slice(0, 160) : '');
  return (
    <>
      <PageHeader title={t('title')} />
      <form method="get" className="mb-4 grid gap-2 rounded-lg bg-surface p-4 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
        <Input name="action" defaultValue={sp.action ?? ''} placeholder="student.cancel" aria-label={t('action')} />
        <Select name="entity" defaultValue={sp.entity ?? ''} aria-label={t('entity')}>
          <option value="">{t('allEntities')}</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
        <Input name="entityId" defaultValue={sp.entityId ?? ''} placeholder={t('entityId')} aria-label={t('entityId')} />
        <Input name="from" type="date" defaultValue={sp.from ?? ''} aria-label={t('from')} />
        <Input name="to" type="date" defaultValue={sp.to ?? ''} aria-label={t('to')} />
        <Button type="submit" variant="secondary">{t('apply')}</Button>
      </form>
      {data.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((e) => (
            <li key={e.id} className="rounded-lg bg-surface p-4 text-sm shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-semibold text-fg">{e.action}</span>
                <span className="font-num text-xs text-fg-muted">{formatDate(e.createdAt, locale, 'dateTimeYear')}</span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">{e.actorLabel ?? e.actorType} · {e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</p>
              {e.before || e.after ? (
                <p className="mt-1 font-mono text-xs break-all text-fg-subtle">{summary(e.before)}{e.before && e.after ? ' → ' : ''}{summary(e.after)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        basePath="/admin/audit"
        params={params}
        labels={{ showing: t('showing', { from: data.total ? (data.page - 1) * data.pageSize + 1 : 0, to: Math.min(data.page * data.pageSize, data.total), total: data.total }), prev: t('prev'), next: t('next') }}
      />
    </>
  );
}
