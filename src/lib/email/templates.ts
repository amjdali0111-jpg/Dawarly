import { makeT, type TKey } from "@/i18n/translate";
import type { Locale } from "@/i18n/config";

/**
 * Email bodies are deliberately generic: they say *that* something happened
 * and link into the app. No item details, messages or names are included.
 */
export function renderNotificationEmail(kind: string, data: Record<string, unknown>, locale: Locale, siteUrl: string) {
  const t = makeT(locale);
  const statusKey = `requestStatus.${String(data.status ?? "")}` as TKey;
  const decisionKey = `notifications.decisions.${String(data.decision ?? "")}` as TKey;
  const vars = { status: t(statusKey), decision: t(decisionKey) };
  const key = `notifications.kinds.${kind}` as TKey;
  const title = t(key, vars) === key ? t("notifications.title") : t(key, vars);
  const link = `${siteUrl}/notifications`;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html><html dir="${dir}" lang="${locale}"><body style="font-family:system-ui,sans-serif;background:#0a1c2a;color:#e6f4f6;padding:24px">
<div style="max-width:520px;margin:auto;background:#0f2738;border-radius:16px;padding:24px">
<h1 style="color:#3fe3d4;font-size:20px;margin:0 0 12px">${escapeHtml(t("common.appName"))}</h1>
<p style="font-size:16px;line-height:1.6">${escapeHtml(title)}</p>
<p><a href="${link}" style="display:inline-block;background:#3fe3d4;color:#06141f;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(t("notifications.title"))}</a></p>
</div></body></html>`;
  return { subject: `${t("common.appName")} — ${title}`, html, text: `${title}\n${link}` };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
