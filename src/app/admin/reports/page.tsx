import Link from "next/link";
import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { formatDate, profileNames } from "@/lib/data";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { SensitiveBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import { REPORT_COLUMNS, type Report, type ReportStatus } from "@/lib/types";
import type { TKey } from "@/i18n/translate";

const STATUSES: ReportStatus[] = ["under_review", "active", "expired", "recovered", "closed", "removed"];

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ u?: string; status?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const scope = await adminScope(session, sp.u);
  const status = STATUSES.includes(sp.status as ReportStatus) ? (sp.status as ReportStatus) : "under_review";
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("reports").select(REPORT_COLUMNS).eq("university_id", scope.id).eq("status", status).order("created_at", { ascending: false }).limit(100);
  const reports = (data ?? []) as unknown as Report[];
  const { data: flags } = reports.length
    ? await supabase.from("moderation_flags").select("report_id, reasons, source").in("report_id", reports.map((r) => r.id)).is("resolved_at", null)
    : { data: [] };
  const owners = await profileNames(supabase, reports.map((r) => r.owner_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.reports")}</h1>
        {isGlobalAdmin(session) && <ScopePicker current={scope.id} path="/admin/reports" />}
      </div>
      <nav className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}${sp.u ? `&u=${sp.u}` : ""}`} className={`btn-sm btn ${s === status ? "bg-teal-400 text-night-950" : "btn-ghost"}`}>{t(`reportStatus.${s}`)}</Link>
        ))}
      </nav>
      {reports.length === 0 ? <p className="card text-center text-slate-400">{t("admin.noPending")}</p> : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5"><TypeBadge type={r.type} /><StatusBadge status={r.status} />{r.is_sensitive && <SensitiveBadge />}</div>
                <Link href={`/admin/reports/${r.id}`} className="mt-1 block font-semibold text-white hover:text-teal-200">{r.item_name}</Link>
                <p className="text-xs text-slate-400">{owners.get(r.owner_id)?.full_name} · {formatDate(r.created_at, locale, true)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(flags ?? []).filter((f) => f.report_id === r.id).flatMap((f) => f.reasons as string[]).map((reason, i) => (
                    <span key={i} className="badge-amber">{t(`admin.flagReasons.${reason}` as TKey)}</span>
                  ))}
                </div>
              </div>
              <Link href={`/admin/reports/${r.id}`} className="btn-ghost btn-sm">{t("common.view")}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
