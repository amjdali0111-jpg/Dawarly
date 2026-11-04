"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, ClipboardList, FileText, Home, Map, MessageCircle, Plus, Settings, Shield, Sparkles, User, Inbox,
} from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { TKey } from "@/i18n/translate";

const ICONS = { home: Home, reports: FileText, myReports: ClipboardList, matches: Sparkles, requests: Inbox, messages: MessageCircle, notifications: Bell, map: Map, profile: User, settings: Settings, admin: Shield, plus: Plus };
type IconName = keyof typeof ICONS;
export interface NavItem { href: string; label: TKey; icon: IconName; badge?: number }

const isActive = (path: string, href: string) => path === href || (href !== "/" && path.startsWith(href + "/"));

export function SidebarNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className="flex flex-col gap-1" aria-label={t("common.menu")}>
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(path, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-teal-400/15 text-teal-200" : "text-slate-300 hover:bg-white/5"}`}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            <span className="flex-1">{t(it.label)}</span>
            {!!it.badge && <span className="badge bg-danger-500 text-white">{it.badge > 99 ? "99+" : it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ unread }: { unread: number }) {
  const path = usePathname();
  const { t } = useI18n();
  const items: Array<NavItem | "plus"> = [
    { href: "/reports", label: "nav.home", icon: "home" },
    { href: "/my-reports", label: "nav.myReports", icon: "myReports" },
    "plus",
    { href: "/messages", label: "nav.messages", icon: "messages", badge: unread },
    { href: "/profile", label: "nav.profile", icon: "profile" },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-night-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label={t("common.menu")}>
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5">
        {items.map((it) => {
          if (it === "plus") {
            return (
              <li key="plus" className="-mt-6">
                <Link href="/reports/new" aria-label={t("nav.newReport")} className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-400 text-night-950 shadow-lg shadow-amber-500/30">
                  <Plus className="h-7 w-7" aria-hidden />
                </Link>
              </li>
            );
          }
          const Icon = ICONS[it.icon];
          const active = isActive(path, it.href);
          return (
            <li key={it.href}>
              <Link href={it.href} aria-current={active ? "page" : undefined} className={`relative flex flex-col items-center gap-0.5 px-2 py-1.5 text-[11px] ${active ? "text-teal-300" : "text-slate-400"}`}>
                <Icon className="h-5 w-5" aria-hidden />
                {t(it.label)}
                {!!it.badge && <span className="absolute end-1 top-0.5 h-2 w-2 rounded-full bg-danger-500" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
