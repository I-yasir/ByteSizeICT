import { z } from 'zod';
import {
  emailSchema,
  isoDateTimeSchema,
  mobileSchema,
  optionalText,
  paginationSchema,
  paymentMethodSchema,
  trxIdSchema,
  uuidSchema,
} from '@/lib/validation';

/** Public enrollment form: exactly 4 required fields, no name (PRD V-06). */
export const submitAdmissionSchema = z.object({
  mobile: mobileSchema,
  email: emailSchema,
  method: paymentMethodSchema,
  trxId: trxIdSchema,
  planId: uuidSchema.nullish().transform((value) => value ?? null),
});
export type SubmitAdmissionInput = z.output<typeof submitAdmissionSchema>;

export const approveAdmissionSchema = z
  .object({
    admissionId: uuidSchema,
    planId: uuidSchema.nullish().transform((value) => value ?? null),
    amountBdt: z.number().int().min(0).max(1_000_000),
    startsAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    note: optionalText(1000),
  })
  .refine((value) => Date.parse(value.expiresAt) > Date.parse(value.startsAt), {
    path: ['expiresAt'],
    message: 'errors.validation',
  });
export type ApproveAdmissionInput = z.output<typeof approveAdmissionSchema>;

export const REJECT_REASONS = ['trx_not_found', 'amount_mismatch', 'duplicate_payment', 'other'] as const;

export const rejectAdmissionSchema = z
  .object({
    admissionId: uuidSchema,
    reason: z.enum(REJECT_REASONS),
    details: optionalText(400),
    sendEmail: z.boolean().default(true),
  })
  .refine((value) => value.reason !== 'other' || Boolean(value.details), {
    path: ['details'],
    message: 'errors.validation',
  });

export const admissionFilterSchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  method: paymentMethodSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  q: z.string().max(100).optional(),
});
export type AdmissionFilter = z.input<typeof admissionFilterSchema>;
