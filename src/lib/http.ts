import 'server-only';
import { headers } from 'next/headers';
import type { ZodError } from 'zod';
import { env } from '@/lib/env';
import { type ActionResult, type ErrorCode, fail, isErrorCode } from '@/lib/errors';

export * from '@/lib/errors';

type DbError = { message?: string; code?: string } | null | undefined;

/**
 * Maps a PostgREST/Postgres error to a canonical ErrorCode. SQL functions raise the code itself as
 * the exception message (errcode P0001); constraint/format violations become VALIDATION.
 */
export function mapDbError(error: DbError): ErrorCode {
  if (!error) return 'INTERNAL';
  if (isErrorCode(error.message)) return error.message;
  switch (error.code) {
    case '22P02': // invalid_text_representation (bad enum/uuid)
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
    case '23502': // not_null_violation
    case '23514': // check_violation
    case '23503': // foreign_key_violation
      return 'VALIDATION';
    default:
      return 'INTERNAL';
  }
}

export function failFromZod<T = never>(error: ZodError): ActionResult<T> {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join('.') || undefined;
  // Schemas carry i18n keys as issue messages (e.g. `errors.mobileInvalid`).
  const message = issue?.message.startsWith('errors.') ? issue.message : undefined;
  return fail('VALIDATION', { ...(field ? { field } : {}), ...(message ? { message } : {}) });
}

const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  SESSION_REVOKED: 401,
  FORBIDDEN: 403,
  ACCESS_INACTIVE: 403,
  SUSPENDED: 403,
  NOT_FOUND: 404,
  EXAM_NOT_AVAILABLE: 404,
  RATE_LIMITED: 429,
  LOCKED: 429,
  INVALID_CREDENTIALS: 401,
  EXAM_NOT_STARTED: 409,
  ATTEMPT_CLOSED: 409,
  ADMISSION_NOT_PENDING: 409,
  TRX_DUPLICATE: 409,
  PENDING_EXISTS: 409,
  EXAM_LOCKED: 409,
  INTERNAL: 500,
};

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code] ?? 400;
}

/** JSON response with the envelope and a status derived from the error code (TRD §7). */
export function jsonResult<T>(result: ActionResult<T>): Response {
  return Response.json(result, {
    status: result.ok ? 200 : httpStatusFor(result.error.code),
    headers: { 'Cache-Control': 'no-store' },
  });
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** Mutating Route Handlers must be same-origin (TRD §6.4). */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin === env.NEXT_PUBLIC_SITE_URL) return true;
  return env.VERCEL_ENV !== 'production' && LOCAL_ORIGIN.test(origin);
}

export type RequestContext = { ip: string; userAgent: string | null };

/** Client IP = first `x-forwarded-for` entry (set by Vercel), then `x-real-ip`. */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || h.get('x-real-ip')?.trim() || '0.0.0.0';
  return { ip, userAgent: h.get('user-agent')?.slice(0, 400) ?? null };
}
