import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate } from "@/lib/data";
import { REPORT_COLUMNS, type Report } from "@/lib/types";
import { StatusBadge, TypeBadge } from "@/components/Badges";

// Security staff workspace: sensitive reports of their university and the
// recovery requests waiting for security review.
export default async function AdminSecurityPage() {
  const session = await requireStaff("security");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const uni = session.university.id;
  const [{ count: pending }, { data }] = await Promise.all([
    supabase.from("recovery_requests").select("id", { count: "exact", head: true }).eq("university_id", uni).eq("status", "security_review"),
    supabase.from("reports").select(REPORT_COLUMNS).eq("university_id", uni).eq("is_sensitive", true).in("status", ["active", "under_review", "expired"]).order("created_at", { ascending: false }).limit(100),
  ]);
  const reports = (data ?? []) as unknown as Report[];
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.security")}</h1>
      <Link href="/requests?tab=security" className="card block hover:border-amber-400/40">
        <p className="text-3xl font-bold text-amber-300">{pending ?? 0}</p>
        <p className="text-sm text-slate-300">{t("requestStatus.security_review")}</p>
      </Link>
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id} className="card flex flex-wrap items-center gap-2">
            <TypeBadge type={r.type} /><StatusBadge status={r.status} />
            <Link href={`/reports/${r.id}`} className="font-semibold hover:text-teal-200">{r.item_name}</Link>
            <span className="ms-auto text-xs text-slate-500">{formatDate(r.created_at, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
