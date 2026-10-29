"use client";
import Link from "next/link";
import { Pencil, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { closeReport, renewReport } from "@/app/actions/reports";
import { useI18n } from "@/i18n/client";
import type { ReportStatus } from "@/lib/types";

export function OwnerActions({ reportId, status, canRenew }: { reportId: string; status: ReportStatus; canRenew: boolean }) {
  const { t } = useI18n();
  const editable = ["active", "under_review", "expired"].includes(status);
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-teal-200">{t("reports.ownReport")}</p>
      <div className="flex flex-wrap gap-2">
        {editable && <Link href={`/reports/${reportId}/edit`} className="btn-ghost btn-sm"><Pencil className="h-4 w-4" aria-hidden />{t("common.edit")}</Link>}
        <Link href={`/matches?report=${reportId}`} className="btn-ghost btn-sm"><Sparkles className="h-4 w-4" aria-hidden />{t("reports.viewMatches")}</Link>
        {canRenew && (
          <ActionForm action={renewReport}>
            <input type="hidden" name="report_id" value={reportId} />
            <SubmitButton className="btn-amber btn-sm"><RefreshCw className="h-4 w-4" aria-hidden />{t("reports.renew")}</SubmitButton>
          </ActionForm>
        )}
        {editable && (
          <ActionForm action={closeReport} confirmText={t("reports.closeConfirm")}>
            <input type="hidden" name="report_id" value={reportId} />
            <SubmitButton className="btn-ghost btn-sm text-red-200"><XCircle className="h-4 w-4" aria-hidden />{t("reports.closeReport")}</SubmitButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
