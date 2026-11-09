import { z } from 'zod';
import { uuidSchema } from '@/lib/validation';

/** Subjects → chapters → topics (PRD A-06; tags removed in R1.1). Isomorphic. */
const name = z.string().trim().min(1).max(120);
const sortOrder = z.number().int().min(0).max(1000).default(0);

export const subjectSchema = z.object({
  id: uuidSchema.optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, 'errors.validation'),
  nameBn: name,
  nameEn: name,
  sortOrder,
});
export const chapterSchema = z.object({
  id: uuidSchema.optional(),
  subjectId: uuidSchema,
  number: z.number().int().min(1).max(50),
  nameBn: name,
  nameEn: name,
  sortOrder,
});
export const topicSchema = z.object({ id: uuidSchema.optional(), chapterId: uuidSchema, nameBn: name, nameEn: name, sortOrder });
export const idSchema = z.object({ id: uuidSchema });
