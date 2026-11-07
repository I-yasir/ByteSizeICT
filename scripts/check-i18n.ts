/**
 * Fails when messages/bn.json and messages/en.json differ in keys or ICU placeholders,
 * or contain empty strings (TRD §11 i18n requirement).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Tree = { [key: string]: string | Tree };

const LOCALES = ['bn', 'en'] as const;

function flatten(tree: Tree, prefix = '', out = new Map<string, string>()) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

/** Top-level argument names, e.g. "{attemptsLeft, plural, ...}" -> ["attemptsLeft"]. */
function placeholders(message: string) {
  return [...message.matchAll(/\{\s*([A-Za-z_]\w*)/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name))
    .sort()
    .join(',');
}

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => {
    const raw = readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8');
    return [locale, flatten(JSON.parse(raw) as Tree)];
  }),
) as Record<(typeof LOCALES)[number], Map<string, string>>;

const problems: string[] = [];

for (const locale of LOCALES) {
  for (const other of LOCALES) {
    if (locale === other) continue;
    for (const key of catalogs[locale].keys()) {
      if (!catalogs[other].has(key)) problems.push(`missing in ${other}.json: ${key}`);
    }
  }
  for (const [key, value] of catalogs[locale]) {
    if (value.trim() === '') problems.push(`empty string in ${locale}.json: ${key}`);
  }
}

// Bangla must not use ICU `#`: next-intl formats it with Bengali digits (UI Spec §8 requires Latin).
for (const [key, value] of catalogs.bn) {
  if (value.includes('#')) problems.push(`"#" in bn.json (renders Bengali digits; use {n}): ${key}`);
}

for (const [key, bnValue] of catalogs.bn) {
  const enValue = catalogs.en.get(key);
  if (enValue !== undefined && placeholders(bnValue) !== placeholders(enValue)) {
    problems.push(`placeholder mismatch for ${key}: bn={${placeholders(bnValue)}} en={${placeholders(enValue)}}`);
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`i18n check passed: ${catalogs.bn.size} keys in sync across ${LOCALES.join(', ')}.`);
