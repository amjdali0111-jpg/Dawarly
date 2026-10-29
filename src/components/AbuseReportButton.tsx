"use client";
import { Flag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { submitAbuseReport } from "@/app/actions/reports";
import { useI18n } from "@/i18n/client";

const REASONS = ["false_report", "fraud", "harassment", "spam", "inappropriate", "other"] as const;

export function AbuseReportButton({ targetType, targetId, label }: { targetType: "report" | "user" | "message" | "conversation" | "rating"; targetId: string; label?: string }) {
  const { t } = useI18n();
  return (
    <details className="text-sm">
      <summary className="inline-flex cursor-pointer items-center gap-1 text-slate-400 hover:text-red-300">
        <Flag className="h-3.5 w-3.5" aria-hidden />
        {label ?? t("reports.reportAbuse")}
      </summary>
      <ActionForm action={submitAbuseReport} className="mt-2 space-y-2 rounded-xl border border-white/10 bg-night-900 p-3" resetOnSuccess refreshOnSuccess={false}>
        <input type="hidden" name="target_type" value={targetType} />
        <input type="hidden" name="target_id" value={targetId} />
        <label className="block text-xs text-slate-400">{t("abuse.reason")}
          <select name="reason" className="input mt-1" required defaultValue="false_report">
            {REASONS.map((r) => <option key={r} value={r}>{t(`abuse.reasons.${r}`)}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400">{t("abuse.details")}
          <textarea name="details" rows={2} maxLength={1000} className="input mt-1" />
        </label>
        <SubmitButton className="btn-danger btn-sm">{t("abuse.submit")}</SubmitButton>
      </ActionForm>
    </details>
  );
}
