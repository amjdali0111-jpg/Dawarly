"use client";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { decideMatch } from "@/app/actions/matches";
import { useI18n } from "@/i18n/client";
import type { MatchDecision } from "@/lib/types";

export function MatchActions({ matchId, decision, counterpartId, counterpartActive }: { matchId: string; decision: MatchDecision; counterpartId: string; counterpartActive: boolean }) {
  const { t } = useI18n();
  if (decision === "confirmed") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge bg-teal-400/15 text-teal-200"><Check className="h-3.5 w-3.5" aria-hidden />{t("matches.confirmed")}</span>
        {counterpartActive && <Link className="btn-primary btn-sm" href={`/reports/${counterpartId}?match=${matchId}`}>{t("matches.requestNow")}</Link>}
      </div>
    );
  }
  if (decision === "dismissed") {
    return (
      <ActionForm action={decideMatch} className="flex items-center gap-2">
        <span className="badge-muted">{t("matches.dismissed")}</span>
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="decision" value="pending" />
        <SubmitButton className="btn-ghost btn-sm">{t("common.reset")}</SubmitButton>
      </ActionForm>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <ActionForm action={decideMatch}>
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="decision" value="confirmed" />
        <SubmitButton className="btn-primary btn-sm"><Check className="h-4 w-4" aria-hidden />{t("matches.confirm")}</SubmitButton>
      </ActionForm>
      <ActionForm action={decideMatch}>
        <input type="hidden" name="match_id" value={matchId} />
        <input type="hidden" name="decision" value="dismissed" />
        <SubmitButton className="btn-ghost btn-sm"><X className="h-4 w-4" aria-hidden />{t("matches.dismiss")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
