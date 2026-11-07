'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Segmented, SegmentedItem } from '@/components/ui/controls';
import { CopyField } from '@/components/ui/copy-field';
import { Dialog, DialogActions, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { notify } from '@/components/ui/toast';
import {
  cancelStudent,
  extendStudents,
  forceLogoutStudent,
  reactivateStudent,
  resendCredentials,
  resetStudentPin,
  setStudentExpiry,
  suspendStudent,
  updateStudent,
} from '@/features/students/actions';
import type { ActionResult } from '@/lib/errors';
import { fromDhakaInput, toDhakaInput } from '@/lib/format';

type Student = { id: string; mobile: string; email: string; status: 'active' | 'suspended' | 'cancelled'; adminLabel: string | null; adminNote: string | null; expiresAt: string };
type ActionKey = 'extend' | 'expiry' | 'cancel' | 'suspend' | 'reactivate' | 'reset' | 'resend' | 'logout' | 'edit';

/** Action menu + confirmation dialogs (docs/02_AppFlow.md §6.4). Every action is audited server-side. */
export function StudentActions({ student }: { student: Student }) {
  const t = useTranslations('admin.students.actions');
  const [open, setOpen] = useState<ActionKey | null>(null);
  const close = () => setOpen(null);
  const items: ActionKey[] = ['extend', 'expiry', ...(student.status === 'active' ? (['suspend', 'cancel'] as const) : (['reactivate'] as const)), 'reset', 'resend', 'logout', 'edit'];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">{t('menu')} <ChevronDown aria-hidden className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.map((key) => (
            <DropdownMenuItem key={key} onSelect={() => setOpen(key)} className={key === 'cancel' || key === 'suspend' ? 'text-danger' : undefined}>
              {t(`${key}.label`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {open === 'extend' ? <ExtendDialog student={student} onClose={close} /> : null}
      {open === 'expiry' ? <ExpiryDialog student={student} onClose={close} /> : null}
      {open === 'cancel' || open === 'suspend' ? <StatusDialog kind={open} student={student} onClose={close} /> : null}
      {open === 'reactivate' ? <SimpleDialog title={t('reactivate.label')} body={t('reactivate.body')} run={() => reactivateStudent({ studentId: student.id })} onClose={close} /> : null}
      {open === 'reset' ? <ResetPinDialog student={student} onClose={close} /> : null}
      {open === 'resend' ? <SimpleDialog title={t('resend.label')} body={t('resend.body')} run={() => resendCredentials({ studentId: student.id })} onClose={close} /> : null}
      {open === 'logout' ? <SimpleDialog title={t('logout.label')} body={t('logout.body')} run={() => forceLogoutStudent({ studentId: student.id })} onClose={close} /> : null}
      {open === 'edit' ? <EditDialog student={student} onClose={close} /> : null}
    </>
  );
}

function SimpleDialog({ title, body, run: action, onClose }: { title: string; body: string; run: () => Promise<ActionResult<unknown>>; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={title} description={body}>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
          <Button loading={pending} onClick={async () => (await run(action, { success: t('done') })).ok && onClose()}>{t('confirm')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function ExtendDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  const [days, setDays] = useState(30);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('extend.label')} description={t('extend.body')}>
        <Segmented value={String(days)} onValueChange={(v) => setDays(Number(v))} className="grid-cols-3 sm:grid-cols-3">
          {[7, 30, 90].map((d) => <SegmentedItem key={d} value={String(d)}>{t('extend.days', { n: d })}</SegmentedItem>)}
        </Segmented>
        <Field label={t('extend.custom')} className="mt-3">{(p) => <Input {...p} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} />}</Field>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
          <Button loading={pending} onClick={async () => (await run(() => extendStudents({ studentIds: [student.id], days }), { success: t('done') })).ok && onClose()}>{t('confirm')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function ExpiryDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  const [value, setValue] = useState(toDhakaInput(student.expiresAt));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('expiry.label')} description={t('expiry.body')}>
        <Field label={t('expiry.field')}>{(p) => <Input {...p} type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
          <Button loading={pending} onClick={async () => (await run(() => setStudentExpiry({ studentId: student.id, expiresAt: fromDhakaInput(value) ?? '' }), { success: t('done') })).ok && onClose()}>{t('confirm')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel requires typing the last 3 mobile digits (docs/02_AppFlow.md §7.6). */
function StatusDialog({ kind, student, onClose }: { kind: 'cancel' | 'suspend'; student: Student; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const needsConfirm = kind === 'cancel';
  const ok = reason.trim().length > 0 && (!needsConfirm || confirmText === student.mobile.slice(-3));
  const action = kind === 'cancel' ? cancelStudent : suspendStudent;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t(`${kind}.label`)} description={t(`${kind}.body`)}>
        <div className="flex flex-col gap-3">
          <Field label={t('reason')}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" />}</Field>
          {needsConfirm ? <Field label={t('cancel.typeDigits')}>{(p) => <Input {...p} inputMode="numeric" maxLength={3} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />}</Field> : null}
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
          <Button variant="danger" disabled={!ok} loading={pending} onClick={async () => (await run(() => action({ studentId: student.id, reason }), { success: t('done') })).ok && onClose()}>{t(`${kind}.label`)}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function ResetPinDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [pin, setPin] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [shownPin, setShownPin] = useState<string | null>(null);

  async function submit() {
    const result = await run(() => resetStudentPin({ studentId: student.id, mode, ...(mode === 'manual' ? { pin } : {}), sendEmail }));
    if (!result.ok) return;
    if (result.data.emailSent === false) notify.persistent(t('reset.emailFailed'));
    if (result.data.pin) setShownPin(result.data.pin);
    else {
      notify.success(t('reset.emailed', { email: student.email }));
      onClose();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('reset.label')} description={shownPin ? t('reset.showOnce') : t('reset.body')}>
        {shownPin ? (
          <>
            <CopyField value={shownPin} label="PIN" />
            <DialogActions><Button onClick={onClose}>{t('done')}</Button></DialogActions>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <Segmented value={mode} onValueChange={(v) => setMode(v as 'auto' | 'manual')} className="grid-cols-2 sm:grid-cols-2">
                <SegmentedItem value="auto">{t('reset.auto')}</SegmentedItem>
                <SegmentedItem value="manual">{t('reset.manual')}</SegmentedItem>
              </Segmented>
              {mode === 'manual' ? <Field label={t('reset.pin')} helper={t('reset.pinRules')}>{(p) => <Input {...p} inputMode="numeric" maxLength={6} className="font-num" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />}</Field> : null}
              <Checkbox label={t('reset.sendEmail')} checked={sendEmail} onCheckedChange={(v) => setSendEmail(v === true)} />
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
              <Button loading={pending} disabled={mode === 'manual' && !/^\d{4,6}$/.test(pin)} onClick={submit}>{t('confirm')}</Button>
            </DialogActions>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const t = useTranslations('admin.students.actions');
  const { run, pending } = useAction();
  const [email, setEmail] = useState(student.email);
  const [label, setLabel] = useState(student.adminLabel ?? '');
  const [note, setNote] = useState(student.adminNote ?? '');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('edit.label')}>
        <div className="flex flex-col gap-3">
          <Field label={t('edit.email')}>{(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Field label={t('edit.adminLabel')}>{(p) => <Input {...p} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <Field label={t('edit.note')}>{(p) => <Textarea {...p} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />}</Field>
        </div>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>{t('cancelBtn')}</Button>
          <Button loading={pending} onClick={async () => (await run(() => updateStudent({ studentId: student.id, email, adminLabel: label || null, adminNote: note || null }), { success: t('done') })).ok && onClose()}>{t('save')}</Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
