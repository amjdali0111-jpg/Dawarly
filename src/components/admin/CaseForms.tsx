"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { resolveAbuse, resolveDispute } from "@/app/actions/admin";
import { useI18n } from "@/i18n/client";

export function AbuseResolveForm({ abuseId, canRemove }: { abuseId: string; canRemove: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={resolveAbuse} className="space-y-2">
      <input type="hidden" name="abuse_id" value={abuseId} />
      <input name="note" maxLength={300} className="input" placeholder={t("admin.note")} aria-label={t("admin.note")} />
      {canRemove && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="remove_content" className="accent-red-400" />{t("admin.removeContent")}</label>}
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="action" value="dismiss" className="btn-ghost btn-sm">{t("admin.dismiss")}</SubmitButton>
        <SubmitButton name="action" value="action" className="btn-amber btn-sm">{t("admin.takeAction")}</SubmitButton>
        <SubmitButton name="action" value="confirm_false_report" className="btn-danger btn-sm">{t("admin.confirmFalse")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DisputeResolveForm({ disputeId }: { disputeId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={resolveDispute} className="space-y-2">
      <input type="hidden" name="dispute_id" value={disputeId} />
      <input name="resolution" required maxLength={1000} className="input" placeholder={t("admin.resolution")} aria-label={t("admin.resolution")} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="outcome" value="resume" className="btn-primary btn-sm">{t("admin.resume")}</SubmitButton>
        <SubmitButton name="outcome" value="cancel" className="btn-danger btn-sm">{t("admin.cancelHandover")}</SubmitButton>
        <SubmitButton name="outcome" value="dismiss" className="btn-ghost btn-sm">{t("admin.dismiss")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
