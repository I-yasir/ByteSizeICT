'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { MessageKeys, NamespaceKeys, NestedKeyOf, NestedValueOf } from 'next-intl';
import type messages from '../../../messages/bn.json';
import type { Locale } from './config';

/**
 * Client-side translations (P4.20). next-intl's client provider always bundles the ICU message
 * parser (~10 KB gzipped on every page); our messages only use `{name}` placeholders plus one
 * `{n, plural, …}` (enforced by `check:i18n`), so this small formatter replaces it on the client.
 * Server components keep using `next-intl/server`. API mirrors next-intl: `useTranslations(ns)`,
 * `t(key, values)`, `t.has(key)`, `useLocale()`.
 */
type Messages = typeof messages;
type Values = Record<string, string | number>;

// Key types come from next-intl (type-only import: erased from the bundle).
type AllKeys = NestedKeyOf<Messages>;
type Namespaces = NamespaceKeys<Messages, AllKeys>;
type KeysOf<T> = MessageKeys<T, NestedKeyOf<T>>;

export type Translator<Key extends string> = ((key: Key, values?: Values) => string) & { has: (key: string) => boolean };

type Ctx = { locale: Locale; messages: Messages };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, messages, children }: Ctx & { children: ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nProvider is missing');
  return ctx;
}

export function useLocale(): Locale {
  return useI18n().locale;
}

function lookup(tree: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), tree);
}

const PLURAL = /\{(\w+),\s*plural,((?:[^{}]|\{[^{}]*\})*)\}/g;
const OPTION = /(=\d+|\w+)\s*\{([^{}]*)\}/g;
const PLACEHOLDER = /\{(\w+)\}/g;

/** `{name}` substitution plus ICU `plural` with `#`. Numbers stay Latin (UI Spec §8). */
export function formatMessage(message: string, values: Values, locale: Locale): string {
  const withPlurals = message.replace(PLURAL, (whole, name: string, body: string) => {
    const n = Number(values[name]);
    if (Number.isNaN(n)) return whole;
    const options = new Map<string, string>();
    for (const [, selector, text] of body.matchAll(OPTION)) options.set(selector as string, text as string);
    const chosen = options.get(`=${n}`) ?? options.get(new Intl.PluralRules(locale).select(n)) ?? options.get('other') ?? '';
    return chosen.replace(/#/g, String(n));
  });
  return withPlurals.replace(PLACEHOLDER, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

export function useTranslations(): Translator<KeysOf<Messages>>;
export function useTranslations<N extends Namespaces>(namespace: N): Translator<KeysOf<NestedValueOf<Messages, N>>>;
export function useTranslations(namespace?: string): Translator<string> {
  const { locale, messages: all } = useI18n();
  return useMemo(() => {
    const scope = namespace ? lookup(all, namespace) : all;
    const full = (key: string) => (namespace ? `${namespace}.${key}` : key);
    const t = (key: string, values: Values = {}) => {
      const message = lookup(scope, key);
      // Like next-intl: a missing key renders its path rather than crashing the page.
      return typeof message === 'string' ? formatMessage(message, values, locale) : full(key);
    };
    return Object.assign(t, { has: (key: string) => typeof lookup(scope, key) === 'string' });
  }, [all, locale, namespace]);
}
