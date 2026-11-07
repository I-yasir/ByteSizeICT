import { z } from 'zod';
import { isValidMobile, normalizeMobile } from '@/lib/mobile';

/**
 * Shared, isomorphic Zod building blocks (P2.01). Issue messages are next-intl keys so forms can
 * show them directly (docs/02_AppFlow.md §4.3).
 */
export const mobileSchema = z
  .string()
  .max(32, 'errors.mobileInvalid')
  .transform(normalizeMobile)
  .refine(isValidMobile, 'errors.mobileInvalid');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'errors.emailInvalid')
  .pipe(z.email('errors.emailInvalid'));

/** Trim, drop internal spaces, 6–30 of [A-Za-z0-9-]. The DB additionally upper-cases for uniqueness. */
export const trxIdSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => /^[A-Za-z0-9-]{6,30}$/.test(value), 'errors.trxInvalid');

export const pinSchema = z.string().regex(/^\d{4,6}$/, 'errors.validation');

export const paymentMethodSchema = z.enum(['bkash', 'nagad', 'rocket', 'bank'], 'errors.methodRequired');
export const optionKeySchema = z.enum(['A', 'B', 'C', 'D']);

export const uuidSchema = z.uuid();

/** ISO-8601 timestamp with offset (what `<input type="datetime-local">` + client TZ conversion yields). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const optionalIsoDateTime = isoDateTimeSchema.nullish().transform((value) => value ?? null);

/** Optional free text: trims, and turns empty strings into null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type Pagination = z.output<typeof paginationSchema>;

export function pageRange({ page, pageSize }: Pagination): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };

/** Strips characters that would break PostgREST `or=(…)` filter syntax from free-text search. */
export function sanitizeSearch(value: string | null | undefined): string {
  return (value ?? '').replace(/[^\p{L}\p{M}\p{N}@.+\-_ ]/gu, '').trim().slice(0, 100);
}

/** Escapes LIKE wildcards. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
