"use client";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { login } from "@/app/actions/auth";
import { useI18n } from "@/i18n/client";

export function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={login} className="space-y-4" refreshOnSuccess={false}>
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">{t("auth.email")}</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-500" aria-hidden />
          <input id="email" name="email" type="email" autoComplete="email" required className="input ps-9" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">{t("auth.password")}</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-500" aria-hidden />
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input ps-9" />
        </div>
        <Link href="/forgot-password" className="link mt-2 inline-block text-xs">{t("auth.forgotPassword")}</Link>
      </div>
      <SubmitButton className="btn-primary w-full" pendingText={t("common.loading")}>{t("auth.loginButton")}</SubmitButton>
    </ActionForm>
  );
}
