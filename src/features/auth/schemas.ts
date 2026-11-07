import { z } from 'zod';
import { emailSchema, mobileSchema, pinSchema } from '@/lib/validation';

/** Isomorphic auth input schemas. Issue messages are next-intl keys. */

const nextPathSchema = z.string().max(512).optional();

export const studentLoginSchema = z.object({
  mobile: mobileSchema,
  pin: pinSchema,
  remember: z.boolean().default(true),
  next: nextPathSchema,
});
export type StudentLoginInput = z.output<typeof studentLoginSchema>;

export const changePinForcedSchema = z
  .object({ newPin: pinSchema, confirm: z.string() })
  .refine((value) => value.newPin === value.confirm, { path: ['confirm'], message: 'errors.validation' });

export const changePinSchema = z
  .object({ currentPin: pinSchema, newPin: pinSchema, confirm: z.string() })
  .refine((value) => value.newPin === value.confirm, { path: ['confirm'], message: 'errors.validation' });

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  next: nextPathSchema,
});
export type AdminLoginInput = z.output<typeof adminLoginSchema>;
