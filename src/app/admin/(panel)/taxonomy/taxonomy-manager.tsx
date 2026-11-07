'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogActions, DialogContent } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/field';
import { deleteTag, deleteTopic, upsertChapter, upsertSubject, upsertTag, upsertTopic } from '@/features/taxonomy/actions';
import type { Taxonomy } from '@/features/taxonomy/queries';

type Editing =
  | { kind: 'subject'; id?: string; slug: string; nameBn: string; nameEn: string }
  | { kind: 'chapter'; id?: string; subjectId: string; number: number; nameBn: string; nameEn: string }
  | { kind: 'topic'; id?: string; chapterId: string; nameBn: string; nameEn: string };

export function TaxonomyManager({ taxonomy }: { taxonomy: Taxonomy }) {
  const t = useTranslations('admin.taxonomy');
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [tagName, setTagName] = useState('');

  async function save() {
    if (!editing) return;
    const result =
      editing.kind === 'subject'
        ? await run(() => upsertSubject({ ...(editing.id ? { id: editing.id } : {}), slug: editing.slug, nameBn: editing.nameBn, nameEn: editing.nameEn }), { success: t('saved') })
        : editing.kind === 'chapter'
          ? await run(() => upsertChapter({ ...(editing.id ? { id: editing.id } : {}), subjectId: editing.subjectId, number: editing.number, nameBn: editing.nameBn, nameEn: editing.nameEn }), { success: t('saved') })
          : await run(() => upsertTopic({ ...(editing.id ? { id: editing.id } : {}), chapterId: editing.chapterId, nameBn: editing.nameBn, nameEn: editing.nameEn }), { success: t('saved') });
    if (result.ok) setEditing(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        {taxonomy.subjects.map((subject) => (
          <Card key={subject.id}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-fg">{subject.name_en} · {subject.name_bn}</h2>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => setEditing({ kind: 'subject', id: subject.id, slug: subject.slug, nameBn: subject.name_bn, nameEn: subject.name_en })}><Pencil aria-hidden className="size-4" /></Button>
                <Button size="sm" variant="secondary" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing({ kind: 'chapter', subjectId: subject.id, number: subject.chapters.length + 1, nameBn: '', nameEn: '' })}>{t('addChapter')}</Button>
              </div>
            </div>
            <ul className="flex flex-col gap-3">
              {subject.chapters.map((chapter) => (
                <li key={chapter.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg"><span className="font-num">{chapter.number}.</span> {chapter.name_en}<span className="block text-sm text-fg-muted">{chapter.name_bn}</span></span>
                    <span className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label={t('edit')} onClick={() => setEditing({ kind: 'chapter', id: chapter.id, subjectId: subject.id, number: chapter.number, nameBn: chapter.name_bn, nameEn: chapter.name_en })}><Pencil aria-hidden className="size-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={t('addTopic')} onClick={() => setEditing({ kind: 'topic', chapterId: chapter.id, nameBn: '', nameEn: '' })}><Plus aria-hidden className="size-4" /></Button>
                    </span>
                  </div>
                  {chapter.topics.length ? (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {chapter.topics.map((topic) => (
                        <li key={topic.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-sm">
                          <button type="button" className="hover:underline" onClick={() => setEditing({ kind: 'topic', id: topic.id, chapterId: chapter.id, nameBn: topic.name_bn, nameEn: topic.name_en })}>{topic.name_en}</button>
                          <button type="button" aria-label={t('deleteTopic', { name: topic.name_en })} className="flex size-7 items-center justify-center rounded-full text-fg-muted hover:bg-surface-3" onClick={() => run(() => deleteTopic({ id: topic.id }), { success: t('deleted') })}>
                            <X aria-hidden className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ))}
        <Button variant="secondary" className="self-start" leadingIcon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing({ kind: 'subject', slug: '', nameBn: '', nameEn: '' })}>{t('addSubject')}</Button>
      </div>

      <Card className="self-start">
        <h2 className="mb-3 text-lg font-semibold text-fg">{t('tags')}</h2>
        <form
          className="mb-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await run(() => upsertTag({ name: tagName }), { success: t('saved') })).ok) setTagName('');
          }}
        >
          <Input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder={t('newTag')} aria-label={t('newTag')} maxLength={40} />
          <Button type="submit" disabled={!tagName.trim()} loading={pending}>{t('add')}</Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {taxonomy.tags.map((tag) => (
            <li key={tag.id}>
              <Badge variant="primary" className="h-8 gap-2 pr-1 text-sm">
                {tag.name}
                <button type="button" aria-label={t('deleteTag', { name: tag.name })} onClick={() => run(() => deleteTag({ id: tag.id }), { success: t('deleted') })} className="flex size-6 items-center justify-center rounded-sm hover:bg-primary/10">
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing ? (
          <DialogContent title={t(`dialog.${editing.kind}`)}>
            <div className="flex flex-col gap-3">
              {editing.kind === 'subject' ? <Field label={t('slug')} helper={t('slugHelp')}>{(p) => <Input {...p} value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />}</Field> : null}
              {editing.kind === 'chapter' ? <Field label={t('number')}>{(p) => <Input {...p} type="number" min={1} max={50} value={editing.number} onChange={(e) => setEditing({ ...editing, number: Number(e.target.value) })} />}</Field> : null}
              <Field label={t('nameEn')}>{(p) => <Input {...p} value={editing.nameEn} onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })} />}</Field>
              <Field label={t('nameBn')}>{(p) => <Input {...p} value={editing.nameBn} onChange={(e) => setEditing({ ...editing, nameBn: e.target.value })} />}</Field>
            </div>
            <DialogActions>
              <Button variant="secondary" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button loading={pending} disabled={!editing.nameEn.trim() || !editing.nameBn.trim()} onClick={save}>{t('save')}</Button>
            </DialogActions>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
