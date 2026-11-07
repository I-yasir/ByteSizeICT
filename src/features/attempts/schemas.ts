import { z } from 'zod';
import { optionKeySchema } from '@/lib/validation';

/** Exam runtime request bodies (TRD §7.1). Isomorphic (the client sync queue uses the same shape). */
export const answerChangeSchema = z.object({
  q: z.uuid(),
  o: optionKeySchema.nullable(),
  m: z.boolean(),
  s: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

export const saveAnswersSchema = z.object({
  changes: z.array(answerChangeSchema).min(1).max(200),
  lastQuestionIndex: z.number().int().min(0).max(10_000).optional(),
});

export const submitAttemptSchema = z.object({
  auto: z.boolean().default(false),
  changes: z.array(answerChangeSchema).max(500).default([]),
});

/** keepalive fetches are capped by browsers at ~64 KB; reject larger bodies early. */
export const MAX_RUNTIME_BODY_BYTES = 64 * 1024;
