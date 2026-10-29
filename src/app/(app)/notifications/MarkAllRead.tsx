"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { markAllRead } from "@/app/actions/notifications";
import { useI18n } from "@/i18n/client";

export function MarkAllRead() {
  const { t } = useI18n();
  return (
    <ActionForm action={markAllRead} hideMessageOnSuccess>
      <SubmitButton className="btn-ghost btn-sm">{t("notifications.markAllRead")}</SubmitButton>
    </ActionForm>
  );
}
