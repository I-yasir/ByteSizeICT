import { execSync } from 'node:child_process';

/**
 * Specs build their own fixtures, so a reset is opt-in (E2E_RESET=1, set in CI): resetting on every
 * local run would wipe whatever a developer is doing in `pnpm dev` against the same database.
 */
export default function globalSetup(): void {
  if (process.env.E2E_RESET !== '1') return;
  execSync('pnpm db:reset', { stdio: 'ignore', timeout: 300_000 });
}
