import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, optionalText, paginationSchema, pinSchema, uuidSchema } from '@/lib/validation';

/** Admin student management inputs (PRD A-05, docs/02_AppFlow.md §6.4). Isomorphic. */
export const studentFilterSchema = paginationSchema.extend({
  state: z.enum(['all', 'active', 'expired', 'cancelled', 'suspended']).default('all'),
  label: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
});
export type StudentFilter = z.input<typeof studentFilterSchema>;

export const extendStudentsSchema = z.object({
  studentIds: z.array(uuidSchema).min(1).max(500),
  days: z.number().int().min(1).max(3650),
});
export const setStudentExpirySchema = z.object({ studentId: uuidSchema, expiresAt: isoDateTimeSchema });
export const studentReasonSchema = z.object({ studentId: uuidSchema, reason: z.string().trim().min(1).max(500) });
export const studentIdSchema = z.object({ studentId: uuidSchema });

export const resetPinSchema = z
  .object({
    studentId: uuidSchema,
    mode: z.enum(['auto', 'manual']),
    pin: pinSchema.optional(),
    sendEmail: z.boolean().default(true),
  })
  .refine((value) => value.mode === 'auto' || Boolean(value.pin), { path: ['pin'], message: 'errors.validation' });

export const updateStudentSchema = z.object({
  studentId: uuidSchema,
  email: emailSchema.optional(),
  adminLabel: optionalText(40).optional(),
  adminNote: optionalText(2000).optional(),
});
