'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { Dialog, DialogActions, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { deleteQuestions } from '@/features/questions/actions';
import { useTranslations } from '@/lib/i18n/client';

type BlockingExam = { id: string; title: string; phase: string };
const PHASES = ['draft', 'scheduled', 'live', 'late_window'] as const;
const isPhase = (phase: string): phase is (typeof PHASES)[number] => (PHASES as readonly string[]).includes(phase);

function blockingExams(meta: Record<string, unknown> | undefined): BlockingExam[] {
  const exams = meta?.exams;
  if (!Array.isArray(exams)) return [];
  return exams.filter((e): e is BlockingExam => typeof e === 'object' && e !== null && typeof (e as BlockingExam).id === 'string');
}

/**
 * Delete confirmation (docs/03_UI_Spec.md §7.24, AppFlow §6.5). Bulk deletes ask for the count to be
 * typed; a QUESTION_IN_USE answer swaps the body for the exams that block it.
 */
export function DeleteQuestionsDialog({ ids, bulk, onClose, onDeleted }: { ids: string[]; bulk: boolean; onClose: () => void; onDeleted: () => void }) {
  const t = useTranslations('admin.questions.delete');
  const tPhase = useTranslations('admin.builder.phase');
  const errorText = useErrorMessage();
  const { run, pending } = useAction();
  const [typed, setTyped] = useState('');
  const [blocking, setBlocking] = useState<BlockingExam[] | null>(null);
  const n = ids.length;

  async function confirm() {
    const result = await run(() => deleteQuestions({ ids }), { success: t('done', { n }), silentError: true });
    if (result.ok) return onDeleted();
    if (result.error.code === 'QUESTION_IN_USE') setBlocking(blockingExams(result.error.meta));
    else notify.error(errorText(result.error));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      {blocking ? (
        <DialogContent title={t('inUseTitle')} description={t('inUseBody')} hideClose>
          <ul className="flex flex-col gap-2" data-testid="blocking-exams">
            {blocking.map((exam) => (
              <li key={exam.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/admin/exams/${exam.id}`} className="font-semibold text-primary underline">{exam.title}</Link>
                {isPhase(exam.phase) ? <span className="text-fg-muted">· {tPhase(exam.phase)}</span> : null}
              </li>
            ))}
          </ul>
          <DialogActions>
            <Button variant="secondary" onClick={onClose}>{t('close')}</Button>
          </DialogActions>
        </DialogContent>
      ) : (
        <DialogContent title={t('title', { n })} description={t('body')}>
          {bulk ? (
            <Field label={t('typeToConfirm', { n })}>
              {(p) => <Input {...p} inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}
            </Field>
          ) : null}
          <DialogActions>
            {/* Initial focus on Cancel (§7.24): Radix keeps an element that autofocused inside the dialog. */}
            <Button variant="secondary" autoFocus onClick={onClose}>{t('cancel')}</Button>
            <Button variant="danger" loading={pending} disabled={bulk && typed.trim() !== String(n)} onClick={confirm}>{t('confirm')}</Button>
          </DialogActions>
        </DialogContent>
      )}
    </Dialog>
  );
}
