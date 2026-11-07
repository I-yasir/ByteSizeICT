// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generatePin, hashSecret, isWeakPin, validatePin, verifySecret } from '@/lib/auth/pin';

describe('validatePin / isWeakPin', () => {
  it.each(['0000', '1111', '999999', '1234', '123456', '4321', '987654', '1212', '454545', '2580', '112233'])(
    'rejects weak PIN %s',
    (pin) => {
      expect(isWeakPin(pin)).toBe(true);
      expect(validatePin(pin)).toEqual({ ok: false, reason: 'weak' });
    },
  );

  it.each(['123', '1234567', '12a4', '', ' 1357'])('rejects malformed PIN %j', (pin) => {
    expect(validatePin(pin)).toEqual({ ok: false, reason: 'format' });
  });

  it.each(['1357', '246813', '80412', '9075'])('accepts %s', (pin) => {
    expect(validatePin(pin)).toEqual({ ok: true });
  });
});

describe('generatePin', () => {
  it('produces strong 6-digit PINs', () => {
    for (let i = 0; i < 500; i += 1) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(isWeakPin(pin)).toBe(false);
    }
  });
});

describe('hashSecret / verifySecret', () => {
  it('hashes with argon2id and verifies only the right PIN', async () => {
    const hashed = await hashSecret('246813');
    expect(hashed.startsWith('$argon2id$')).toBe(true);
    expect(hashed).toContain('m=19456,t=2,p=1');
    expect(hashed).not.toContain('246813');
    await expect(verifySecret(hashed, '246813')).resolves.toBe(true);
    await expect(verifySecret(hashed, '246814')).resolves.toBe(false);
  });

  it('fails verification under a different pepper', async () => {
    const hashed = await hashSecret('246813');
    const { hash, verify } = await import('@node-rs/argon2');
    const otherPepper = Buffer.alloc(32, 7);
    await expect(verify(hashed, '246813', { secret: otherPepper })).resolves.toBe(false);
    // and a hash made without the pepper does not verify with it
    const unpeppered = await hash('246813');
    await expect(verifySecret(unpeppered, '246813')).resolves.toBe(false);
  });

  it('returns false for malformed hashes', async () => {
    await expect(verifySecret('not-a-hash', '246813')).resolves.toBe(false);
  });
});
