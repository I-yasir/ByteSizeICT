import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Integration tests run against the local Supabase stack (`pnpm db:start`) with .env.local values.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const testEnv = {
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-not-configured',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'service-role-key-not-configured',
  AUTH_PEPPER: process.env.AUTH_PEPPER ?? 'g8wbri93vbyOmLUUcr7F5aR51bZbuzTFwPgzHfDxF6E=',
  CRON_SECRET: process.env.CRON_SECRET ?? 'test-cron-secret-0123456789abcdef0123456789abcdef',
  VERCEL_ENV: 'development',
  RESEND_API_KEY: '',
  GOOGLE_SHEET_ID: '',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside the React Server environment; tests run server code directly.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: testEnv,
    globals: true,
    restoreMocks: true,
    // Integration files share one database; run files sequentially to keep fixtures isolated.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
