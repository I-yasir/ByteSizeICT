/**
 * Open-redirect protection for `?next=` (docs/02_AppFlow.md §1.4): only same-site relative paths.
 * Isomorphic so the login form and proxy can share it.
 */
export function safeNextPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  // Reject control characters and backslashes, which some browsers normalise to "/".
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  if (value.startsWith('/api/')) return fallback;
  return value;
}
