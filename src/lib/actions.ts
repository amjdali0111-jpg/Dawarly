import "server-only";
import { after } from "next/server";
import { dispatchEmails } from "@/lib/email/dispatch";
import { getT } from "@/i18n/server";
import { errorMessage, type ActionResult } from "@/lib/errors";
import type { TKey, TVars } from "@/i18n/translate";

export async function fail(err: unknown): Promise<ActionResult<never>> {
  const { t } = await getT();
  if (process.env.NODE_ENV !== "production") console.warn("[action]", (err as Error)?.message ?? err);
  return { ok: false, error: errorMessage(t, err) };
}

export async function failKey(key: TKey, vars?: TVars): Promise<ActionResult<never>> {
  const { t } = await getT();
  return { ok: false, error: t(key, vars) };
}

export async function okKey<T>(key: TKey, data?: T, vars?: TVars): Promise<ActionResult<T>> {
  const { t } = await getT();
  return { ok: true, data, message: t(key, vars) };
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k).trim() || null;

/** Sends queued notification emails after the response (best effort). */
export function kickEmailOutbox() {
  after(() => dispatchEmails(25).then(() => undefined, (e) => console.warn("[email] dispatch failed", (e as Error).message)));
}
