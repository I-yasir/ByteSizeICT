'use client';

import { CircleCheck, Download, FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/client';
import { type DragEvent, useRef, useState } from 'react';
import { useAction } from '@/components/admin/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { Banner } from '@/components/ui/misc';
import { useErrorMessage } from '@/components/ui/use-error-message';
import { cancelImport, commitImport, createImportUploadUrls, previewImport } from '@/features/questions/actions';
import type { ImportPreview } from '@/features/questions/import';
import type { ImportUploadFile } from '@/features/questions/schemas';
import { errorMessageKey, type ErrorCode } from '@/lib/errors';
import {
  IMAGE_CONTENT_TYPES,
  type ImportIssue,
  type ImportPayload,
  MAX_IMPORT_BYTES,
  stagedImagePath,
  UPLOAD_URL_BATCH,
} from '@/lib/import/columns';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'parsing' | 'uploading' | 'validating' | 'preview';
type Upload = { spec: ImportUploadFile; body: Blob };

/** Concurrent PUTs to signed Storage URLs; resolves false on the first failure. */
async function putAll(items: { url: string; body: Blob }[], onDone: () => void): Promise<boolean> {
  let next = 0;
  let ok = true;
  const worker = async () => {
    while (ok && next < items.length) {
      const item = items[next++] as { url: string; body: Blob };
      const response = await fetch(item.url, { method: 'PUT', headers: { 'content-type': item.body.type }, body: item.body }).catch(() => null);
      if (!response?.ok) ok = false;
      else onDone();
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return ok;
}

/**
 * Upload → validation preview → commit → result (docs/02_AppFlow.md §6.7, TRD §8.12). The file is
 * parsed here in the browser and uploaded straight to Storage, so nothing large reaches the server.
 */
export function ImportWizard() {
  const t = useTranslations('admin.import');
  const errorText = useErrorMessage();
  const { run, pending } = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [status, setStatus] = useState<'draft' | 'active'>('draft');
  const [result, setResult] = useState<{ imported: number; duplicatesSkipped: number; invalid: number; images: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const batchRef = useRef<string | null>(null);

  const codeText = (code: ErrorCode) => errorText({ message: errorMessageKey(code) });
  const issueText = (e: ImportIssue) => (e.image ? t(`imageIssues.${e.image}`) : e.message);

  function discardBatch() {
    const batchId = batchRef.current;
    batchRef.current = null;
    if (batchId) void cancelImport({ batchId });
  }

  function reset() {
    discardBatch();
    setFile(null);
    setPreview(null);
    setPhase('idle');
    setFileError(null);
  }

  function failWith(message: string) {
    discardBatch();
    setFileError(message);
    setPhase('idle');
  }

  async function validate(selected: File) {
    discardBatch();
    setFile(selected);
    setPreview(null);
    setResult(null);
    setFileError(null);
    if (selected.size > MAX_IMPORT_BYTES) return failWith(codeText('IMPORT_TOO_LARGE'));

    setPhase('parsing');
    const { ImportFileError, parseImportFile } = await import('@/lib/import/parse');
    let parsed: Awaited<ReturnType<typeof parseImportFile>>;
    try {
      parsed = await parseImportFile({ name: selected.name, bytes: await selected.arrayBuffer() });
    } catch (error) {
      return failWith(codeText(error instanceof ImportFileError ? error.code : 'INTERNAL'));
    }

    const batchId = crypto.randomUUID();
    batchRef.current = batchId;
    const payload: ImportPayload = {
      version: 1,
      fileName: selected.name,
      headers: parsed.headers,
      rows: parsed.rows,
      images: parsed.images.map((img) => ({ row: img.row, column: img.column, path: stagedImagePath(batchId, img.row, img.column, img.ext) })),
      imageIssues: parsed.imageIssues,
    };
    // Pictures first, rows JSON last: the server reads the JSON and then expects every picture it lists.
    const uploads: Upload[] = [
      ...parsed.images.map((img) => ({
        spec: { kind: 'image' as const, row: img.row, column: img.column, ext: img.ext },
        body: new Blob([img.bytes as Uint8Array<ArrayBuffer>], { type: IMAGE_CONTENT_TYPES[img.ext] }),
      })),
      { spec: { kind: 'rows' as const }, body: new Blob([JSON.stringify(payload)], { type: 'application/json' }) },
    ];

    setPhase('uploading');
    setProgress({ done: 0, total: uploads.length });
    for (let i = 0; i < uploads.length; i += UPLOAD_URL_BATCH) {
      const chunk = uploads.slice(i, i + UPLOAD_URL_BATCH);
      const signed = await createImportUploadUrls({ batchId, files: chunk.map((u) => u.spec) });
      if (batchRef.current !== batchId) return; // cancelled or replaced meanwhile
      if (!signed.ok) return failWith(errorText(signed.error));
      const items = chunk.map((u, j) => ({ url: signed.data[j]?.signedUrl ?? '', body: u.body }));
      const uploaded = await putAll(items, () => setProgress((p) => ({ ...p, done: p.done + 1 })));
      if (batchRef.current !== batchId) return;
      if (!uploaded) return failWith(t('uploadFailed'));
    }

    setPhase('validating');
    const response = await previewImport({ batchId });
    if (batchRef.current !== batchId) return;
    if (!response.ok) return failWith(errorText(response.error));
    setPreview(response.data);
    setPhase('preview');
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
    const csv = `﻿row,column,message\n${preview.errors.map((e) => [String(e.row), e.column, issueText(e)].map(escape).join(',')).join('\n')}\n`;
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
      batchRef.current = null; // the server already cleaned up the batch
      setResult(response.data);
      setPreview(null);
      setFile(null);
      setPhase('idle');
    }
  }

  const busy = phase === 'parsing' || phase === 'uploading' || phase === 'validating';
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex max-w-app flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold text-fg">{t('step1')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" leadingIcon={<Download aria-hidden className="size-4" />}><a href="/api/admin/questions/template?format=xlsx">{t('templateXlsx')}</a></Button>
          <Button asChild variant="secondary" leadingIcon={<Download aria-hidden className="size-4" />}><a href="/api/admin/questions/template?format=csv">{t('templateCsv')}</a></Button>
        </div>
        <p className="text-sm text-fg-muted">{t('imagesHint')}</p>
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center', dragging ? 'border-primary bg-primary-soft' : 'border-border-strong', busy && 'pointer-events-none opacity-60')}
        >
          <Upload aria-hidden className="size-8 text-fg-subtle" />
          <span className="font-semibold text-fg">{file ? file.name : t('drop')}</span>
          <span className="text-sm text-fg-muted">{t('limits')}</span>
          <input type="file" accept=".csv,.xlsx" className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void validate(f); e.target.value = ''; }} />
        </label>
        {phase === 'parsing' ? <p className="text-sm text-fg-muted" role="status">{t('parsing')}</p> : null}
        {phase === 'uploading' ? (
          <div className="flex flex-col gap-1.5" role="status">
            <div className="flex justify-between text-sm text-fg-muted">
              <span>{t('uploading')}</span>
              <span className="font-num">{t('uploadCount', { done: progress.done, total: progress.total })}</span>
            </div>
            <div role="progressbar" aria-label={t('uploading')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
            </div>
          </div>
        ) : null}
        {phase === 'validating' ? <p className="text-sm text-fg-muted" role="status">{t('validating')}</p> : null}
        {busy ? <Button variant="ghost" size="sm" className="self-start" onClick={reset}>{t('cancel')}</Button> : null}
        {fileError ? <Banner variant="danger">{fileError}</Banner> : null}
      </Card>

      {preview ? (
        <Card className="flex flex-col gap-4">
          <h2 className="font-semibold text-fg">{t('step2')}</h2>
          <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              [t('valid'), preview.valid, 'text-success'],
              [t('invalid'), preview.invalid, 'text-danger'],
              [t('duplicates'), preview.duplicates, 'text-warning'],
              [t('images'), preview.images, 'text-fg'],
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
                      <tr key={i} className="border-t border-border"><td className="px-3 py-2 font-num">{e.row}</td><td className="px-3 py-2 font-mono text-xs">{e.column}</td><td className="px-3 py-2">{issueText(e)}</td></tr>
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
              <Button variant="ghost" disabled={pending} onClick={reset}>{t('cancel')}</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Banner variant="info">{t('nothingToImport')}</Banner>
              <Button variant="ghost" className="self-start" onClick={reset}>{t('cancel')}</Button>
            </div>
          )}
        </Card>
      ) : null}

      {result ? (
        <Card className="flex items-start gap-3">
          <CircleCheck aria-hidden className="size-6 shrink-0 text-success" />
          <div>
            <p className="font-semibold text-fg">{t('done', { n: result.imported })}</p>
            <p className="text-sm text-fg-muted">{t('doneDetail', { d: result.duplicatesSkipped, e: result.invalid })}</p>
            {result.images ? <p className="text-sm text-fg-muted">{t('doneImages', { n: result.images })}</p> : null}
            <Link href="/admin/questions" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary">{t('toBank')}</Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
