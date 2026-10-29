import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { getCategories } from "@/lib/data";
import { universityCenter } from "@/lib/geo-defaults";
import { ReportForm } from "@/components/reports/ReportForm";

export const metadata = { title: "New report" };

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireSession("/reports/new");
  const { t } = await getT();
  const { type } = await searchParams;
  const categories = await getCategories(await getServerSupabase());
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="page-title">{t("reports.newTitle")}</h1>
        <p className="muted">{t("reports.newSubtitle")}</p>
      </div>
      {session.restrictedUntil && new Date(session.restrictedUntil) > new Date() ? (
        <p className="alert-warn">{t("errors.auth:restricted")}</p>
      ) : (
        <div className="card">
          <ReportForm
            mode="create"
            categories={categories}
            universityId={session.university.id}
            userId={session.userId}
            center={universityCenter(session.university)}
            initial={{
              type: type === "found" ? "found" : "lost",
              item_name: "", description: "", category_id: "", color: "", distinguishing_features: "", location_text: "",
              lat: null, lng: null, event_date: new Date().toISOString().slice(0, 10), event_time: "", verification_notes: "", photos: [],
            }}
          />
        </div>
      )}
    </div>
  );
}
