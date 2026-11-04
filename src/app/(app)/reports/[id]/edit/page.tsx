import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getCategories, signedUrls } from "@/lib/data";
import { universityCenter } from "@/lib/geo-defaults";
import { ReportForm } from "@/components/reports/ReportForm";
import { REPORT_COLUMNS, type Report } from "@/lib/types";

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/reports/${id}/edit`);
  const { t } = await getT();
  const supabase = await getServerSupabase();
  const { data: report } = await supabase.from("reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle<Report>();
  if (!report) notFound();
  if (report.owner_id !== session.userId || !["active", "under_review", "expired"].includes(report.status)) redirect(`/reports/${id}`);

  const [categories, { data: priv }, { data: images }] = await Promise.all([
    getCategories(supabase),
    supabase.from("report_private").select("exact_lat, exact_lng, verification_notes").eq("report_id", id).maybeSingle(),
    supabase.from("report_images").select("storage_path, position").eq("report_id", id).order("position"),
  ]);
  const urls = await signedUrls(supabase, "report-images", (images ?? []).map((i) => i.storage_path));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="page-title">{t("reports.editTitle")}</h1>
      <div className="card">
        <ReportForm
          mode="edit"
          reportId={id}
          categories={categories}
          universityId={session.university.id}
          userId={session.userId}
          center={universityCenter(session.university)}
          initial={{
            type: report.type, item_name: report.item_name, description: report.description, category_id: report.category_id,
            color: report.color, distinguishing_features: report.distinguishing_features, location_text: report.location_text,
            lat: priv?.exact_lat ?? report.approx_lat, lng: priv?.exact_lng ?? report.approx_lng,
            event_date: report.event_date, event_time: report.event_time?.slice(0, 5) ?? "", verification_notes: priv?.verification_notes ?? "",
            photos: (images ?? []).map((i) => ({ path: i.storage_path, url: urls.get(i.storage_path) ?? "" })),
          }}
        />
      </div>
    </div>
  );
}
