'use client';

import { Inbox } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from '@/lib/i18n/client';
import { useEffect, useState } from 'react';
import { type Column, DataTable } from '@/components/admin/data-table';
import { useAction } from '@/components/admin/use-action';
import { METHOD_LABEL } from '@/components/marketing/payment-method-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { CopyField } from '@/components/ui/copy-field';
import { Dialog, DialogActions, DialogContent, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/misc';
import { notify } from '@/components/ui/toast';
import { approveAdmission, loadAdmissionDetail, rejectAdmission } from '@/features/admissions/actions';
import type { AdmissionListItem } from '@/features/admissions/queries';
import { REJECT_REASONS } from '@/features/admissions/schemas';
import { formatDate, formatTaka, fromDhakaInput, toDhakaInput } from '@/lib/format';

type Plan = { id: string; code: string; name_en: string; name_bn: string; duration_days: number | null; fixed_expires_at: string | null; price_bdt: number; is_active: boolean };
type Detail = NonNullable<Extract<Awaited<ReturnType<typeof loadAdmissionDetail>>, { ok: true }>['data']>;

/** Queue table + approve/reject dialogs + detail drawer (docs/02_AppFlow.md §6.3). */
export function AdmissionsTable({ rows, plans, emptyAllDone }: { rows: AdmissionListItem[]; plans: Plan[]; emptyAllDone: boolean }) {
  const t = useTranslations('admin.admissions');
  const locale = useLocale() as 'bn' | 'en';
  const [approving, setApproving] = useState<AdmissionListItem | null>(null);
  const [rejecting, setRejecting] = useState<AdmissionListItem | null>(null);
  const [drawer, setDrawer] = useState<(Detail & { row: AdmissionListItem }) | null>(null);
  const { run } = useAction();

  async function openDrawer(row: AdmissionListItem) {
    const result = await run(() => loadAdmissionDetail({ id: row.id }), { refresh: false });
    if (result.ok && result.data) setDrawer({ ...result.data, row });
  }

  const flags = (row: AdmissionListItem) => {
    const f = (row.duplicate_flags ?? {}) as { mobile_exists?: boolean; email_student_mobiles?: string[] };
    return (
      <span className="flex flex-wrap gap-1">
        {f.mobile_exists ? <Badge variant="warning">{t('flags.mobileExists')}</Badge> : null}
        {(f.email_student_mobiles ?? []).map((m) => (
          <Badge key={m} variant="warning">{t('flags.emailUsedBy', { mobile: m })}</Badge>
        ))}
      </span>
    );
  };

  const columns: Column<AdmissionListItem>[] = [
    { id: 'submitted', header: t('cols.submitted'), cell: (r) => <span className="font-num text-xs text-fg-muted">{formatDate(r.created_at, locale, 'dateTime')}</span> },
    { id: 'mobile', header: t('cols.mobile'), cell: (r) => <span className="font-num">{r.mobile}</span> },
    { id: 'email', header: t('cols.email'), cell: (r) => <span className="break-all">{r.email}</span>, desktopOnly: true },
    { id: 'method', header: t('cols.method'), cell: (r) => <Badge variant="info">{METHOD_LABEL[r.payment_method]}</Badge> },
    { id: 'trx', header: t('cols.trx'), cell: (r) => <span className="font-num font-semibold">{r.trx_id}</span> },
    { id: 'amount', header: t('cols.amount'), cell: (r) => <span className="font-num">{r.amount_bdt !== null ? formatTaka(r.amount_bdt, locale) : '—'}{r.plan ? ` · ${r.plan.name_en}` : ''}</span> },
    { id: 'kind', header: t('cols.kind'), cell: (r) => <Badge variant={r.kind === 'new' ? 'primary' : 'teal'}>{t(`kind.${r.kind}`)}</Badge> },
    { id: 'flags', header: t('cols.flags'), cell: flags },
    {
      id: 'actions',
      header: t('cols.actions'),
      cell: (r) =>
        r.status === 'pending' ? (
          <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="success" onClick={() => setApproving(r)}>{t('approve')}</Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(r)}>{t('reject')}</Button>
          </span>
        ) : (
          <Badge variant={r.status === 'approved' ? 'success' : 'danger'}>{t(`status.${r.status}`)}</Badge>
        ),
    },
  ];

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={openDrawer}
        empty={<EmptyState icon={<Inbox />} title={emptyAllDone ? t('allDone') : t('empty')} />}
      />
      {approving ? <ApproveDialog row={approving} plans={plans} onClose={() => setApproving(null)} /> : null}
      {rejecting ? <RejectDialog row={rejecting} onClose={() => setRejecting(null)} /> : null}
      <Dialog open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
        {drawer ? (
          <SheetContent side="right" title={t('detail')}>
            <div className="flex flex-col gap-4 text-sm">
              <CopyField value={drawer.admission.trx_id} label="TrxID" />
              <dl className="grid grid-cols-3 gap-2">
                <dt className="text-fg-muted">{t('cols.mobile')}</dt><dd className="col-span-2 font-num">{drawer.admission.mobile}</dd>
                <dt className="text-fg-muted">{t('cols.email')}</dt><dd className="col-span-2 break-all">{drawer.admission.email}</dd>
                <dt className="text-fg-muted">{t('cols.method')}</dt><dd className="col-span-2">{METHOD_LABEL[drawer.admission.payment_method]}</dd>
                <dt className="text-fg-muted">{t('cols.kind')}</dt><dd className="col-span-2">{t(`kind.${drawer.admission.kind}`)}</dd>
                {drawer.admission.reject_reason ? (<><dt className="text-fg-muted">{t('reason')}</dt><dd className="col-span-2">{drawer.admission.reject_reason}</dd></>) : null}
              </dl>
              {drawer.existingStudent ? (
                <Link href={`/admin/students/${drawer.existingStudent.id}`} className="rounded-md bg-primary-soft p-3 font-semibold text-primary">
                  {t('existingStudent', { date: formatDate(drawer.existingStudent.access_expires_at, locale, 'date') })}
                </Link>
              ) : null}
              <div>
                <h3 className="mb-2 font-semibold text-fg">{t('history')}</h3>
                {drawer.history.length ? (
                  <ul className="flex flex-col gap-1">
                    {drawer.history.map((h) => (
                      <li key={h.id} className="flex justify-between gap-2 rounded-md bg-surface-2 px-3 py-2">
                        <span className="font-num">{h.trx_id}</span>
                        <span className="text-fg-muted">{t(`status.${h.status}`)} · {formatDate(h.created_at, locale, 'date')}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-muted">{t('noHistory')}</p>
                )}
              </div>
              {drawer.row.status === 'pending' ? (
                <div className="flex gap-2 border-t border-border pt-4">
                  <Button variant="success" className="flex-1" onClick={() => { setApproving(drawer.row); setDrawer(null); }}>{t('approve')}</Button>
                  <Button variant="secondary" className="flex-1" onClick={() => { setRejecting(drawer.row); setDrawer(null); }}>{t('reject')}</Button>
                </div>
              ) : null}
            </div>
          </SheetContent>
        ) : null}
      </Dialog>
    </>
  );
}

function ApproveDialog({ row, plans, onClose }: { row: AdmissionListItem; plans: Plan[]; onClose: () => void }) {
  const t = useTranslations('admin.admissions');
  const { run, pending } = useAction();
  const initialPlan = plans.find((p) => p.id === row.plan?.id) ?? plans.find((p) => p.is_active) ?? null;
  const [planId, setPlanId] = useState(initialPlan?.id ?? '');
  const [amount, setAmount] = useState(String(row.amount_bdt ?? initialPlan?.price_bdt ?? 0));
  const [startsAt, setStartsAt] = useState(() => toDhakaInput(new Date().toISOString()));
  const [expiresAt, setExpiresAt] = useState(() => (initialPlan ? toDhakaInput(planExpiry(initialPlan, new Date().toISOString())) : ''));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function planExpiry(plan: Plan, fromIso: string) {
    if (plan.fixed_expires_at) return plan.fixed_expires_at;
    return new Date(Date.parse(fromIso) + (plan.duration_days ?? 30) * 86_400_000).toISOString();
  }
  // Active renewal: extend from the current expiry instead of from today (docs/02_AppFlow.md §6.3).
  const [renewalBase, setRenewalBase] = useState<string | null>(null);
  useEffect(() => {
    if (row.kind !== 'renewal') return;
    let cancelled = false;
    void loadAdmissionDetail({ id: row.id }).then((result) => {
      const current = result.ok ? result.data?.existingStudent : null;
      if (cancelled || !current || current.status !== 'active' || Date.parse(current.access_expires_at) <= Date.now()) return;
      setRenewalBase(current.access_expires_at);
      const plan = plans.find((p) => p.id === planId);
      if (plan) setExpiresAt(toDhakaInput(planExpiry(plan, current.access_expires_at)));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per dialog
  }, [row.id, row.kind]);

  function choosePlan(id: string) {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id);
    if (!plan) return;
    setAmount(String(plan.price_bdt));
    setExpiresAt(toDhakaInput(planExpiry(plan, renewalBase ?? fromDhakaInput(startsAt) ?? new Date().toISOString())));
  }

  async function submit() {
    setError(null);
    const result = await run(
      () =>
        approveAdmission({
          admissionId: row.id,
          planId: planId || null,
          amountBdt: Number(amount),
          startsAt: fromDhakaInput(startsAt) ?? '',
          expiresAt: fromDhakaInput(expiresAt) ?? '',
          note: note || null,
        }),
      { silentError: true },
    );
    if (result.ok) {
      if (result.data.emailSent === false) notify.persistent(t('approvedEmailFailed'));
      else notify.success(result.data.kind === 'new' ? t('approvedNew', { email: result.data.email }) : t('approvedRenewal'));
      onClose();
    } else {
      setError(result.error.code === 'ADMISSION_NOT_PENDING' ? t('alreadyProcessed') : t('approveError'));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t('approveTitle', { mobile: row.mobile })} description={row.kind === 'renewal' ? t('renewalHint') : undefined}>
        <div className="flex flex-col gap-3">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Field label={t('plan')}>
            {(p) => (
              <Select {...p} value={planId} onChange={(e) => choosePlan(e.target.value)}>
                <option value="">—</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name_en} · ৳{plan.price_bdt}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('amount')}>{(p) => <Input {...p} type="number" min={0} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('startsAt')}>{(p) => <Input {...p} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />}</Field>
            <Field label={t('expiresAt')}>{(p) => <Input {...p} type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />}</Field>
          </div>
          <p className="text-xs text-fg-subtle">{t('dhakaTime')}</p>
          <Field label={t('note')} optionalLabel={t('optional')}>{(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />}</Field>
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="success" loading={pending} onClick={submit}>{t('approveAndSend')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ row, onClose }: { row: AdmissionListItem; onClose: () => void }) {
  const t = useTranslations('admin.admissions');
  const { run, pending } = useAction();
  const [reason, setReason] = useState<(typeof REJECT_REASONS)[number]>('trx_not_found');
  const [details, setDetails] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  async function submit() {
    const result = await run(() => rejectAdmission({ admissionId: row.id, reason, details: details || null, sendEmail }), { success: t('rejected') });
    if (result.ok) onClose();
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t('rejectTitle', { mobile: row.mobile })}>
        <div className="flex flex-col gap-3">
          <Field label={t('reason')}>
            {(p) => (
              <Select {...p} value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
                {REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>{t(`reasons.${r}`)}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('details')} optionalLabel={reason === 'other' ? undefined : t('optional')}>
            {(p) => <Textarea {...p} value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-20" />}
          </Field>
          <Checkbox label={t('sendRejectionEmail')} checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="danger" loading={pending} disabled={reason === 'other' && !details.trim()} onClick={submit}>{t('reject')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
