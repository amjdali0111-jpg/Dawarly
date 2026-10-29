"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { requestRecovery } from "@/app/actions/reports";
import { useI18n } from "@/i18n/client";
import type { ReportType } from "@/lib/types";

export function RequestForm({ reportId, reportType, matchId }: { reportId: string; reportType: ReportType; matchId?: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={requestRecovery} className="space-y-3" resetOnSuccess>
      <h2 className="font-semibold text-white">{reportType === "found" ? t("reports.requestTitleFound") : t("reports.requestTitleLost")}</h2>
      <input type="hidden" name="report_id" value={reportId} />
      {matchId && <input type="hidden" name="match_id" value={matchId} />}
      <div>
        <label className="label" htmlFor="req-message">{t("reports.requestMessage")}</label>
        <textarea id="req-message" name="message" rows={2} maxLength={1000} className="input" placeholder={t("reports.requestMessagePh")} />
      </div>
      {reportType === "found" && (
        <div>
          <label className="label" htmlFor="req-proof">{t("reports.verificationAnswer")}</label>
          <textarea id="req-proof" name="verification_answer" rows={2} maxLength={1000} className="input" placeholder={t("reports.verificationAnswerPh")} />
        </div>
      )}
      <SubmitButton className={reportType === "found" ? "btn-primary w-full" : "btn-amber w-full"} pendingText={t("common.loading")}>
        {reportType === "found" ? t("reports.claimLost") : t("reports.claimFound")}
      </SubmitButton>
    </ActionForm>
  );
}
