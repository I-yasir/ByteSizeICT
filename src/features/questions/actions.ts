'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminAction } from '@/lib/actions';
import { commitImport as commit, parseImportFile, previewImport as preview } from './import';
import {
  commitImportSchema,
  createQuestionSchema,
  mediaUploadSchema,
  questionIdsSchema,
  setStatusSchema,
  updateQuestionSchema,
} from './schemas';
import * as service from './service';

const refresh = <T>(result: T): T => {
  revalidatePath('/admin/questions', 'layout');
  return result;
};

export const createQuestion = adminAction('questions.create', createQuestionSchema, async (input, { admin }) =>
  refresh(await service.createQuestion(admin.id, input.question, input.force)),
);

export const updateQuestion = adminAction('questions.update', updateQuestionSchema, async (input, { admin }) =>
  refresh(await service.updateQuestion(admin.id, input.id, input.question, input.force)),
);

export const duplicateQuestion = adminAction('questions.duplicate', z.object({ id: z.uuid() }), async (input, { admin }) =>
  refresh(await service.duplicateQuestion(admin.id, input.id)),
);

export const setQuestionStatus = adminAction('questions.status', setStatusSchema, async (input) =>
  refresh(await service.setQuestionStatus(input.ids, input.status)),
);

export const deleteQuestions = adminAction('questions.delete', questionIdsSchema, async (input, { admin }) =>
  refresh(await service.deleteQuestions(admin.id, input.ids)),
);

export const createMediaUploadUrl = adminAction('questions.upload', mediaUploadSchema, async (input) =>
  service.createMediaUploadUrl(input.ext),
);

export const getQuestionUsage = adminAction('questions.usage', z.object({ id: z.uuid() }), async (input) =>
  service.questionUsage(input.id),
);

/** FormData with a `file` field (CSV/XLSX). */
const fileSchema = z.instanceof(FormData).transform((form, ctx) => {
  const file = form.get('file');
  if (!(file instanceof File)) {
    ctx.addIssue({ code: 'custom', path: ['file'], message: 'errors.validation' });
    return z.NEVER;
  }
  return file;
});

export const previewImport = adminAction('questions.importPreview', fileSchema, async (file, { admin }) => {
  return preview(admin.id, await parseImportFile({ name: file.name, bytes: await file.arrayBuffer() }));
});

export const commitImport = adminAction('questions.importCommit', commitImportSchema, async (input, { admin }) =>
  refresh(await commit(admin.id, input)),
);

const previewSchema = z.object({
  stem: z.string().max(4000),
  options: z.array(z.string().max(1000)).length(4),
  explanation: z.string().max(8000).default(''),
  imagePaths: z.array(z.string().regex(/^questions\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/)).max(6).default([]),
});

/** Live preview for the editor: the same server renderer students get (docs/02_AppFlow.md §6.6). */
export const previewQuestion = adminAction('questions.preview', previewSchema, async (input) => {
  const [{ renderRichText }, { signQuestionMedia }] = await Promise.all([import('@/lib/content/render'), import('@/lib/supabase/storage')]);
  const urls = await signQuestionMedia(input.imagePaths, 3600);
  return {
    stemHtml: renderRichText(input.stem),
    optionsHtml: input.options.map((text) => renderRichText(text)),
    explanationHtml: renderRichText(input.explanation),
    imageUrls: Object.fromEntries(urls),
  };
});

/** Bank browser inside the exam builder: active questions only. */
export const searchBank = adminAction(
  'questions.searchBank',
  z.object({
    chapterId: z.uuid().optional(),
    q: z.string().max(200).optional(),
    page: z.number().int().min(1).default(1),
  }),
  async (input) => {
    const { searchQuestions } = await import('./queries');
    return searchQuestions({ ...input, status: ['active'], pageSize: 20 });
  },
);
