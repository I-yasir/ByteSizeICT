/** Isomorphic auth constants (safe for proxy.ts and client code). */
export const STUDENT_COOKIE = 'bsi_session';
export const ADMIN_COOKIE = 'bsi_admin';

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

export const STUDENT_REMEMBER_TTL_MS = 30 * DAY_MS;
export const SESSION_TTL_MS = 12 * HOUR_MS;
export const ADMIN_SLIDE_THRESHOLD_MS = 6 * HOUR_MS;
export const SESSION_TOUCH_INTERVAL_MS = 5 * MINUTE_MS;

export const MAX_PIN_FAILURES = 5;

export const REVOKE_REASONS = [
  'logout',
  'new_login',
  'pin_changed',
  'admin_force_logout',
  'admin_cancel',
  'admin_suspend',
  'admin_pin_reset',
] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
