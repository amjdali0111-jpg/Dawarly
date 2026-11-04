import en from "./en";
import ar from "./ar";
import type { Locale } from "./config";

export type Dictionary = typeof en;

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Leaves<T> = T extends string ? never : { [K in keyof T]: T[K] extends string ? K : Join<K, Leaves<T[K]>> }[keyof T];
export type TKey = Leaves<Dictionary>;
export type TVars = Record<string, string | number>;
export type TFn = (key: TKey, vars?: TVars) => string;

export const dictionaries: Record<Locale, Dictionary> = { en, ar };

export function lookup(dict: Dictionary, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

export function makeT(locale: Locale): TFn {
  const dict = dictionaries[locale];
  return (key, vars) => {
    let s = lookup(dict, key) ?? lookup(en, key) ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Translate a dynamic key (e.g. built from a DB enum) with a fallback. */
export function tDynamic(t: TFn, key: string, fallback?: string) {
  const out = t(key as TKey);
  return out === key ? (fallback ?? key) : out;
}
