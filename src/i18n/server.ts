import "server-only";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeT } from "./translate";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^en\b/i.test(accept)) return "en";
  return defaultLocale;
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
