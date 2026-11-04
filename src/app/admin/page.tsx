import Link from "next/link";
import { requireStaff, isGlobalAdmin, isUniversityAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { ScopePicker } from "@/components/admin/ScopePicker";

export const metadata = { title: "Administration" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("security");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const supabase = await getServerSupabase();
  const uniName = locale === "ar" ? scope.name_ar : scope.name_en;

  const { count: securityQueue } = await supabase.from("recovery_requests").select("id", { count: "exact", head: true })
    .eq("university_id", scope.id).eq("status", "security_review");

  if (!isUniversityAdmin(session)) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t("admin.title")}</h1>
        <Link href="/admin/security" className="card block hover:border-teal-400/30">
          <p className="text-3xl font-bold text-amber-300">{securityQueue ?? 0}</p>
          <p className="text-sm text-slate-300">{t("admin.security")}</p>
        </Link>
      </div>
    );
  }

  const { data: a } = await supabase.rpc("university_analytics", { p_university: scope.id });
  const stats = (a ?? {}) as Record<string, number>;
  const tiles = [
    { label: t("admin.reviewQueue"), value: stats.open_flags, href: "/admin/reports", tone: "text-amber-300" },
    { label: t("admin.security"), value: securityQueue ?? 0, href: "/admin/security", tone: "text-amber-300" },
    { label: t("admin.abuse"), value: stats.open_abuse, href: "/admin/abuse", tone: "text-red-300" },
    { label: t("admin.disputes"), value: stats.open_disputes, href: "/admin/disputes", tone: "text-red-300" },
    { label: t("reportStatus.active"), value: stats.active, href: "/admin/analytics", tone: "text-teal-300" },
    { label: t("reportStatus.recovered"), value: stats.recovered, href: "/admin/analytics", tone: "text-emerald-300" },
    { label: t("reportStatus.expired"), value: stats.expired, href: "/admin/analytics", tone: "text-slate-200" },
    { label: t("admin.usersCount"), value: stats.users, href: "/admin/users", tone: "text-slate-200" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("admin.title")}</h1>
          <p className="muted">{t("admin.scopeUniversity", { university: uniName })}</p>
        </div>
        {isGlobalAdmin(session) && <ScopePicker current={scope.id} path="/admin" />}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="card hover:border-teal-400/30">
            <p className={`text-3xl font-bold ${tile.tone}`}>{tile.value ?? 0}</p>
            <p className="text-sm text-slate-300">{tile.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
