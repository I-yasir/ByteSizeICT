/**
 * Isomorphic error vocabulary and result envelope (docs/02_AppFlow.md §7.1, §7.8).
 * Server-side helpers live in `src/lib/http.ts`.
 */
export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'LOCKED',
  'SUSPENDED',
  'ACCESS_INACTIVE',
  'PIN_SAME_AS_OLD',
  'PIN_TOO_WEAK',
  'TRX_DUPLICATE',
  'PENDING_EXISTS',
  'ADMISSION_NOT_PENDING',
  'EXAM_NOT_AVAILABLE',
  'EXAM_NOT_STARTED',
  'EXAM_INVALID_TIMES',
  'EXAM_NO_QUESTIONS',
  'EXAM_INACTIVE_QUESTIONS',
  'EXAM_LOCKED',
  'ATTEMPT_CLOSED',
  'QUESTION_DUPLICATE',
  'QUESTION_LOCKED_CORRECT_OPTION',
  'QUESTION_IN_USE',
  'IMPORT_BAD_HEADERS',
  'IMPORT_TOO_LARGE',
  'IMPORT_IMAGE_INVALID',
  'IMPORT_IMAGE_UNSUPPORTED',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionError = {
  code: ErrorCode;
  /** next-intl key, e.g. `errors.trxDuplicate` */
  message: string;
  field?: string;
  meta?: Record<string, unknown>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/** `TRX_DUPLICATE` → `errors.trxDuplicate` */
export function errorMessageKey(code: ErrorCode): string {
  const camel = code.toLowerCase().replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  return `errors.${camel}`;
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  options: { message?: string; field?: string; meta?: Record<string, unknown> } = {},
): ActionResult<T> {
  const error: ActionError = { code, message: options.message ?? errorMessageKey(code) };
  if (options.field) error.field = options.field;
  if (options.meta) error.meta = options.meta;
  return { ok: false, error };
}
