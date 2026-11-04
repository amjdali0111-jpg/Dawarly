import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { categoryLabel, coverImages, formatDate, getCategories } from "@/lib/data";
import { REPORT_COLUMNS, type Report } from "@/lib/types";
import { ReportCard } from "@/components/reports/ReportCard";
import { OwnerActions } from "@/components/reports/OwnerActions";

export const metadata = { title: "My reports" };

export default async function MyReportsPage() {
  const session = await requireSession("/my-reports");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const [{ data }, categories] = await Promise.all([
    supabase.from("reports").select(REPORT_COLUMNS).eq("owner_id", session.userId).order("created_at", { ascending: false }).limit(200),
    getCategories(supabase, true),
  ]);
  const reports = (data ?? []) as unknown as Report[];
  const covers = await coverImages(supabase, reports.map((r) => r.id));
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">{t("myReports.title")}</h1>
        <Link href="/reports/new" className="btn-primary"><Plus className="h-4 w-4" aria-hidden />{t("nav.newReport")}</Link>
      </div>
      {reports.length === 0 ? (
        <div className="card text-center">
          <p className="text-slate-400">{t("myReports.empty")}</p>
          <Link href="/reports/new" className="btn-primary mt-4">{t("myReports.create")}</Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              image={covers.get(r.id)}
              categoryName={categoryLabel(catMap.get(r.category_id), locale)}
              dateLabel={formatDate(r.event_date, locale)}
              showStatus
              footer={
                <div className="mt-2 space-y-2">
                  {r.status === "active" && <p className="text-xs text-slate-500">{t("myReports.expiresIn", { date: formatDate(r.expires_at, locale) })}</p>}
                  {["active", "under_review", "expired"].includes(r.status) && <OwnerActions reportId={r.id} status={r.status} canRenew={r.status === "expired"} />}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
