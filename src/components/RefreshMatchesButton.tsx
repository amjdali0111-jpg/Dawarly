"use client";
import { RefreshCw } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { refreshMatches } from "@/app/actions/matches";
import { useI18n } from "@/i18n/client";

export function RefreshMatchesButton() {
  const { t } = useI18n();
  return (
    <ActionForm action={refreshMatches}>
      <SubmitButton className="btn-ghost btn-sm" pendingText={t("common.loading")}><RefreshCw className="h-4 w-4" aria-hidden />{t("matches.refresh")}</SubmitButton>
    </ActionForm>
  );
}
