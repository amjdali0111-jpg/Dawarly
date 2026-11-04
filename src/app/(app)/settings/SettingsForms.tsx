"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { deleteAccount, updateSettings } from "@/app/actions/profile";
import { updatePassword } from "@/app/actions/auth";
import { unblockUser } from "@/app/actions/messages";
import { useI18n } from "@/i18n/client";

export function EmailPrefsForm({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={updateSettings} className="space-y-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_notifications" defaultChecked={enabled} className="h-4 w-4 accent-teal-400" />
        {t("settings.emailNotifications")}
      </label>
      <p className="text-xs text-slate-400">{t("settings.emailNotificationsHelp")}</p>
      <SubmitButton className="btn-ghost btn-sm">{t("common.save")}</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={updatePassword} className="space-y-2" resetOnSuccess>
      <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" placeholder={t("auth.newPassword")} aria-label={t("auth.newPassword")} />
      <input name="confirm_password" type="password" required autoComplete="new-password" className="input" placeholder={t("auth.confirmPassword")} aria-label={t("auth.confirmPassword")} />
      <SubmitButton className="btn-ghost btn-sm">{t("settings.changePassword")}</SubmitButton>
    </ActionForm>
  );
}

export function UnblockButton({ userId }: { userId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={unblockUser}>
      <input type="hidden" name="user_id" value={userId} />
      <SubmitButton className="btn-ghost btn-sm">{t("messages.unblockUser")}</SubmitButton>
    </ActionForm>
  );
}

export function DeleteAccountForm({ blockers }: { blockers: string[] }) {
  const { t } = useI18n();
  if (blockers.length) {
    return (
      <div className="alert-warn space-y-1">
        <p className="font-semibold">{t("settings.deleteBlocked")}</p>
        <ul className="list-disc ps-5">
          {blockers.map((b) => <li key={b}>{t(`settings.blockers.${b as "open_reports"}`)}</li>)}
        </ul>
      </div>
    );
  }
  return (
    <ActionForm action={deleteAccount} className="space-y-2" confirmText={t("settings.deleteButton") + "?"}>
      <label className="label" htmlFor="confirm-delete">{t("settings.deleteConfirmLabel")}</label>
      <input id="confirm-delete" name="confirm" required pattern="DELETE" className="input" dir="ltr" autoComplete="off" />
      <SubmitButton className="btn-danger btn-sm">{t("settings.deleteButton")}</SubmitButton>
    </ActionForm>
  );
}
