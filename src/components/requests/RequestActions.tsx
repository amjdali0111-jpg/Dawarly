"use client";
import { useState } from "react";
import { Check, Star, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { confirmHandover, openDispute, reportHandoverFailed, respondRequest, securityReview, submitRating, withdrawRequest } from "@/app/actions/requests";
import { useI18n } from "@/i18n/client";

export interface RequestActionFlags {
  requestId: string;
  canRespond: boolean;
  canRejectOnly: boolean;
  canSecurityReview: boolean;
  canWithdraw: boolean;
  canConfirm: boolean;
  alreadyConfirmed: boolean;
  canFailOrDispute: boolean;
  canDispute: boolean;
  canRate: boolean;
}

function Hidden({ id }: { id: string }) {
  return <input type="hidden" name="request_id" value={id} />;
}

export function RequestActions(f: RequestActionFlags) {
  const { t } = useI18n();
  const [method, setMethod] = useState<"direct" | "security">("direct");
  const [stars, setStars] = useState(5);

  return (
    <div className="space-y-3">
      {f.canRespond && (
        <ActionForm action={respondRequest} className="space-y-2 rounded-xl bg-night-900 p-3">
          <Hidden id={f.requestId} />
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-xs text-slate-400">{t("requests.method")}</legend>
            {(["direct", "security"] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" name="method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-teal-400" />
                {m === "direct" ? t("requests.methodDirect") : t("requests.methodSecurity")}
              </label>
            ))}
          </fieldset>
          <input name="details" maxLength={500} className="input" placeholder={t("requests.handoverDetailsPh")} aria-label={t("requests.handoverDetails")} />
          <div className="flex gap-2">
            <SubmitButton name="accept" value="true" className="btn-primary btn-sm"><Check className="h-4 w-4" aria-hidden />{t("requests.accept")}</SubmitButton>
            <SubmitButton name="accept" value="false" className="btn-ghost btn-sm"><X className="h-4 w-4" aria-hidden />{t("requests.reject")}</SubmitButton>
          </div>
        </ActionForm>
      )}

      {f.canRejectOnly && (
        <ActionForm action={respondRequest}>
          <Hidden id={f.requestId} />
          <input type="hidden" name="accept" value="false" />
          <SubmitButton className="btn-ghost btn-sm"><X className="h-4 w-4" aria-hidden />{t("requests.reject")}</SubmitButton>
        </ActionForm>
      )}

      {f.canSecurityReview && (
        <ActionForm action={securityReview} className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
          <Hidden id={f.requestId} />
          <input name="details" maxLength={500} className="input" placeholder={t("requests.handoverDetailsPh")} aria-label={t("requests.handoverDetails")} />
          <div className="flex gap-2">
            <SubmitButton name="approve" value="true" className="btn-amber btn-sm">{t("requests.securityApprove")}</SubmitButton>
            <SubmitButton name="approve" value="false" className="btn-ghost btn-sm">{t("requests.securityReject")}</SubmitButton>
          </div>
        </ActionForm>
      )}

      {f.canConfirm && (
        f.alreadyConfirmed ? (
          <p className="text-sm text-teal-200">{t("requests.youConfirmed")} — {t("requests.waitingOther")}</p>
        ) : (
          <ActionForm action={confirmHandover}>
            <Hidden id={f.requestId} />
            <SubmitButton className="btn-primary btn-sm w-full sm:w-auto"><Check className="h-4 w-4" aria-hidden />{t("requests.confirmHandover")}</SubmitButton>
            <p className="mt-1 text-xs text-slate-400">{t("requests.confirmHelp")}</p>
          </ActionForm>
        )
      )}

      <div className="flex flex-wrap gap-3">
        {f.canWithdraw && (
          <ActionForm action={withdrawRequest}>
            <Hidden id={f.requestId} />
            <SubmitButton className="btn-ghost btn-sm">{t("requests.withdraw")}</SubmitButton>
          </ActionForm>
        )}
        {f.canFailOrDispute && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-400 hover:text-red-200">{t("requests.reportFailed")}</summary>
            <ActionForm action={reportHandoverFailed} className="mt-2 flex gap-2">
              <Hidden id={f.requestId} />
              <input name="reason" required maxLength={500} className="input" placeholder={t("requests.failedReasonPh")} />
              <SubmitButton className="btn-danger btn-sm">{t("common.submit")}</SubmitButton>
            </ActionForm>
          </details>
        )}
        {f.canDispute && (
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-400 hover:text-amber-200">{t("requests.openDispute")}</summary>
            <ActionForm action={openDispute} className="mt-2 flex gap-2">
              <Hidden id={f.requestId} />
              <input name="reason" required minLength={5} maxLength={1000} className="input" placeholder={t("requests.disputeReasonPh")} />
              <SubmitButton className="btn-amber btn-sm">{t("common.submit")}</SubmitButton>
            </ActionForm>
          </details>
        )}
      </div>

      {f.canRate && (
        <ActionForm action={submitRating} className="space-y-2 rounded-xl bg-night-900 p-3">
          <Hidden id={f.requestId} />
          <p className="text-sm font-semibold">{t("requests.rateTitle")}</p>
          <input type="hidden" name="stars" value={stars} />
          <div className="flex gap-1" role="radiogroup" aria-label={t("requests.rate")}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n}`} onClick={() => setStars(n)}>
                <Star className={`h-6 w-6 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} aria-hidden />
              </button>
            ))}
          </div>
          <textarea name="comment" rows={2} maxLength={1000} className="input" placeholder={t("requests.commentPh")} />
          <SubmitButton className="btn-amber btn-sm">{t("requests.rate")}</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
