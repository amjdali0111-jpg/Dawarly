import Link from "next/link";
import { Bell } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate } from "@/lib/data";
import { notificationHref } from "@/lib/notification-links";
import type { NotificationRow } from "@/lib/types";
import type { TKey } from "@/i18n/translate";
import { MarkAllRead } from "./MarkAllRead";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await requireSession("/notifications");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("notifications").select("id, kind, data, read_at, created_at").eq("user_id", session.userId).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as NotificationRow[];
  const text = (n: NotificationRow) => {
    const key = `notifications.kinds.${n.kind}` as TKey;
    const vars = {
      status: t(`requestStatus.${n.data.status ?? ""}` as TKey),
      decision: t(`notifications.decisions.${n.data.decision ?? ""}` as TKey),
    };
    const s = t(key, vars);
    return s === key ? n.kind : s;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">{t("notifications.title")}</h1>
        {rows.some((r) => !r.read_at) && <MarkAllRead />}
      </div>
      {rows.length === 0 ? (
        <p className="card text-center text-slate-400">{t("notifications.empty")}</p>
      ) : (
        <ul className="card divide-y divide-white/5 p-0">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={notificationHref(n.kind, n.data)} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5">
                <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${n.read_at ? "bg-white/5 text-slate-400" : "bg-teal-400/15 text-teal-300"}`}><Bell className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.read_at ? "text-slate-300" : "font-semibold text-white"}`}>{text(n)}</span>
                  <span className="text-xs text-slate-500">{formatDate(n.created_at, locale, true)}</span>
                </span>
                {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-teal-400" aria-hidden />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
