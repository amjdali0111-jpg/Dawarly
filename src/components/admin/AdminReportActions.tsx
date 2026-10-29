"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { adminCloseReport, adminRenewReport, holdReport, reviewReport } from "@/app/actions/admin";
import { useI18n } from "@/i18n/client";
import type { ReportStatus } from "@/lib/types";

export function AdminReportActions({ reportId, status }: { reportId: string; status: ReportStatus }) {
  const { t } = useI18n();
  const H = () => <input type="hidden" name="report_id" value={reportId} />;
  return (
    <div className="space-y-3">
      {status === "under_review" && (
        <ActionForm action={reviewReport} className="space-y-2">
          <H />
          <input name="note" maxLength={300} className="input" placeholder={t("admin.note")} aria-label={t("admin.note")} />
          <div className="flex gap-2">
            <SubmitButton name="decision" value="approve" className="btn-primary btn-sm">{t("admin.approve")}</SubmitButton>
            <SubmitButton name="decision" value="remove" className="btn-danger btn-sm">{t("admin.remove")}</SubmitButton>
          </div>
        </ActionForm>
      )}
      <div className="flex flex-wrap gap-2">
        {(status === "active" || status === "expired") && (
          <ActionForm action={holdReport}><H /><SubmitButton className="btn-amber btn-sm">{t("admin.hold")}</SubmitButton></ActionForm>
        )}
        {status === "expired" && (
          <ActionForm action={adminRenewReport}><H /><SubmitButton className="btn-ghost btn-sm">{t("reports.renew")}</SubmitButton></ActionForm>
        )}
        {["active", "expired", "under_review"].includes(status) && (
          <ActionForm action={adminCloseReport} confirmText={t("reports.closeConfirm")}><H /><SubmitButton className="btn-ghost btn-sm">{t("reports.closeReport")}</SubmitButton></ActionForm>
        )}
        {status !== "under_review" && status !== "removed" && status !== "recovered" && (
          <ActionForm action={reviewReport} confirmText={t("admin.remove") + "?"}>
            <H /><input type="hidden" name="decision" value="remove" />
            <SubmitButton className="btn-danger btn-sm">{t("admin.remove")}</SubmitButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
