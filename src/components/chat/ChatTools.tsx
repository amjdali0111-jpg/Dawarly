"use client";
import { ShieldCheck, UserX } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { blockUser, joinAsSecurity, unblockUser } from "@/app/actions/messages";
import { AbuseReportButton } from "@/components/AbuseReportButton";
import { useI18n } from "@/i18n/client";

export function ChatTools({ conversationId, otherUserId, iBlocked, canJoinAsSecurity }: { conversationId: string; otherUserId: string | null; iBlocked: boolean; canJoinAsSecurity: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-start gap-3">
      {canJoinAsSecurity && (
        <ActionForm action={joinAsSecurity}>
          <input type="hidden" name="conversation_id" value={conversationId} />
          <SubmitButton className="btn-amber btn-sm"><ShieldCheck className="h-4 w-4" aria-hidden />{t("messages.joinAsSecurity")}</SubmitButton>
        </ActionForm>
      )}
      {otherUserId && (
        <ActionForm action={iBlocked ? unblockUser : blockUser} confirmText={iBlocked ? undefined : t("messages.blockUser") + "?"}>
          <input type="hidden" name="user_id" value={otherUserId} />
          <SubmitButton className="btn-ghost btn-sm"><UserX className="h-4 w-4" aria-hidden />{iBlocked ? t("messages.unblockUser") : t("messages.blockUser")}</SubmitButton>
        </ActionForm>
      )}
      <AbuseReportButton targetType="conversation" targetId={conversationId} label={t("messages.reportConversation")} />
    </div>
  );
}
