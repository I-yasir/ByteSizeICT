// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EnvValidationError, parsePublicEnv, parseServerEnv } from '@/lib/env-schema';

const validServerEnv = {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-0123456789abcdef',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-0123456789abcdef',
  AUTH_PEPPER: 'g8wbri93vbyOmLUUcr7F5aR51bZbuzTFwPgzHfDxF6E=',
  CRON_SECRET: 'c'.repeat(64),
};

describe('parseServerEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseServerEnv(validServerEnv);
    expect(env.SESSION_TOKEN_BYTES).toBe(32);
    expect(env.APP_TIMEZONE).toBe('Asia/Dhaka');
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('throws when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omitted, ...rest } = validServerEnv;
    expect(() => parseServerEnv(rest)).toThrow(EnvValidationError);
    expect(() => parseServerEnv(rest)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('treats empty strings as missing', () => {
    expect(() => parseServerEnv({ ...validServerEnv, SUPABASE_SERVICE_ROLE_KEY: '  ' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('rejects a pepper shorter than 32 bytes', () => {
    expect(() => parseServerEnv({ ...validServerEnv, AUTH_PEPPER: 'c2hvcnQ=' })).toThrow(
      /AUTH_PEPPER/,
    );
  });

  it('rejects a site URL with a trailing slash', () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, NEXT_PUBLIC_SITE_URL: 'https://example.com/' }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it('requires Google credentials when a sheet id is set', () => {
    expect(() =>
      parseServerEnv({ ...validServerEnv, GOOGLE_SHEET_ID: '1AbCdEfGhIjKlMnOp' }),
    ).toThrow(/GOOGLE_SA_EMAIL/);
  });

  it('unescapes \\n in the Google private key', () => {
    const env = parseServerEnv({
      ...validServerEnv,
      GOOGLE_SHEET_ID: '1AbCdEfGhIjKlMnOp',
      GOOGLE_SA_EMAIL: 'sync@project.iam.gserviceaccount.com',
      GOOGLE_SA_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n',
    });
    expect(env.GOOGLE_SA_PRIVATE_KEY).toContain('\nabc\n');
  });

  it('requires Resend settings in production only', () => {
    expect(() => parseServerEnv({ ...validServerEnv, VERCEL_ENV: 'production' })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => parseServerEnv({ ...validServerEnv, VERCEL_ENV: 'preview' })).not.toThrow();
  });

  it('does not echo secret values in the error message', () => {
    const secret = 'super-secret-value-that-is-too-short';
    try {
      parseServerEnv({ ...validServerEnv, CRON_SECRET: secret.slice(0, 10) });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret.slice(0, 10));
    }
  });
});

describe('parsePublicEnv', () => {
  it('ignores server-only variables', () => {
    const env = parsePublicEnv(validServerEnv);
    expect(Object.keys(env).sort()).toEqual([
      'NEXT_PUBLIC_SITE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_URL',
    ]);
  });
});
