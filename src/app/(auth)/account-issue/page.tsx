import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";
import { getT } from "@/i18n/server";
import { getSessionState } from "@/lib/auth";
import { signOut } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

/**
 * Shown to a signed-in, verified user whose profile or university cannot be
 * used. Without this page they would be sent to /login, which the middleware
 * bounces back to /reports (an endless redirect that rendered a blank page).
 */
export default async function AccountIssuePage() {
  const state = await getSessionState();
  if (state.status === "anonymous") redirect("/login");
  if (state.status === "ok") redirect("/reports");

  const { t } = await getT();
  return (
    <div className="card p-6 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-300" aria-hidden />
      <h1 className="text-xl font-bold text-white">{t("auth.accountIssue.title")}</h1>
      <p className="mt-3 text-slate-300">{t(`auth.accountIssue.${state.reason}`)}</p>
      <p className="mt-2 text-sm text-slate-400">{t("auth.accountIssue.hint")}</p>
      <form action={signOut} className="mt-6">
        <button type="submit" className="btn-primary">
          <LogOut className="h-4 w-4" aria-hidden />
          {t("common.signOut")}
        </button>
      </form>
    </div>
  );
}
