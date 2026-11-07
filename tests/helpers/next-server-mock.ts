import { pendingAfter } from './mocks';

/** Replacement for 'next/server' in action tests: `after()` runs immediately and can be awaited. */
export function after(task: (() => unknown) | Promise<unknown>): void {
  pendingAfter.push(Promise.resolve().then(() => (typeof task === 'function' ? task() : task)));
}
