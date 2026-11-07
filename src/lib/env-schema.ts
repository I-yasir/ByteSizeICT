import { z } from 'zod';

/**
 * Pure environment schemas (TRD §5). Kept free of side effects so they can be unit-tested and
 * shared by `env.ts` (server-only, parses at import) and `env-public.ts` (client-safe).
 * Error messages never include the offending values, so secrets cannot leak into logs.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const required = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema.optional());

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const base64ByteLength = (value: string) =>
  BASE64.test(value) ? Math.floor((value.replace(/=+$/, '').length * 3) / 4) : 0;

const siteUrl = z
  .url({ protocol: /^https?$/ })
  .refine((value) => !value.endsWith('/'), 'must not end with a trailing slash');

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: required(siteUrl),
  NEXT_PUBLIC_SUPABASE_URL: required(z.url({ protocol: /^https?$/ })),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required(z.string().min(20)),
});

export const serverEnvSchema = publicEnvSchema
  .extend({
    VERCEL_ENV: optional(z.enum(['production', 'preview', 'development'])),
    SUPABASE_SERVICE_ROLE_KEY: required(z.string().min(20)),
    AUTH_PEPPER: required(
      z
        .string()
        .refine((value) => base64ByteLength(value) >= 32, 'must be base64 of at least 32 random bytes'),
    ),
    SESSION_TOKEN_BYTES: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(32).max(64).default(32),
    ),
    RESEND_API_KEY: optional(z.string().startsWith('re_')),
    EMAIL_FROM: optional(z.string().min(3).max(200)),
    ADMIN_ALERT_EMAIL: optional(z.email()),
    GOOGLE_SA_EMAIL: optional(z.email()),
    GOOGLE_SA_PRIVATE_KEY: optional(
      z
        .string()
        .transform((value) => value.replace(/\\n/g, '\n'))
        .refine((value) => value.includes('BEGIN PRIVATE KEY'), 'must be a PEM private key'),
    ),
    GOOGLE_SHEET_ID: optional(z.string().min(10)),
    CRON_SECRET: required(z.string().min(32)),
    APP_TIMEZONE: z.preprocess(emptyToUndefined, z.literal('Asia/Dhaka').default('Asia/Dhaka')),
  })
  .superRefine((env, ctx) => {
    if (env.GOOGLE_SHEET_ID && (!env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_PRIVATE_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_SHEET_ID'],
        message: 'GOOGLE_SA_EMAIL and GOOGLE_SA_PRIVATE_KEY are required when GOOGLE_SHEET_ID is set',
      });
    }
    // Dev/preview fall back to logging emails to the console (P2.04); production must really send.
    if (env.VERCEL_ENV === 'production') {
      for (const key of ['RESEND_API_KEY', 'EMAIL_FROM'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
        }
      }
    }
  });

export type PublicEnv = z.output<typeof publicEnvSchema>;
export type ServerEnv = z.output<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export class EnvValidationError extends Error {
  override name = 'EnvValidationError';
}

function parseWith<T extends z.ZodType>(schema: T, source: EnvSource, label: string): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      `Invalid ${label} environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export const parsePublicEnv = (source: EnvSource): PublicEnv =>
  parseWith(publicEnvSchema, source, 'public');

export const parseServerEnv = (source: EnvSource): ServerEnv =>
  parseWith(serverEnvSchema, source, 'server');
