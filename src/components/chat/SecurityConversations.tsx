"use client";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { joinAsSecurity } from "@/app/actions/messages";
import { useI18n } from "@/i18n/client";

export function SecurityConversations({ items }: { items: Array<{ conversation_id: string; last_message_at: string; joined: boolean }> }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-amber-200">{t("messages.title")}</p>
      {items.map((c, i) => (
        <div key={c.conversation_id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-slate-300">#{i + 1}</span>
          {c.joined ? (
            <Link href={`/messages/${c.conversation_id}`} className="btn-ghost btn-sm">{t("requests.chat")}</Link>
          ) : (
            <ActionForm action={joinAsSecurity}>
              <input type="hidden" name="conversation_id" value={c.conversation_id} />
              <SubmitButton className="btn-amber btn-sm"><ShieldCheck className="h-4 w-4" aria-hidden />{t("messages.joinAsSecurity")}</SubmitButton>
            </ActionForm>
          )}
        </div>
      ))}
    </div>
  );
}
