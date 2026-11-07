/**
 * Creates (or resets the password of) an admin account (PRD A-01). The only way to create admins.
 *   pnpm admin:create --email you@example.com --name "Admin"
 * The password is read from ADMIN_PASSWORD or prompted for without echo. Uses .env.local if present.
 */
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    let prompted = false;
    output._writeToOutput = (text: string) => {
      if (!prompted) {
        process.stdout.write(text);
        prompted = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Usage: pnpm admin:create --email you@example.com --name "Admin"');
    process.exit(1);
  }

  // Imported after env loading: these modules validate the environment at import time.
  const { hashPassword, isAcceptablePassword, ADMIN_PASSWORD_MIN_LENGTH } = await import('@/lib/auth/password');
  const { supabaseAdmin } = await import('@/lib/supabase/admin');

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden('Password: '));
  if (!isAcceptablePassword(password)) {
    console.error(`Password must be ${ADMIN_PASSWORD_MIN_LENGTH}–200 characters.`);
    process.exit(1);
  }
  if (!process.env.ADMIN_PASSWORD && (await promptHidden('Confirm password: ')) !== password) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from('admins')
    .upsert(
      { email, display_name: name, password_hash: await hashPassword(password), is_active: true },
      { onConflict: 'email' },
    )
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Admin ready: ${email} (${data.id})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
