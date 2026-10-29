import Link from "next/link";
import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; reset?: string }> }) {
  const { t } = await getT();
  const sp = await searchParams;
  return (
    <div className="card p-6">
      <h1 className="text-center text-2xl font-bold text-white">{t("auth.loginTitle")}</h1>
      <p className="mb-6 mt-1 text-center muted">{t("auth.loginSubtitle")}</p>
      {!isSupabaseConfigured() && <p className="alert-warn mb-4">{t("common.notConfigured")}</p>}
      {sp.error === "link" && <p className="alert-error mb-4">{t("auth.linkInvalid")}</p>}
      {sp.reset === "1" && <p className="alert-info mb-4">{t("auth.passwordUpdated")}</p>}
      <LoginForm next={sp.next} />
      <p className="mt-6 text-center text-sm text-slate-300">
        {t("auth.noAccount")} <Link href="/register" className="link">{t("auth.createAccount")}</Link>
      </p>
    </div>
  );
}
