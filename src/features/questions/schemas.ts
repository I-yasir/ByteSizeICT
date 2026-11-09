import { z } from 'zod';
import { IMAGE_COLUMNS, UPLOAD_URL_BATCH } from '@/lib/import/columns';
import { optionalText, optionKeySchema, paginationSchema, uuidSchema } from '@/lib/validation';

/** Question bank inputs (PRD A-06…A-09, TRD §10.7 length limits). Isomorphic. */
export const contentStatusSchema = z.enum(['draft', 'active', 'archived']);

const imagePath = z
  .string()
  .regex(/^questions\/[0-9a-f-]{36}\.(png|jpe?g|webp)$/, 'errors.validation')
  .nullish()
  .transform((value) => value ?? null);
const optionText = z.string().trim().max(1000).default('');

export const questionInputSchema = z
  .object({
    chapterId: uuidSchema,
    topicId: uuidSchema.nullish().transform((value) => value ?? null),
    stem: z.string().trim().min(1).max(4000),
    stemImagePath: imagePath,
    optionA: optionText,
    optionAImagePath: imagePath,
    optionB: optionText,
    optionBImagePath: imagePath,
    optionC: optionText,
    optionCImagePath: imagePath,
    optionD: optionText,
    optionDImagePath: imagePath,
    correctOption: optionKeySchema,
    explanation: optionalText(8000),
    explanationImagePath: imagePath,
    status: contentStatusSchema.default('draft'),
  })
  .superRefine((q, ctx) => {
    for (const key of ['A', 'B', 'C', 'D'] as const) {
      if (!q[`option${key}`] && !q[`option${key}ImagePath`]) {
        ctx.addIssue({ code: 'custom', path: [`option${key}`], message: 'errors.validation' });
      }
    }
  });
export type QuestionInput = z.output<typeof questionInputSchema>;

export const createQuestionSchema = z.object({ question: questionInputSchema, force: z.boolean().default(false) });
export const updateQuestionSchema = z.object({ id: uuidSchema, question: questionInputSchema, force: z.boolean().default(false) });
export const questionIdsSchema = z.object({ ids: z.array(uuidSchema).min(1).max(500) });
export const setStatusSchema = questionIdsSchema.extend({ status: contentStatusSchema });
export const mediaUploadSchema = z.object({ ext: z.enum(['png', 'jpg', 'jpeg', 'webp']) });

export const questionSearchSchema = paginationSchema.extend({
  subjectId: uuidSchema.optional(),
  chapterId: uuidSchema.optional(),
  topicId: uuidSchema.optional(),
  status: z.array(contentStatusSchema).min(1).default(['active', 'draft']),
  unusedOnly: z.boolean().default(false),
  q: z.string().max(200).optional(),
  sort: z.enum(['newest', 'most_used', 'lowest_correct']).default('newest'),
});
export type QuestionSearch = z.input<typeof questionSearchSchema>;

/** Browser-side import (TRD §8.12): signed upload URLs, then preview/commit/cancel by batch id. */
const importUploadFileSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rows') }),
  z.object({ kind: z.literal('image'), row: z.number().int().min(2).max(1_048_576), column: z.enum(IMAGE_COLUMNS), ext: z.enum(['png', 'jpg', 'webp']) }),
]);
export type ImportUploadFile = z.output<typeof importUploadFileSchema>;
export const importUploadUrlsSchema = z.object({ batchId: uuidSchema, files: z.array(importUploadFileSchema).min(1).max(UPLOAD_URL_BATCH) });
export const importBatchSchema = z.object({ batchId: uuidSchema });
export const commitImportSchema = z.object({ importToken: uuidSchema, defaultStatus: contentStatusSchema.default('draft') });
