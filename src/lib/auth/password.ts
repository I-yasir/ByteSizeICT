import 'server-only';
import { hashSecret, verifySecret } from './pin';

/** Admin passwords (TRD §6.1): ≥ 12 chars, same argon2id + pepper scheme as PINs. */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 200;

export function isAcceptablePassword(password: string): boolean {
  return password.length >= ADMIN_PASSWORD_MIN_LENGTH && password.length <= ADMIN_PASSWORD_MAX_LENGTH;
}

export const hashPassword = hashSecret;
export const verifyPassword = verifySecret;
