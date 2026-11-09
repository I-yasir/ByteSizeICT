'use client';

import { Eye, ImagePlus, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { RichText } from '@/components/content/rich-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogActions, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { notify } from '@/components/ui/toast';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { createMediaUploadUrl, createQuestion, previewQuestion, updateQuestion } from '@/features/questions/actions';
import { upsertTopic } from '@/features/taxonomy/actions';
import type { Taxonomy } from '@/features/taxonomy/queries';
import { cn } from '@/lib/utils';

const KEYS = ['A', 'B', 'C', 'D'] as const;
type Key = (typeof KEYS)[number];
type Form = {
  chapterId: string;
  topicId: string;
  stem: string;
  stemImagePath: string | null;
  options: Record<Key, string>;
  optionImages: Record<Key, string | null>;
  correctOption: Key;
  explanation: string;
  explanationImagePath: string | null;
  status: 'draft' | 'active' | 'archived';
};

export type EditorInitial = {
  id: string;
  chapter_id: string;
  topic_id: string | null;
  stem: string;
  stem_image_path: string | null;
  option_a: string; option_b: string; option_c: string; option_d: string;
  option_a_image_path: string | null; option_b_image_path: string | null; option_c_image_path: string | null; option_d_image_path: string | null;
  correct_option: Key;
  explanation: string | null;
  explanation_image_path: string | null;
  status: Form['status'];
};

function fromInitial(q: EditorInitial | null, fallbackChapter: string): Form {
  if (!q) {
    return {
      chapterId: fallbackChapter, topicId: '', stem: '', stemImagePath: null,
      options: { A: '', B: '', C: '', D: '' }, optionImages: { A: null, B: null, C: null, D: null },
      correctOption: 'A', explanation: '', explanationImagePath: null, status: 'draft',
    };
  }
  return {
    chapterId: q.chapter_id, topicId: q.topic_id ?? '', stem: q.stem, stemImagePath: q.stem_image_path,
    options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
    optionImages: { A: q.option_a_image_path, B: q.option_b_image_path, C: q.option_c_image_path, D: q.option_d_image_path },
    correctOption: q.correct_option, explanation: q.explanation ?? '', explanationImagePath: q.explanation_image_path,
    status: q.status,
  };
}

/** Question editor with live preview (PRD A-07, docs/02_AppFlow.md §6.6). */
export function QuestionEditor({ taxonomy, initial, usage }: { taxonomy: Taxonomy; initial: EditorInitial | null; usage: number }) {
  const t = useTranslations('admin.editor');
  const errorText = useErrorMessage();
  const router = useRouter();
  const { run, pending } = useAction();
  const chapters = useMemo(() => taxonomy.subjects.flatMap((s) => s.chapters.map((c) => ({ ...c, subject: s.name_en }))), [taxonomy]);
  const [form, setForm] = useState<Form>(() => fromInitial(initial, chapters[0]?.id ?? ''));
  const [topics, setTopics] = useState(() => chapters.flatMap((c) => c.topics.map((tp) => ({ ...tp, chapterId: c.id }))));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<{ stemHtml: string; optionsHtml: string[]; explanationHtml: string; imageUrls: Record<string, string> } | null>(null);
  const [newTopic, setNewTopic] = useState('');

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const imagePaths = [form.stemImagePath, ...KEYS.map((k) => form.optionImages[k]), form.explanationImagePath].filter((p): p is string => Boolean(p));

  // Debounced server-rendered preview (identical to the student rendering).
  const previewKey = JSON.stringify([form.stem, form.options, form.explanation, imagePaths]);
  useEffect(() => {
    const id = setTimeout(async () => {
      const result = await previewQuestion({ stem: form.stem, options: KEYS.map((k) => form.options[k]), explanation: form.explanation, imagePaths });
      if (result.ok) setPreview(result.data);
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewKey captures every input
  }, [previewKey]);

  async function upload(file: File, apply: (path: string) => void) {
    if (file.size > 1024 * 1024) return notify.error(t('imageTooLarge'));
    const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const)[file.type as 'image/png'];
    if (!ext) return notify.error(t('imageType'));
    const signed = await run(() => createMediaUploadUrl({ ext }), { refresh: false });
    if (!signed.ok) return;
    const response = await fetch(signed.data.signedUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!response.ok) return notify.error(t('uploadFailed'));
    apply(signed.data.path);
  }

  function toInput() {
    return {
      chapterId: form.chapterId,
      topicId: form.topicId || null,
      stem: form.stem,
      stemImagePath: form.stemImagePath,
      optionA: form.options.A, optionAImagePath: form.optionImages.A,
      optionB: form.options.B, optionBImagePath: form.optionImages.B,
      optionC: form.options.C, optionCImagePath: form.optionImages.C,
      optionD: form.options.D, optionDImagePath: form.optionImages.D,
      correctOption: form.correctOption,
      explanation: form.explanation || null,
      explanationImagePath: form.explanationImagePath,
      status: form.status,
    };
  }

  async function save(mode: 'stay' | 'another', force = false) {
    setErrors({});
    const result = await run(
      () => (initial ? updateQuestion({ id: initial.id, question: toInput(), force }) : createQuestion({ question: toInput(), force })),
      { silentError: true, refresh: false },
    );
    if (result.ok) {
      setDuplicateId(null);
      notify.success(t('saved'));
      if (mode === 'another') {
        setForm((f) => ({ ...fromInitial(null, f.chapterId), topicId: f.topicId, status: f.status }));
        if (initial) router.push('/admin/questions/new');
      } else if (!initial) {
        router.replace(`/admin/questions/${result.data.id}`);
      } else {
        router.refresh();
      }
      return;
    }
    const { code, field, meta } = result.error;
    if (code === 'QUESTION_DUPLICATE') setDuplicateId(typeof meta?.duplicateId === 'string' ? meta.duplicateId : '');
    else if (field) setErrors({ [field.replace(/^question\./, '')]: errorText(result.error) });
    else notify.error(errorText(result.error));
  }

  const chapterTopics = topics.filter((tp) => tp.chapterId === form.chapterId);
  const imageButton = (path: string | null, apply: (p: string | null) => void, label: string) => (
    <span className="inline-flex items-center gap-2">
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-primary hover:bg-primary-soft">
        <ImagePlus aria-hidden className="size-4" />
        {path ? t('replaceImage') : label}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, apply); e.target.value = ''; }} />
      </label>
      {path ? (
        <button type="button" aria-label={t('removeImage')} onClick={() => apply(null)} className="flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2"><X aria-hidden className="size-4" /></button>
      ) : null}
    </span>
  );

  const previewPanel = (
    <Card className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-fg-muted">{t('preview')}</p>
      {preview ? (
        <>
          <RichText html={preview.stemHtml || '…'} className="text-question text-fg" />
          {form.stemImagePath && preview.imageUrls[form.stemImagePath] ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={preview.imageUrls[form.stemImagePath]} alt="" className="max-h-60 w-auto rounded-md bg-image-matte p-1" />
          ) : null}
          <ul className="flex flex-col gap-2">
            {KEYS.map((k, i) => (
              <li key={k} className={cn('flex items-center gap-3 rounded-md border px-3 py-2', form.correctOption === k ? 'border-success bg-correct-option-bg' : 'border-border-strong')}>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-border-strong font-num text-xs font-semibold">{k}</span>
                <RichText html={preview.optionsHtml[i] || '…'} as="span" />
              </li>
            ))}
          </ul>
          {preview.explanationHtml ? <div className="rounded-md border border-solution-border bg-solution-bg p-3"><RichText html={preview.explanationHtml} /></div> : null}
        </>
      ) : (
        <p className="text-sm text-fg-subtle">…</p>
      )}
    </Card>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        {usage > 0 ? <Banner variant="info">{t('usedBanner', { n: usage })}</Banner> : null}
        <Card className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('chapter')} error={errors.chapterId}>
              {(p) => (
                <Select {...p} value={form.chapterId} onChange={(e) => setForm((f) => ({ ...f, chapterId: e.target.value, topicId: '' }))}>
                  {chapters.map((c) => <option key={c.id} value={c.id}>{c.subject} · {c.number}. {c.name_en}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('topic')} optionalLabel={t('optional')} error={errors.topicId}>
              {(p) => (
                <Select {...p} value={form.topicId} onChange={(e) => set('topicId', e.target.value)}>
                  <option value="">—</option>
                  {chapterTopics.map((tp) => <option key={tp.id} value={tp.id}>{tp.name_en}</option>)}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex gap-2">
            <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder={t('newTopic')} aria-label={t('newTopic')} className="h-10" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!newTopic.trim() || !form.chapterId}
              leadingIcon={<Plus aria-hidden className="size-4" />}
              onClick={async () => {
                const result = await run(() => upsertTopic({ chapterId: form.chapterId, nameEn: newTopic, nameBn: newTopic }), { refresh: false });
                if (result.ok) {
                  setTopics((list) => [...list, { id: result.data.id, name_en: newTopic, name_bn: newTopic, sort_order: 0, chapterId: form.chapterId }]);
                  set('topicId', result.data.id);
                  setNewTopic('');
                }
              }}
            >
              {t('addTopic')}
            </Button>
          </div>

          <Field label={t('stem')} helper={t('latexHint')} error={errors.stem}>
            {(p) => <Textarea {...p} value={form.stem} onChange={(e) => set('stem', e.target.value)} maxLength={4000} className="min-h-32" />}
          </Field>
          {imageButton(form.stemImagePath, (path) => set('stemImagePath', path), t('addImage'))}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-fg">{t('options')}</legend>
            {KEYS.map((k) => (
              <div key={k} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="radio" name="correct" className="size-5 accent-success" checked={form.correctOption === k} onChange={() => set('correctOption', k)} />
                    {t('optionLabel', { key: k })} {form.correctOption === k ? <span className="text-success">· {t('correct')}</span> : null}
                  </label>
                  {imageButton(form.optionImages[k], (path) => setForm((f) => ({ ...f, optionImages: { ...f.optionImages, [k]: path } })), t('image'))}
                </div>
                <Input
                  aria-label={t('optionLabel', { key: k })}
                  aria-invalid={errors[`option${k}`] ? true : undefined}
                  value={form.options[k]}
                  maxLength={1000}
                  onChange={(e) => setForm((f) => ({ ...f, options: { ...f.options, [k]: e.target.value } }))}
                />
                {errors[`option${k}`] ? <p className="text-sm text-danger">{t('optionRequired')}</p> : null}
              </div>
            ))}
          </fieldset>

          <Field label={t('explanation')} optionalLabel={t('optional')}>
            {(p) => <Textarea {...p} value={form.explanation} maxLength={8000} onChange={(e) => set('explanation', e.target.value)} />}
          </Field>
          {imageButton(form.explanationImagePath, (path) => set('explanationImagePath', path), t('addImage'))}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('status')}>{(p) => <Select {...p} value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])}>{(['draft', 'active', 'archived'] as const).map((d) => <option key={d} value={d}>{t(`statuses.${d}`)}</option>)}</Select>}</Field>
          </div>
        </Card>
        <div className="sticky bottom-0 z-sticky -mx-4 flex flex-wrap gap-2 border-t border-border bg-surface p-4 sm:mx-0 sm:rounded-lg">
          <Button loading={pending} onClick={() => save('stay')}>{t('save')}</Button>
          <Button variant="secondary" loading={pending} onClick={() => save('another')}>{t('saveAnother')}</Button>
          <Button asChild variant="ghost"><Link href="/admin/questions">{t('cancel')}</Link></Button>
          <Button variant="ghost" className="ml-auto lg:hidden" leadingIcon={<Eye aria-hidden className="size-4" />} onClick={() => setShowPreview((v) => !v)}>{t('preview')}</Button>
        </div>
        {showPreview ? <div className="lg:hidden">{previewPanel}</div> : null}
      </div>
      <div className="hidden lg:block"><div className="sticky top-20">{previewPanel}</div></div>

      <Dialog open={duplicateId !== null} onOpenChange={(o) => !o && setDuplicateId(null)}>
        <DialogContent title={t('duplicateTitle')} description={t('duplicateBody')}>
          {duplicateId ? <Link href={`/admin/questions/${duplicateId}`} target="_blank" className="text-sm font-semibold text-primary underline">{t('openDuplicate')}</Link> : null}
          <DialogActions>
            <Button variant="secondary" onClick={() => setDuplicateId(null)}>{t('cancel')}</Button>
            <Button loading={pending} onClick={() => save('stay', true)}>{t('saveAnyway')}</Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
