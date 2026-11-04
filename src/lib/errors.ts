import type { TFn, TKey } from "@/i18n/translate";

const CODE_RE = /\b((?:auth|validation|state|signup|integrity):[a-z_]+)\b/;

/** Extracts a stable error code ("state:invalid") from a Postgres/PostgREST error. */
export function errorCode(err: unknown): string | null {
  const msg = typeof err === "string" ? err : (err as { message?: string } | null)?.message ?? "";
  const m = CODE_RE.exec(msg);
  if (m) return m[1];
  const code = (err as { code?: string } | null)?.code;
  if (code === "42501") return "auth:forbidden";
  return null;
}

export function errorMessage(t: TFn, err: unknown): string {
  const code = errorCode(err);
  if (code) {
    const key = `errors.${code}` as TKey;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return t("common.genericError");
}

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
