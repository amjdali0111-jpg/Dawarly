import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import type { SessionContext } from "@/lib/auth";
import { isSecurityStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { signOut } from "@/app/actions/auth";
import { publicEnv } from "@/lib/env";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BottomNav, SidebarNav, type NavItem } from "./NavLinks";
import { Avatar } from "./Avatar";

export async function AppShell({ session, children }: { session: SessionContext; children: React.ReactNode }) {
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const [{ count: unread }, { data: parts }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.userId).is("read_at", null),
    supabase.from("conversation_participants").select("conversation_id, last_read_at, conversations(last_message_at)").eq("user_id", session.userId),
  ]);
  const unreadChats = (parts ?? []).filter((p) => {
    const conv = p.conversations as unknown as { last_message_at: string } | null;
    return conv && (!p.last_read_at || conv.last_message_at > p.last_read_at);
  }).length;

  const items: NavItem[] = [
    { href: "/reports", label: "nav.reports", icon: "reports" },
    { href: "/reports/new", label: "nav.newReport", icon: "plus" },
    { href: "/my-reports", label: "nav.myReports", icon: "myReports" },
    { href: "/matches", label: "nav.matches", icon: "matches" },
    { href: "/requests", label: "nav.requests", icon: "requests" },
    { href: "/messages", label: "nav.messages", icon: "messages", badge: unreadChats },
    { href: "/notifications", label: "nav.notifications", icon: "notifications", badge: unread ?? 0 },
    { href: "/map", label: "nav.map", icon: "map" },
    { href: "/profile", label: "nav.profile", icon: "profile" },
    { href: "/settings", label: "nav.settings", icon: "settings" },
  ];
  if (isSecurityStaff(session)) items.push({ href: "/admin", label: "nav.admin", icon: "admin" });
  const uniName = locale === "ar" ? session.university.name_ar : session.university.name_en;

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-white/5 bg-night-900 p-4 lg:flex">
        <Link href="/reports" className="mb-6 px-2"><Logo name={publicEnv.appName} /></Link>
        <SidebarNav items={items} />
        <div className="mt-auto space-y-3 pt-6">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Avatar name={session.profile.full_name} path={session.profile.avatar_path} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session.profile.full_name}</p>
              <p className="truncate text-xs text-slate-400">{uniName}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <LanguageSwitcher />
            <form action={signOut}>
              <button className="btn-ghost btn-sm" type="submit"><LogOut className="h-4 w-4" aria-hidden />{t("common.signOut")}</button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-night-900/90 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/reports"><Logo name={publicEnv.appName} /></Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            <Link href="/notifications" className="btn-ghost btn-sm relative" aria-label={t("nav.notifications")}>
              <Bell className="h-4 w-4" aria-hidden />
              {!!unread && <span className="absolute -end-1 -top-1 rounded-full bg-danger-500 px-1.5 text-[10px] text-white">{unread}</span>}
            </Link>
            <Link href="/settings" className="btn-ghost btn-sm" aria-label={t("nav.settings")}>⋯</Link>
          </div>
        </header>
        {session.restrictedUntil && new Date(session.restrictedUntil) > new Date() && (
          <div className="alert-warn m-4 mb-0">{t("errors.auth:restricted")}</div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-10">{children}</main>
      </div>
      <BottomNav unread={unreadChats} />
    </div>
  );
}
