'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/controls';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { createExam, updateExamSettings } from '@/features/exams/actions';
import { fromDhakaInput, toDhakaInput } from '@/lib/format';

export type ExamRow = {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  chapter_label: string | null;
  is_sample: boolean;
  starts_at: string | null;
  live_ends_at: string | null;
  access_mode: 'fixed' | 'window' | 'always';
  late_until: string | null;
  duration_minutes: number;
  marks_per_question: number;
  negative_mark: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  allow_mark_for_review: boolean;
  results_publish_at: string | null;
  answers_publish_at: string | null;
  show_option_stats: boolean;
  rank_late_attempts: boolean;
};

/** Exam settings (PRD A-10). Scoring fields are disabled once attempts exist (EXAM_LOCKED). */
export function ExamSettingsForm({ exam, locked = false, subjects }: { exam: ExamRow | null; locked?: boolean; subjects: { id: string; name_en: string }[] }) {
  const t = useTranslations('admin.examForm');
  const router = useRouter();
  const { run, pending } = useAction();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(() => ({
    title: exam?.title ?? '',
    description: exam?.description ?? '',
    subjectId: exam?.subject_id ?? subjects[0]?.id ?? '',
    chapterLabel: exam?.chapter_label ?? '',
    isSample: exam?.is_sample ?? false,
    startsAt: toDhakaInput(exam?.starts_at),
    liveEndsAt: toDhakaInput(exam?.live_ends_at),
    accessMode: exam?.access_mode ?? 'fixed',
    lateUntil: toDhakaInput(exam?.late_until),
    durationMinutes: String(exam?.duration_minutes ?? 30),
    marksPerQuestion: String(exam?.marks_per_question ?? 1),
    negativeMark: String(exam?.negative_mark ?? 0),
    shuffleQuestions: exam?.shuffle_questions ?? false,
    shuffleOptions: exam?.shuffle_options ?? false,
    allowMarkForReview: exam?.allow_mark_for_review ?? true,
    resultsPublishAt: toDhakaInput(exam?.results_publish_at),
    answersPublishAt: toDhakaInput(exam?.answers_publish_at),
    showOptionStats: exam?.show_option_stats ?? true,
    rankLateAttempts: exam?.rank_late_attempts ?? false,
  }));
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((s) => ({ ...s, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const settings = {
      title: f.title,
      description: f.description || null,
      subjectId: f.subjectId || null,
      chapterLabel: f.chapterLabel || null,
      isSample: f.isSample,
      startsAt: fromDhakaInput(f.startsAt),
      liveEndsAt: fromDhakaInput(f.liveEndsAt),
      accessMode: f.accessMode,
      lateUntil: f.accessMode === 'window' ? fromDhakaInput(f.lateUntil) : null,
      durationMinutes: Number(f.durationMinutes),
      marksPerQuestion: Number(f.marksPerQuestion),
      negativeMark: Number(f.negativeMark),
      shuffleQuestions: f.shuffleQuestions,
      shuffleOptions: f.shuffleOptions,
      allowMarkForReview: f.allowMarkForReview,
      resultsPublishAt: fromDhakaInput(f.resultsPublishAt),
      answersPublishAt: fromDhakaInput(f.answersPublishAt),
      showOptionStats: f.showOptionStats,
      rankLateAttempts: f.rankLateAttempts,
    };
    if (exam) {
      const result = await run(() => updateExamSettings({ id: exam.id, settings }), { success: t('saved'), silentError: true });
      if (!result.ok) setError(result.error.code === 'EXAM_LOCKED' ? t('lockedError') : result.error.code === 'EXAM_INVALID_TIMES' ? t('timesError') : t('saveError'));
    } else {
      const result = await run(() => createExam(settings), { refresh: false, silentError: true });
      if (result.ok) router.push(`/admin/exams/${result.data.id}`);
      else setError(result.error.code === 'EXAM_INVALID_TIMES' ? t('timesError') : t('saveError'));
    }
  }

  const lockIcon = locked ? <Lock aria-label={t('lockedField')} className="ml-1 inline size-3.5 text-fg-subtle" /> : null;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label={t('title')} className="sm:col-span-2">{(p) => <Input {...p} required maxLength={120} value={f.title} onChange={(e) => set('title', e.target.value)} />}</Field>
        <Field label={t('description')} optionalLabel={t('optional')} className="sm:col-span-2">{(p) => <Textarea {...p} maxLength={2000} value={f.description} onChange={(e) => set('description', e.target.value)} className="min-h-20" />}</Field>
        <Field label={t('subject')}>{(p) => <Select {...p} value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}</Select>}</Field>
        <Field label={t('chapterLabel')} optionalLabel={t('optional')}>{(p) => <Input {...p} maxLength={80} placeholder="Chapter 3" value={f.chapterLabel} onChange={(e) => set('chapterLabel', e.target.value)} />}</Field>
        <Checkbox label={t('isSample')} checked={f.isSample} onCheckedChange={(v) => set('isSample', v === true)} disabled={locked} />
      </Card>
      {!f.isSample ? (
        <Card className="grid gap-4 sm:grid-cols-2">
          <p className="text-xs text-fg-subtle sm:col-span-2">{t('dhakaTime')}</p>
          <Field label={t('startsAt')}>{(p) => <Input {...p} type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />}</Field>
          <Field label={t('liveEndsAt')} helper={t('liveEndsHelp')}>{(p) => <Input {...p} type="datetime-local" value={f.liveEndsAt} onChange={(e) => set('liveEndsAt', e.target.value)} />}</Field>
          <Field label={t('accessMode')}>
            {(p) => (
              <Select {...p} value={f.accessMode} onChange={(e) => set('accessMode', e.target.value as typeof f.accessMode)}>
                {(['fixed', 'window', 'always'] as const).map((m) => <option key={m} value={m}>{t(`modes.${m}`)}</option>)}
              </Select>
            )}
          </Field>
          {f.accessMode === 'window' ? <Field label={t('lateUntil')}>{(p) => <Input {...p} type="datetime-local" value={f.lateUntil} onChange={(e) => set('lateUntil', e.target.value)} />}</Field> : <span />}
          <Field label={t('resultsPublishAt')} helper={t('publishHelp')} optionalLabel={t('optional')}>{(p) => <Input {...p} type="datetime-local" value={f.resultsPublishAt} onChange={(e) => set('resultsPublishAt', e.target.value)} />}</Field>
          <Field label={t('answersPublishAt')} helper={t('publishHelp')} optionalLabel={t('optional')}>{(p) => <Input {...p} type="datetime-local" value={f.answersPublishAt} onChange={(e) => set('answersPublishAt', e.target.value)} />}</Field>
          <Checkbox label={t('rankLateAttempts')} checked={f.rankLateAttempts} onCheckedChange={(v) => set('rankLateAttempts', v === true)} />
        </Card>
      ) : null}
      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label={<>{t('duration')}{lockIcon}</>}>{(p) => <Input {...p} type="number" min={1} max={300} disabled={locked} value={f.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} />}</Field>
        <Field label={<>{t('marksPerQuestion')}{lockIcon}</>}>{(p) => <Input {...p} type="number" min={0.25} step={0.25} disabled={locked} value={f.marksPerQuestion} onChange={(e) => set('marksPerQuestion', e.target.value)} />}</Field>
        <Field label={<>{t('negativeMark')}{lockIcon}</>}>{(p) => <Input {...p} type="number" min={0} step={0.05} disabled={locked} value={f.negativeMark} onChange={(e) => set('negativeMark', e.target.value)} />}</Field>
        <Checkbox label={<>{t('shuffleQuestions')}{lockIcon}</>} disabled={locked} checked={f.shuffleQuestions} onCheckedChange={(v) => set('shuffleQuestions', v === true)} />
        <Checkbox label={<>{t('shuffleOptions')}{lockIcon}</>} disabled={locked} checked={f.shuffleOptions} onCheckedChange={(v) => set('shuffleOptions', v === true)} />
        <Checkbox label={t('allowMark')} checked={f.allowMarkForReview} onCheckedChange={(v) => set('allowMarkForReview', v === true)} />
        <Checkbox label={t('showOptionStats')} checked={f.showOptionStats} onCheckedChange={(v) => set('showOptionStats', v === true)} />
      </Card>
      <Button type="submit" loading={pending} className="self-start">{exam ? t('save') : t('create')}</Button>
    </form>
  );
}
