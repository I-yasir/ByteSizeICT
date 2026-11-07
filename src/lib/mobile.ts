/** Bangladesh mobile helpers (docs/02_AppFlow.md §4.3, docs/03_UI_Spec.md §8). Isomorphic. */
export const MOBILE_PATTERN = /^01[3-9]\d{8}$/;

/** Strips spaces/dashes/parentheses and converts `+880…`/`880…` to `0…`. Does not validate. */
export function normalizeMobile(input: string): string {
  const digits = input.trim().replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (digits.startsWith('880')) return `0${digits.slice(3)}`;
  return digits;
}

export function isValidMobile(normalized: string): boolean {
  return MOBILE_PATTERN.test(normalized);
}

/** `01712345678` → `017XX-XXX-678` */
export function maskMobile(mobile: string): string {
  if (mobile.length !== 11) return mobile;
  return `${mobile.slice(0, 3)}XX-XXX-${mobile.slice(-3)}`;
}
