"use client";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { ReportStatus, ReportType, RequestStatus } from "@/lib/types";

export function TypeBadge({ type }: { type: ReportType }) {
  const { t } = useI18n();
  return <span className={type === "lost" ? "badge-lost" : "badge-found"}>{t(`reportType.${type}`)}</span>;
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const { t } = useI18n();
  const cls = status === "active" ? "badge bg-teal-400/15 text-teal-200" : status === "recovered" ? "badge bg-emerald-500/20 text-emerald-200"
    : status === "under_review" ? "badge-amber" : "badge-muted";
  return <span className={cls}>{t(`reportStatus.${status}`)}</span>;
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { t } = useI18n();
  const cls = status === "completed" ? "badge bg-emerald-500/20 text-emerald-200" : status === "accepted" ? "badge-found"
    : status === "security_review" || status === "disputed" ? "badge-amber" : status === "pending" ? "badge bg-teal-400/15 text-teal-200" : "badge-muted";
  return <span className={cls}>{t(`requestStatus.${status}`)}</span>;
}

export function SensitiveBadge() {
  const { t } = useI18n();
  return (
    <span className="badge bg-amber-400/15 text-amber-200">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
      {t("reports.sensitiveBadge")}
    </span>
  );
}
