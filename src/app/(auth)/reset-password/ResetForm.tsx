"use client";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { updatePassword } from "@/app/actions/auth";
import { useI18n } from "@/i18n/client";

export function ResetForm() {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <ActionForm action={updatePassword} className="space-y-4" refreshOnSuccess={false} onSuccess={() => setTimeout(() => router.push("/reports"), 1200)}>
      <div>
        <label className="label" htmlFor="password">{t("auth.newPassword")}</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        <p className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm_password">{t("auth.confirmPassword")}</label>
        <input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" className="input" />
      </div>
      <SubmitButton className="btn-primary w-full" pendingText={t("common.saving")}>{t("auth.updatePassword")}</SubmitButton>
    </ActionForm>
  );
}
