import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession, isSecurityStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { profileNames, signedUrls } from "@/lib/data";
import { Chat, type ChatMessage } from "@/components/chat/Chat";
import { ChatTools } from "@/components/chat/ChatTools";
import { markConversationRead } from "@/app/actions/messages";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/messages/${id}`);
  const { t } = await getT();
  const supabase = await getServerSupabase();

  // RLS: only participants (or admins handling an abuse report) can read it.
  const { data: conv } = await supabase.from("conversations").select("id, university_id, report_id, reports(item_name, is_sensitive)").eq("id", id).maybeSingle();
  if (!conv) notFound();

  const [{ data: parts }, { data: msgs }] = await Promise.all([
    supabase.from("conversation_participants").select("user_id, kind").eq("conversation_id", id),
    supabase.from("messages").select("id, sender_id, body, attachment_path, hidden_at, created_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(300),
  ]);
  const participants = parts ?? [];
  const amParticipant = participants.some((p) => p.user_id === session.userId);
  const other = participants.find((p) => p.user_id !== session.userId && p.kind === "party");
  const names = await profileNames(supabase, participants.map((p) => p.user_id));
  const nameMap: Record<string, string> = {};
  for (const p of participants) {
    const n = names.get(p.user_id);
    nameMap[p.user_id] = p.kind === "security" ? `${n?.full_name ?? ""} · ${t("messages.securityMember")}` : n?.deleted ? t("common.deletedUser") : n?.full_name ?? "—";
  }
  const urls = await signedUrls(supabase, "chat-attachments", (msgs ?? []).filter((m) => m.attachment_path && !m.hidden_at).map((m) => m.attachment_path!));
  const messages: ChatMessage[] = (msgs ?? []).map((m) => ({
    id: m.id, sender_id: m.sender_id, body: m.hidden_at ? null : m.body, hidden: Boolean(m.hidden_at),
    attachment_url: m.attachment_path && !m.hidden_at ? urls.get(m.attachment_path) ?? null : null, created_at: m.created_at,
  }));

  let blocked = false, iBlocked = false;
  if (other) {
    const [{ data: b }, { data: mine }] = await Promise.all([
      supabase.rpc("is_blocked_between", { a: session.userId, b: other.user_id }),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", session.userId).eq("blocked_id", other.user_id).maybeSingle(),
    ]);
    blocked = Boolean(b);
    iBlocked = Boolean(mine);
  }
  if (amParticipant) await markConversationRead(id);
  const report = conv.reports as unknown as { item_name: string; is_sensitive: boolean } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/messages" className="btn-ghost btn-sm" aria-label={t("common.back")}><ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden /></Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-white">{other ? nameMap[other.user_id] : t("messages.title")}</h1>
          <Link href={`/reports/${conv.report_id}`} className="link text-xs">{t("messages.about", { item: report?.item_name ?? "" })}</Link>
        </div>
      </div>
      <p className="alert-info text-xs">{t("messages.privacy")}</p>
      <div className="card p-0">
        <Chat conversationId={id} userId={session.userId} initial={messages} names={nameMap} blocked={blocked} canSend={amParticipant} />
      </div>
      <ChatTools
        conversationId={id}
        otherUserId={amParticipant ? other?.user_id ?? null : null}
        iBlocked={iBlocked}
        canJoinAsSecurity={!amParticipant && isSecurityStaff(session) && Boolean(report?.is_sensitive)}
      />
    </div>
  );
}
