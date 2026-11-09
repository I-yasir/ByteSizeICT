'use client';

import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, CircleCheck, CircleX, GripVertical, Plus, Search, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/client';
import { useEffect, useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { RichText } from '@/components/content/rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input, Select } from '@/components/ui/field';
import { archiveExam, publishExam, setExamAudience, setExamQuestions, setFeaturedExam, unpublishExam } from '@/features/exams/actions';
import type { ExamPhase } from '@/features/exams/status';
import { searchBank } from '@/features/questions/actions';
import { searchStudentsForAudience } from '@/features/students/actions';
import { cn } from '@/lib/utils';
import { type ExamRow, ExamSettingsForm } from '../exam-settings-form';

type Q = { id: string; stemHtml: string; status: string; chapterLabel: string };
type Student = { id: string; mobile: string; email: string; admin_label: string | null };
type Chapter = { id: string; label: string };

export type BuilderProps = {
  exam: ExamRow & { status: 'draft' | 'published' | 'archived'; phase: ExamPhase; is_featured: boolean; audience: 'all_active' | 'selected' };
  locked: boolean;
  attemptCount: number;
  /** computed on the server: the start time has already passed */
  startPassed: boolean;
  questions: Q[];
  assignees: Student[];
  chapters: Chapter[];
  subjects: { id: string; name_en: string }[];
  labels: string[];
};

/** Exam builder tabs: Settings · Questions · Audience · Publish (docs/02_AppFlow.md §6.8). */
export function ExamBuilder(props: BuilderProps) {
  const t = useTranslations('admin.builder');
  return (
    <Tabs defaultValue={props.questions.length ? 'publish' : 'questions'}>
      <TabsList>
        <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
        <TabsTrigger value="questions">{t('tabs.questions')} ({props.questions.length})</TabsTrigger>
        <TabsTrigger value="audience">{t('tabs.audience')}</TabsTrigger>
        <TabsTrigger value="publish">{t('tabs.publish')}</TabsTrigger>
      </TabsList>
      <TabsContent value="settings" className="pt-4"><ExamSettingsForm exam={props.exam} locked={props.locked} subjects={props.subjects} /></TabsContent>
      <TabsContent value="questions" className="pt-4"><QuestionsTab {...props} /></TabsContent>
      <TabsContent value="audience" className="pt-4"><AudienceTab {...props} /></TabsContent>
      <TabsContent value="publish" className="pt-4"><PublishTab {...props} /></TabsContent>
    </Tabs>
  );
}

function SortableRow({ q, index, total, onMove, onRemove, locked }: { q: Q; index: number; total: number; onMove: (from: number, to: number) => void; onRemove: () => void; locked: boolean }) {
  const t = useTranslations('admin.builder');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id, disabled: locked });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={cn('flex items-start gap-2 rounded-md border border-border bg-surface p-2', isDragging && 'shadow-lg ring-2 ring-primary')}
    >
      <button type="button" aria-label={t('drag')} className="flex size-9 shrink-0 cursor-grab items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 disabled:cursor-not-allowed" disabled={locked} {...attributes} {...listeners}>
        <GripVertical aria-hidden className="size-4" />
      </button>
      <span className="mt-2 w-7 shrink-0 font-num text-sm font-semibold text-fg-muted">{index + 1}.</span>
      <div className="min-w-0 flex-1">
        <RichText html={q.stemHtml} className="line-clamp-2 text-sm" />
        <span className="text-xs text-fg-subtle">{q.chapterLabel}</span>
      </div>
      <span className="flex shrink-0">
        <Button size="icon" variant="ghost" aria-label={t('moveUp')} disabled={locked || index === 0} onClick={() => onMove(index, index - 1)}><ArrowUp aria-hidden className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={t('moveDown')} disabled={locked || index === total - 1} onClick={() => onMove(index, index + 1)}><ArrowDown aria-hidden className="size-4" /></Button>
        <Button size="icon" variant="ghost" aria-label={t('remove')} disabled={locked} onClick={onRemove}><X aria-hidden className="size-4" /></Button>
      </span>
    </li>
  );
}

function QuestionsTab({ exam, locked, questions: initial, chapters }: BuilderProps) {
  const t = useTranslations('admin.builder');
  const { run, pending } = useAction();
  const [selected, setSelected] = useState<Q[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [filters, setFilters] = useState({ chapterId: '', q: '' });
  const [bank, setBank] = useState<Q[]>([]);
  const [searching, setSearching] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  async function search() {
    setSearching(true);
    const result = await searchBank({
      ...(filters.chapterId ? { chapterId: filters.chapterId } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      page: 1,
    });
    if (result.ok) {
      setBank(result.data.items.map((r) => ({ id: r.id, stemHtml: r.stemHtml, status: r.status, chapterLabel: r.chapter ? `${r.chapter.number}. ${r.chapter.name_en}` : '' })));
    }
    setSearching(false);
  }
  useEffect(() => {
    let active = true;
    void searchBank({ page: 1 }).then((result) => {
      if (active && result.ok) setBank(result.data.items.map((r) => ({ id: r.id, stemHtml: r.stemHtml, status: r.status, chapterLabel: r.chapter ? `${r.chapter.number}. ${r.chapter.name_en}` : '' })));
    });
    return () => {
      active = false;
    };
  }, []);

  const move = (from: number, to: number) => {
    setSelected((list) => arrayMove(list, from, to));
    setDirty(true);
  };
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    move(selected.findIndex((q) => q.id === active.id), selected.findIndex((q) => q.id === over.id));
  };
  const ids = new Set(selected.map((q) => q.id));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('bank')}</h2>
        <form className="grid gap-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <Select value={filters.chapterId} onChange={(e) => setFilters((f) => ({ ...f, chapterId: e.target.value }))} aria-label={t('chapter')}>
            <option value="">{t('allChapters')}</option>
            {chapters.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <div className="flex gap-2">
            <Input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder={t('search')} aria-label={t('search')} />
            <Button type="submit" size="icon" variant="secondary" aria-label={t('search')} loading={searching}><Search aria-hidden className="size-4" /></Button>
          </div>
        </form>
        <ul className="flex max-h-dvh-75 flex-col gap-2 overflow-y-auto">
          {bank.map((q) => (
            <li key={q.id} className="flex items-start gap-2 rounded-md border border-border p-2">
              <div className="min-w-0 flex-1">
                <RichText html={q.stemHtml} className="line-clamp-2 text-sm" />
                <span className="text-xs text-fg-subtle">{q.chapterLabel}</span>
              </div>
              {ids.has(q.id) ? (
                <Badge variant="success">{t('added')}</Badge>
              ) : (
                <Button size="sm" variant="secondary" disabled={locked} leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => { setSelected((list) => [...list, q]); setDirty(true); }}>{t('add')}</Button>
              )}
            </li>
          ))}
          {bank.length === 0 && !searching ? <p className="text-sm text-fg-muted">{t('noResults')}</p> : null}
        </ul>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-fg">{t('selectedTitle', { n: selected.length, marks: selected.length * Number(exam.marks_per_question) })}</h2>
          <Button loading={pending} disabled={locked || !dirty} onClick={async () => (await run(() => setExamQuestions({ id: exam.id, questionIds: selected.map((q) => q.id) }), { success: t('savedQuestions') })).ok && setDirty(false)}>{t('saveQuestions')}</Button>
        </div>
        {locked ? <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{t('lockedQuestions')}</p> : null}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={selected.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2">
              {selected.map((q, index) => (
                <SortableRow key={q.id} q={q} index={index} total={selected.length} locked={locked} onMove={move} onRemove={() => { setSelected((list) => list.filter((x) => x.id !== q.id)); setDirty(true); }} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        {selected.length === 0 ? <p className="text-sm text-fg-muted">{t('emptySelection')}</p> : null}
      </Card>
    </div>
  );
}

function AudienceTab({ exam, assignees, labels }: BuilderProps) {
  const t = useTranslations('admin.builder');
  const { run, pending } = useAction();
  const [audience, setAudience] = useState(exam.audience);
  const [chosen, setChosen] = useState<Student[]>(assignees);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);

  async function find(input: { q?: string; label?: string }, addAll = false) {
    const result = await searchStudentsForAudience(input);
    if (!result.ok) return;
    if (addAll) setChosen((list) => [...list, ...result.data.filter((s) => !list.some((x) => x.id === s.id))]);
    else setResults(result.data);
  }

  return (
    <Card className="flex max-w-app flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold text-fg">{t('audienceTitle')}</legend>
        {(['all_active', 'selected'] as const).map((value) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="audience" className="size-5 accent-primary" checked={audience === value} onChange={() => setAudience(value)} />
            {t(`audience.${value}`)}
          </label>
        ))}
      </fieldset>
      {audience === 'selected' ? (
        <>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find({ q: query }); }}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('studentSearch')} aria-label={t('studentSearch')} />
            <Button type="submit" variant="secondary">{t('search')}</Button>
          </form>
          {labels.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-fg-muted">{t('addLabel')}</span>
              {labels.map((label) => <Button key={label} size="sm" variant="ghost" onClick={() => void find({ label }, true)}>{label}</Button>)}
            </div>
          ) : null}
          {results.length ? (
            <ul className="flex flex-col gap-1">
              {results.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm">
                  <span><span className="font-num">{s.mobile}</span> · {s.email}</span>
                  <Button size="sm" variant="secondary" disabled={chosen.some((c) => c.id === s.id)} onClick={() => setChosen((list) => [...list, s])}>{t('add')}</Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <p className="mb-2 text-sm font-semibold text-fg">{t('chosen', { n: chosen.length })}</p>
            <ul className="flex flex-wrap gap-2">
              {chosen.map((s) => (
                <li key={s.id}>
                  <Badge variant="primary" className="h-8 gap-1.5 pr-1 font-num text-sm">
                    {s.mobile}
                    <button type="button" aria-label={t('remove')} className="flex size-6 items-center justify-center rounded-sm hover:bg-primary/10" onClick={() => setChosen((list) => list.filter((x) => x.id !== s.id))}><X aria-hidden className="size-3.5" /></button>
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
      <Button className="self-start" loading={pending} onClick={() => run(() => setExamAudience({ id: exam.id, audience, studentIds: chosen.map((s) => s.id) }), { success: t('savedAudience') })}>{t('saveAudience')}</Button>
    </Card>
  );
}

function PublishTab({ exam, questions, attemptCount, startPassed }: BuilderProps) {
  const t = useTranslations('admin.builder');
  const { run, pending } = useAction();
  const checks = [
    { ok: exam.title.trim().length > 0, label: t('checks.title') },
    { ok: questions.length > 0, label: t('checks.questions') },
    { ok: questions.every((q) => q.status === 'active'), label: t('checks.active') },
    { ok: exam.is_sample || Boolean(exam.starts_at && exam.live_ends_at), label: t('checks.times') },
    { ok: exam.is_sample || exam.access_mode !== 'window' || Boolean(exam.late_until), label: t('checks.window') },
  ];
  const ready = checks.every((c) => c.ok);
  return (
    <div className="flex max-w-app flex-col gap-4">
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={exam.status === 'published' ? 'success' : exam.status === 'archived' ? 'neutral' : 'warning'}>{t(`status.${exam.status}`)}</Badge>
          <Badge variant="info">{t(`phase.${exam.phase}`)}</Badge>
          <span className="text-sm text-fg-muted">{t('attempts', { n: attemptCount })}</span>
        </div>
        <ul className="flex flex-col gap-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              {c.ok ? <CircleCheck aria-hidden className="size-5 text-success" /> : <CircleX aria-hidden className="size-5 text-danger" />}
              <span className={c.ok ? 'text-fg' : 'text-danger'}>{c.label}</span>
            </li>
          ))}
        </ul>
        {!exam.is_sample && startPassed && exam.status === 'draft' ? <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{t('liveNowWarning')}</p> : null}
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary"><Link href={`/admin/exams/${exam.id}/preview`}>{t('preview')}</Link></Button>
        {exam.status === 'draft' ? <Button disabled={!ready} loading={pending} onClick={() => run(() => publishExam({ id: exam.id }), { success: t('published') })}>{t('publish')}</Button> : null}
        {exam.status === 'published' && attemptCount === 0 ? <Button variant="secondary" loading={pending} onClick={() => run(() => unpublishExam({ id: exam.id }), { success: t('unpublished') })}>{t('unpublish')}</Button> : null}
        {exam.status === 'published' && exam.phase === 'closed' ? <Button variant="secondary" loading={pending} onClick={() => run(() => archiveExam({ id: exam.id }), { success: t('archived') })}>{t('archive')}</Button> : null}
        {exam.status === 'published' && !exam.is_sample ? (
          <Button variant="ghost" loading={pending} leadingIcon={<Star aria-hidden className={cn('size-4', exam.is_featured && 'fill-warning text-warning')} />} onClick={() => run(() => setFeaturedExam({ id: exam.is_featured ? null : exam.id }), { success: t('featuredSaved') })}>
            {exam.is_featured ? t('unfeature') : t('feature')}
          </Button>
        ) : null}
        {attemptCount > 0 ? <Button asChild variant="ghost"><Link href={`/admin/exams/${exam.id}/results`}>{t('results')}</Link></Button> : null}
      </div>
    </div>
  );
}
