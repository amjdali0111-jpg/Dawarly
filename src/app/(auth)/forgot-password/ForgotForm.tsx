"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { forgotPassword } from "@/app/actions/auth";
import { useI18n } from "@/i18n/client";

export function ForgotForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={forgotPassword} className="space-y-4" refreshOnSuccess={false}>
      <div>
        <label className="label" htmlFor="email">{t("auth.email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText={t("common.loading")}>{t("auth.sendResetLink")}</SubmitButton>
    </ActionForm>
  );
}
