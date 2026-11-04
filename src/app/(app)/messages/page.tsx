import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate, profileNames } from "@/lib/data";

export const metadata = { title: "Messages" };

type Part = { conversation_id: string; last_read_at: string | null; conversations: { id: string; last_message_at: string; report_id: string; reports: { item_name: string } | null } | null };

export default async function MessagesPage() {
  const session = await requireSession("/messages");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at, conversations(id, last_message_at, report_id, reports(item_name))")
    .eq("user_id", session.userId);
  const parts = ((data ?? []) as unknown as Part[]).filter((p) => p.conversations)
    .sort((a, b) => b.conversations!.last_message_at.localeCompare(a.conversations!.last_message_at));

  const convIds = parts.map((p) => p.conversation_id);
  const { data: others } = convIds.length
    ? await supabase.from("conversation_participants").select("conversation_id, user_id, kind").in("conversation_id", convIds).neq("user_id", session.userId)
    : { data: [] };
  const names = await profileNames(supabase, (others ?? []).map((o) => o.user_id));
  const otherName = (convId: string) =>
    (others ?? []).filter((o) => o.conversation_id === convId && o.kind === "party").map((o) => names.get(o.user_id)?.deleted ? t("common.deletedUser") : names.get(o.user_id)?.full_name).join(", ");

  return (
    <div className="space-y-5">
      <h1 className="page-title">{t("messages.title")}</h1>
      {parts.length === 0 ? (
        <p className="card text-center text-slate-400">{t("messages.empty")}</p>
      ) : (
        <ul className="card divide-y divide-white/5 p-0">
          {parts.map((p) => {
            const c = p.conversations!;
            const unread = !p.last_read_at || c.last_message_at > p.last_read_at;
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-400/15 text-teal-300"><MessageCircle className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${unread ? "font-bold text-white" : "text-slate-200"}`}>{otherName(c.id) || "—"}</span>
                    <span className="block truncate text-xs text-slate-400">{t("messages.about", { item: c.reports?.item_name ?? "" })}</span>
                  </span>
                  <span className="text-xs text-slate-500">{formatDate(c.last_message_at, locale)}</span>
                  {unread && <span className="h-2.5 w-2.5 rounded-full bg-teal-400" aria-label="unread" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
