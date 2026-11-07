import { parsePublicEnv } from './env-schema';

/**
 * Client-safe environment. Next.js only inlines `NEXT_PUBLIC_*` variables for literal
 * `process.env.X` accesses, so each one is referenced explicitly instead of passing `process.env`.
 */
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
