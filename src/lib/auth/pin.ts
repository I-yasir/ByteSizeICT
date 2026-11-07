import 'server-only';
import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { env } from '@/lib/env';

/**
 * PIN + secret hashing (TRD §6.1). argon2id (the library default) with OWASP parameters and
 * AUTH_PEPPER as the argon2 `secret`. Plaintext PINs never leave this process except in the
 * credentials email or the one-time manual-PIN dialog.
 */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

const pepper = () => Buffer.from(env.AUTH_PEPPER, 'base64');

export function hashSecret(plain: string): Promise<string> {
  return hash(plain, { ...ARGON2_OPTIONS, secret: pepper() });
}

export async function verifySecret(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, { secret: pepper() });
  } catch {
    return false; // malformed hash
  }
}

let dummyHashPromise: Promise<string> | undefined;
/** Verified against for unknown accounts so response timing does not reveal account existence. */
export function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashSecret('dummy-pin-for-timing-equalization');
  return dummyHashPromise;
}

const COMMON_WEAK_PINS = new Set([
  '1212', '2580', '1122', '6969', '2000', '1004', '0007', '1313',
  '121212', '112233', '696969', '159753', '123123', '111222', '102030', '147258', '520520',
]);

/** Repeated digit, ±1 sequence (1234, 9876), repeated pair (1212, 4545), or a common PIN. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  if (COMMON_WEAK_PINS.has(pin)) return true;
  if (pin.length % 2 === 0 && pin === pin.slice(0, 2).repeat(pin.length / 2)) return true;
  const digits = [...pin].map(Number);
  const isSequence = (step: number) =>
    digits.every((digit, index) => index === 0 || digit - (digits[index - 1] ?? 0) === step);
  return isSequence(1) || isSequence(-1);
}

export type PinValidation = { ok: true } | { ok: false; reason: 'format' | 'weak' };

export function validatePin(pin: string): PinValidation {
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, reason: 'format' };
  if (isWeakPin(pin)) return { ok: false, reason: 'weak' };
  return { ok: true };
}

/** Cryptographically random 6-digit PIN that passes `validatePin`. */
export function generatePin(): string {
  for (;;) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, '0');
    if (!isWeakPin(pin)) return pin;
  }
}
