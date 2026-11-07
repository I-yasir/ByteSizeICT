/**
 * TRD §10.5: the client bundle (.next/static) must not contain server secrets.
 * Run after `pnpm build`. Skips with a warning when there is no build output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATIC_DIR = '.next/static';
const SECRET_VARS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTH_PEPPER',
  'RESEND_API_KEY',
  'GOOGLE_SA_PRIVATE_KEY',
  'CRON_SECRET',
];
const MARKERS = ['BEGIN PRIVATE KEY', ...SECRET_VARS];

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

if (!existsSync(STATIC_DIR)) {
  console.warn(`check:secrets skipped: ${STATIC_DIR} not found (run pnpm build first).`);
  process.exit(0);
}

// Short values would cause false positives; real secrets are long.
const needles = [
  ...MARKERS,
  ...SECRET_VARS.map((name) => process.env[name]).filter(
    (value): value is string => typeof value === 'string' && value.length >= 16,
  ),
];

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

const hits: string[] = [];
for (const file of files(STATIC_DIR)) {
  const content = readFileSync(file, 'utf8');
  for (const needle of needles) {
    // Report the variable name or marker, never the secret value itself.
    if (content.includes(needle)) {
      const label = MARKERS.includes(needle) ? needle : 'a server secret value';
      hits.push(`${file} contains ${label}`);
    }
  }
}

if (hits.length > 0) {
  console.error(`Secret leak in client bundle:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('Secret check passed.');
