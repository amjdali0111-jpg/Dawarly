"use client";
import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { makeT, type TFn } from "./translate";

const I18nContext = createContext<{ locale: Locale; t: TFn } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
