import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ADMIN_COOKIE,
  ADMIN_SLIDE_THRESHOLD_MS,
  type RevokeReason,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  STUDENT_COOKIE,
  STUDENT_REMEMBER_TTL_MS,
} from './constants';

/**
 * Opaque session tokens (TRD §6.2, ADR-02). The cookie holds the random token; the DB holds only
 * sha256(token), so a database leak does not yield usable sessions.
 */
export type Principal = 'student' | 'admin';

const cookieName = (principal: Principal) => (principal === 'student' ? STUDENT_COOKIE : ADMIN_COOKIE);

/** bytea literal accepted by PostgREST for `sessions.token_hash`. */
export function hashToken(token: string): string {
  return `\\x${createHash('sha256').update(token).digest('hex')}`;
}

export type CreatedSession = { token: string; sessionId: string; expiresAt: Date; remember: boolean };

export async function createSession(input: {
  principal: Principal;
  principalId: string;
  remember: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<CreatedSession> {
  const token = randomBytes(env.SESSION_TOKEN_BYTES).toString('base64url');
  const remember = input.principal === 'student' && input.remember;
  const expiresAt = new Date(Date.now() + (remember ? STUDENT_REMEMBER_TTL_MS : SESSION_TTL_MS));

  const { data, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      token_hash: hashToken(token),
      student_id: input.principal === 'student' ? input.principalId : null,
      admin_id: input.principal === 'admin' ? input.principalId : null,
      remember,
      expires_at: expiresAt.toISOString(),
      ip: input.ip,
      user_agent: input.userAgent,
    })
    .select('id')
    .single();
  if (error) throw error;

  return { token, sessionId: data.id, expiresAt, remember };
}

const STUDENT_FIELDS =
  'id, mobile, email, status, must_change_pin, access_starts_at, access_expires_at, plan_id, credentials_status';
const ADMIN_FIELDS = 'id, email, display_name, is_active';

type SessionRow = {
  id: string;
  remember: boolean;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: RevokeReason | null;
};

export type SessionStudent = {
  id: string;
  mobile: string;
  email: string;
  status: 'active' | 'suspended' | 'cancelled';
  must_change_pin: boolean;
  access_starts_at: string;
  access_expires_at: string;
  plan_id: string | null;
  credentials_status: 'pending' | 'sent' | 'failed';
};

export type SessionAdmin = { id: string; email: string; display_name: string; is_active: boolean };

export type SessionLookup<P extends Principal> =
  | { status: 'none' }
  | { status: 'revoked'; reason: RevokeReason | null }
  | { status: 'expired' }
  | {
      status: 'active';
      session: { id: string; remember: boolean; expiresAt: string };
      principal: P extends 'student' ? SessionStudent : SessionAdmin;
    };

/** Resolves a raw token. Independent of cookies so it can be tested directly. */
export async function resolveSessionToken<P extends Principal>(
  principal: P,
  token: string | undefined,
  now = new Date(),
): Promise<SessionLookup<P>> {
  if (!token) return { status: 'none' };

  const fields = principal === 'student' ? `student:students(${STUDENT_FIELDS})` : `admin:admins(${ADMIN_FIELDS})`;
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select(`id, remember, last_seen_at, expires_at, revoked_at, revoke_reason, ${fields}`)
    .eq('token_hash', hashToken(token))
    .not(principal === 'student' ? 'student_id' : 'admin_id', 'is', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: 'none' };

  const row = data as unknown as SessionRow & { student?: SessionStudent | null; admin?: SessionAdmin | null };
  if (row.revoked_at) return { status: 'revoked', reason: row.revoke_reason };
  if (Date.parse(row.expires_at) <= now.getTime()) return { status: 'expired' };

  const subject = principal === 'student' ? row.student : row.admin;
  if (!subject) return { status: 'none' };
  if (principal === 'admin' && !(subject as SessionAdmin).is_active) {
    return { status: 'revoked', reason: 'admin_force_logout' };
  }

  const expiresAt = await touchSession(principal, row, now);
  return {
    status: 'active',
    session: { id: row.id, remember: row.remember, expiresAt },
    principal: subject as P extends 'student' ? SessionStudent : SessionAdmin,
  };
}

/** Throttled last_seen update; admin sessions also slide their expiry (TRD §6.2). */
async function touchSession(principal: Principal, row: SessionRow, now: Date): Promise<string> {
  const update: { last_seen_at?: string; expires_at?: string } = {};
  if (now.getTime() - Date.parse(row.last_seen_at) > SESSION_TOUCH_INTERVAL_MS) {
    update.last_seen_at = now.toISOString();
  }
  if (principal === 'admin' && Date.parse(row.expires_at) - now.getTime() < ADMIN_SLIDE_THRESHOLD_MS) {
    update.expires_at = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  }
  if (Object.keys(update).length > 0) {
    const { error } = await supabaseAdmin.from('sessions').update(update).eq('id', row.id);
    if (error) throw error;
  }
  return update.expires_at ?? row.expires_at;
}

export async function getSession<P extends Principal>(principal: P): Promise<SessionLookup<P>> {
  const token = (await cookies()).get(cookieName(principal))?.value;
  return resolveSessionToken(principal, token);
}

export async function revokeSession(sessionId: string, reason: RevokeReason): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sessions')
    .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq('id', sessionId)
    .is('revoked_at', null);
  if (error) throw error;
}

export async function revokeStudentSessions(
  studentId: string,
  reason: RevokeReason,
  exceptSessionId?: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc('revoke_sessions', {
    p_student_id: studentId,
    p_reason: reason,
    ...(exceptSessionId ? { p_except_session: exceptSessionId } : {}),
  });
  if (error) throw error;
  return data;
}

/** Cookie writes are only allowed in Server Actions and Route Handlers. */
export async function setSessionCookie(principal: Principal, created: CreatedSession): Promise<void> {
  (await cookies()).set(cookieName(principal), created.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    ...(created.remember ? { expires: created.expiresAt } : {}),
  });
}

export async function clearSessionCookie(principal: Principal): Promise<void> {
  (await cookies()).delete(cookieName(principal));
}
