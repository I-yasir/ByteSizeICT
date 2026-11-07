import 'server-only';
import type { ZodType, z } from 'zod';
import { type AdminContext, getAdminAuth, getStudentAuth, type StudentContext } from '@/lib/auth/guards';
import { type ActionResult, fail, failFromZod, mapDbError } from '@/lib/http';

/**
 * Server Action plumbing (TRD §4.5): authenticate → Zod-parse → run the service → envelope.
 * Database errors raised as canonical codes become `{ ok: false }`; anything else is logged and
 * reported as INTERNAL with a request id (never a stack trace).
 */
export class ServiceError extends Error {
  constructor(
    public readonly code: Parameters<typeof fail>[0],
    public readonly options: Parameters<typeof fail>[1] = {},
  ) {
    super(code);
  }
}

export function toFailure<T>(error: unknown, context: string): ActionResult<T> {
  if (error instanceof ServiceError) return fail(error.code, error.options);
  const code = mapDbError(error as { message?: string; code?: string });
  if (code !== 'INTERNAL') return fail(code);
  const requestId = crypto.randomUUID();
  console.error(JSON.stringify({ level: 'error', requestId, context, error: String((error as Error)?.message ?? error) }));
  return fail('INTERNAL', { meta: { requestId } });
}

export async function run<T>(context: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return toFailure<T>(error, context);
  }
}

export function adminAction<S extends ZodType, T>(
  context: string,
  schema: S,
  handler: (input: z.output<S>, admin: AdminContext) => Promise<T>,
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const auth = await getAdminAuth();
    if (!auth.ok) return fail(auth.code);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return failFromZod(parsed.error);
    return run(context, () => handler(parsed.data, auth.context));
  };
}

export function studentAction<S extends ZodType, T>(
  context: string,
  schema: S,
  handler: (input: z.output<S>, student: StudentContext) => Promise<T>,
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const auth = await getStudentAuth();
    if (!auth.ok) return fail(auth.code);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return failFromZod(parsed.error);
    return run(context, () => handler(parsed.data, auth.context));
  };
}

/**
 * Generated RPC types mark every argument without a SQL default as non-null, although the SQL
 * functions accept NULL. Pass this (and only this) where a nullable argument is intentionally null.
 */
export const SQL_NULL = null as never;

type DbResult<T> = { data: T; error: { message?: string; code?: string } | null };

/** Throws a ServiceError (canonical code) or Error (anything else) for a PostgREST error. */
export function check(result: { error: { message?: string; code?: string } | null }): void {
  if (!result.error) return;
  const code = mapDbError(result.error);
  if (code !== 'INTERNAL') throw new ServiceError(code);
  throw new Error(result.error.message ?? 'database error');
}

/** Data that must exist (select lists, .single(), RPCs returning values). */
export function unwrap<T>(result: DbResult<T>): NonNullable<T> {
  check(result);
  if (result.data === null || result.data === undefined) throw new Error('database returned no data');
  return result.data as NonNullable<T>;
}

/** Data that may legitimately be null (.maybeSingle()). */
export function unwrapMaybe<T>(result: DbResult<T>): T {
  check(result);
  return result.data;
}
