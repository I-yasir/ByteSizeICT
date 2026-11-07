/**
 * Shared state for module mocks used by action/route tests. Each test file registers:
 *
 *   vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
 *   vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
 *   vi.mock('next/server', () => import('../helpers/next-server-mock'));
 *   vi.mock('next/headers', () => import('../helpers/next-headers-mock'));
 */
import type { AdminContext, StudentContext } from '@/lib/auth/guards';

export const authState: { admin: AdminContext | null; student: StudentContext | null } = { admin: null, student: null };
export const requestState = { ip: '10.9.9.9', userAgent: 'vitest' };
export const pendingAfter: Promise<unknown>[] = [];

/** Awaits every `after()` callback scheduled so far (e.g. outbox drains). */
export async function flushAfter(): Promise<void> {
  while (pendingAfter.length) await Promise.allSettled(pendingAfter.splice(0));
}

export function resetMocks(): void {
  authState.admin = null;
  authState.student = null;
}
