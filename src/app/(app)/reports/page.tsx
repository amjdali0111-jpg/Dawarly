import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { requireSession, isSecurityStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { categoryLabel, coverImages, formatDate, getCategories } from "@/lib/data";
import { PAGE_SIZE, searchReports, type ReportFilters } from "@/lib/search";
import { ReportCard } from "@/components/reports/ReportCard";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportFilters & { verified?: string; forbidden?: string }> }) {
  const session = await requireSession("/reports");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const supabase = await getServerSupabase();
  const staff = isSecurityStaff(session);
  const [categories, { reports, count, page }] = await Promise.all([
    getCategories(supabase),
    searchReports(supabase, session.university.id, sp, { staff }),
  ]);
  const covers = await coverImages(supabase, reports.map((r) => r.id));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const uniName = locale === "ar" ? session.university.name_ar : session.university.name_en;
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
    u.set("page", String(p));
    return `?${u}`;
  };
  const statuses = ["active", "expired", "recovered", "closed", ...(staff ? ["under_review", "removed"] : []), "all"];

  return (
    <div className="space-y-5">
      {sp.verified && <p className="alert-info">{t("auth.verified")}</p>}
      {sp.forbidden && <p className="alert-error">{t("common.forbidden")}</p>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("reports.listTitle")}</h1>
          <p className="muted">{t("reports.listSubtitle", { university: uniName })}</p>
        </div>
        <Link href="/reports/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden />{t("nav.newReport")}</Link>
      </div>

      <form className="card space-y-3" role="search" method="get">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-slate-500" aria-hidden />
          <label htmlFor="q" className="sr-only">{t("common.search")}</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder={t("reports.searchPlaceholder")} className="input ps-9" />
        </div>
        <details className="group" open={Boolean(sp.type || sp.category || sp.color || sp.from || sp.to || sp.location || (sp.status && sp.status !== "active"))}>
          <summary className="cursor-pointer text-sm text-teal-300">{t("common.filters")}</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="text-xs text-slate-400">{t("reports.filterType")}
              <select name="type" defaultValue={sp.type ?? ""} className="input mt-1">
                <option value="">{t("common.all")}</option>
                <option value="lost">{t("reportType.lost")}</option>
                <option value="found">{t("reportType.found")}</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterCategory")}
              <select name="category" defaultValue={sp.category ?? ""} className="input mt-1">
                <option value="">{t("common.all")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{categoryLabel(c, locale)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterColor")}
              <input name="color" defaultValue={sp.color} className="input mt-1" />
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterLocation")}
              <input name="location" defaultValue={sp.location} className="input mt-1" />
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterDateFrom")}
              <input type="date" name="from" defaultValue={sp.from} className="input mt-1" />
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterDateTo")}
              <input type="date" name="to" defaultValue={sp.to} className="input mt-1" />
            </label>
            <label className="text-xs text-slate-400">{t("reports.filterStatus")}
              <select name="status" defaultValue={sp.status ?? "active"} className="input mt-1">
                {statuses.map((s) => <option key={s} value={s}>{s === "all" ? t("common.all") : t(`reportStatus.${s}` as "reportStatus.active")}</option>)}
              </select>
            </label>
          </div>
        </details>
        <div className="flex gap-2">
          <button className="btn-primary btn-sm" type="submit">{t("common.search")}</button>
          <Link href="/reports" className="btn-ghost btn-sm">{t("common.reset")}</Link>
        </div>
      </form>

      {reports.length === 0 ? (
        <p className="card text-center text-slate-400">{t("reports.noResults")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} image={covers.get(r.id)} categoryName={categoryLabel(catMap.get(r.category_id), locale)} dateLabel={formatDate(r.event_date, locale)} />
          ))}
        </div>
      )}

      {count > PAGE_SIZE && (
        <nav className="flex items-center justify-center gap-3" aria-label="pagination">
          {page > 1 && <Link className="btn-ghost btn-sm" href={qs(page - 1)}>{t("common.previous")}</Link>}
          <span className="muted">{t("common.pageOf", { page })}</span>
          {page * PAGE_SIZE < count && <Link className="btn-ghost btn-sm" href={qs(page + 1)}>{t("common.next")}</Link>}
        </nav>
      )}
    </div>
  );
}
