'use client';

import { CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/client';
import { type DragEvent, useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { commitImport, previewImport } from '@/features/questions/actions';
import type { ImportPreview } from '@/features/questions/import';
import { cn } from '@/lib/utils';

/** Upload → validation preview → commit → result (docs/02_AppFlow.md §6.7). */
export function ImportWizard() {
  const t = useTranslations('admin.import');
  const errorText = useErrorMessage();
  const { run, pending } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<'draft' | 'active'>('draft');
  const [result, setResult] = useState<{ imported: number; duplicatesSkipped: number; invalid: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function validate(selected: File) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setFileError(null);
    const form = new FormData();
    form.set('file', selected);
    const response = await run(() => previewImport(form), { refresh: false, silentError: true });
    if (response.ok) setPreview(response.data);
    else setFileError(errorText(response.error));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) void validate(dropped);
  }

  function downloadErrors() {
    if (!preview) return;
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = `﻿row,column,message\n${preview.errors.map((e) => [String(e.row), e.column, e.message].map(escape).join(',')).join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function commit() {
    if (!preview?.importToken) return;
    const response = await run(() => commitImport({ importToken: preview.importToken as string, defaultStatus: status }), { refresh: false });
    if (response.ok) {
      setResult(response.data);
      setPreview(null);
      setFile(null);
    }
  }

  return (
    <div className="flex max-w-app flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('step1')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" leadingIcon={<Download aria-hidden className="size-4" />}><a href="/api/admin/questions/template?format=xlsx">{t('templateXlsx')}</a></Button>
          <Button asChild variant="secondary" leadingIcon={<Download aria-hidden className="size-4" />}><a href="/api/admin/questions/template?format=csv">{t('templateCsv')}</a></Button>
        </div>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center', dragging ? 'border-primary bg-primary-soft' : 'border-border-strong')}
        >
          <Upload aria-hidden className="size-8 text-fg-subtle" />
          <span className="font-semibold text-fg">{file ? file.name : t('drop')}</span>
          <span className="text-sm text-fg-muted">{t('limits')}</span>
          <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void validate(f); e.target.value = ''; }} />
        </label>
        {pending && !preview ? <p className="text-sm text-fg-muted">{t('validating')}</p> : null}
        {fileError ? <Banner variant="danger">{fileError}</Banner> : null}
      </Card>

      {preview ? (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold text-fg">{t('step2')}</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              [t('valid'), preview.valid, 'text-success'],
              [t('invalid'), preview.invalid, 'text-danger'],
              [t('duplicates'), preview.duplicates, 'text-warning'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-md bg-surface-2 p-3">
                <dt className="text-xs text-fg-muted">{label}</dt>
                <dd className={cn('font-num text-2xl font-bold', color as string)}>{value}</dd>
              </div>
            ))}
          </dl>
          {preview.ignoredColumns.length ? (
            <Banner variant="info" role="status">{t('legacyColumns', { columns: preview.ignoredColumns.join(', ') })}</Banner>
          ) : null}
          {preview.errors.length ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-fg">{t('errorsTitle')}</h3>
                <Button size="sm" variant="ghost" leadingIcon={<FileSpreadsheet aria-hidden className="size-4" />} onClick={downloadErrors}>{t('downloadErrors')}</Button>
              </div>
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2 text-left text-xs text-fg-muted"><tr><th className="px-3 py-2">{t('row')}</th><th className="px-3 py-2">{t('column')}</th><th className="px-3 py-2">{t('message')}</th></tr></thead>
                  <tbody>
                    {preview.errors.map((e, i) => (
                      <tr key={i} className="border-t border-border"><td className="px-3 py-2 font-num">{e.row}</td><td className="px-3 py-2 font-mono text-xs">{e.column}</td><td className="px-3 py-2">{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {preview.duplicateRows.length ? (
            <p className="text-sm text-fg-muted">{t('duplicateRows', { rows: preview.duplicateRows.map((d) => d.row).join(', ') })}</p>
          ) : null}
          {preview.importToken ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label={t('defaultStatus')} className="sm:w-56">
                {(p) => (
                  <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'active')}>
                    <option value="draft">{t('statusDraft')}</option>
                    <option value="active">{t('statusActive')}</option>
                  </Select>
                )}
              </Field>
              <Button loading={pending} onClick={commit}>{t('importN', { n: preview.valid })}</Button>
            </div>
          ) : (
            <Banner variant="info">{t('nothingToImport')}</Banner>
          )}
        </Card>
      ) : null}

      {result ? (
        <Card className="flex items-start gap-3">
          <CircleCheck aria-hidden className="size-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-fg">{t('done', { n: result.imported })}</p>
            <p className="text-sm text-fg-muted">{t('doneDetail', { d: result.duplicatesSkipped, e: result.invalid })}</p>
            <Link href="/admin/questions" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t('toBank')}</Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
