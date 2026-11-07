import { z } from 'zod';
import { optionalIsoDateTime, optionalText, uuidSchema } from '@/lib/validation';

/** Exam builder inputs (PRD A-10, docs/02_AppFlow.md §6.8). Isomorphic. */
export const examSettingsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  subjectId: uuidSchema.nullish().transform((value) => value ?? null),
  chapterLabel: optionalText(80),
  isSample: z.boolean().default(false),
  startsAt: optionalIsoDateTime,
  liveEndsAt: optionalIsoDateTime,
  accessMode: z.enum(['fixed', 'window', 'always']).default('fixed'),
  lateUntil: optionalIsoDateTime,
  durationMinutes: z.number().int().min(1).max(300).default(30),
  marksPerQuestion: z.number().positive().max(100).default(1),
  negativeMark: z.number().min(0).max(100).default(0),
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  allowMarkForReview: z.boolean().default(true),
  resultsPublishAt: optionalIsoDateTime,
  answersPublishAt: optionalIsoDateTime,
  showOptionStats: z.boolean().default(true),
  rankLateAttempts: z.boolean().default(false),
});
export type ExamSettingsInput = z.output<typeof examSettingsSchema>;

export const updateExamSettingsSchema = z.object({ id: uuidSchema, settings: examSettingsSchema });
export const examIdSchema = z.object({ id: uuidSchema });
export const setExamQuestionsSchema = z.object({ id: uuidSchema, questionIds: z.array(uuidSchema).max(300) });
export const setExamAudienceSchema = z.object({
  id: uuidSchema,
  audience: z.enum(['all_active', 'selected']),
  studentIds: z.array(uuidSchema).max(5000).default([]),
});
export const setFeaturedSchema = z.object({ id: uuidSchema.nullable() });
export const examListSchema = z.object({
  phase: z.enum(['all', 'draft', 'scheduled', 'live', 'late_window', 'closed', 'archived']).default('all'),
});
