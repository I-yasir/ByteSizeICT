import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/** TRD §2.4 — libraries that must never be imported anywhere. */
const forbiddenPackages = [
  { name: 'axios', message: 'Use fetch (TRD §2.4).' },
  { name: 'moment', message: 'Use date-fns + @date-fns/tz (TRD §2.4).' },
  { name: 'xlsx', message: 'Use exceljs (TRD §2.4).' },
  { name: '@supabase/ssr', message: 'Supabase Auth is not used (TRD ADR-02).' },
  { name: 'next-auth', message: 'Custom session auth only (TRD ADR-02).' },
  { name: '@prisma/client', message: 'No ORM (TRD ADR-07).' },
  { name: 'drizzle-orm', message: 'No ORM (TRD ADR-07).' },
  { name: 'zustand', message: 'No client state libraries (TRD §2.4).' },
  { name: 'jotai', message: 'No client state libraries (TRD §2.4).' },
  { name: '@reduxjs/toolkit', message: 'No client state libraries (TRD §2.4).' },
  { name: '@tanstack/react-query', message: 'Not needed (TRD §2.4).' },
  { name: 'styled-components', message: 'No CSS-in-JS (TRD §2.4).' },
  { name: '@emotion/react', message: 'No CSS-in-JS (TRD §2.4).' },
];

/** TRD §3 import rules — components may not reach server-only data/infra modules. */
const componentRestrictedPatterns = [
  // Type-only imports are erased at build time and cannot pull server code into the client.
  {
    group: ['@/lib/supabase', '@/lib/supabase/*'],
    allowTypeImports: true,
    message: 'Components must not access Supabase. Use a Server Action or pass data from a Server Component.',
  },
  {
    group: ['@/features/*/service', '@/features/*/queries'],
    allowTypeImports: true,
    message: 'Components may only import Server Actions (actions.ts) or schemas.ts from features.',
  },
  {
    group: ['@/lib/env', '@/lib/auth/session', '@/lib/email/*', '@/lib/sheets/*', '@/lib/outbox/*'],
    allowTypeImports: true,
    message: 'Server-only module. Not importable from components.',
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'supabase/**',
    'next-env.d.ts',
    'src/types/database.ts',
  ]),
  {
    rules: {
      'no-restricted-imports': ['error', { paths: forbiddenPackages }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: forbiddenPackages, patterns: componentRestrictedPatterns },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'off',
    },
  },
]);
