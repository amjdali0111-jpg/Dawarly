import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { universityCenter } from "@/lib/geo-defaults";
import { ReportsMap } from "@/components/map/ReportsMap";

export const metadata = { title: "Campus map" };

// Only approximate (~100 m) coordinates are ever sent to the browser.
export default async function MapPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireSession("/map");
  const { t } = await getT();
  const { type } = await searchParams;
  const supabase = await getServerSupabase();
  let q = supabase.from("reports").select("id, type, item_name, approx_lat, approx_lng")
    .eq("university_id", session.university.id).eq("status", "active").not("approx_lat", "is", null).limit(500);
  if (type === "lost" || type === "found") q = q.eq("type", type);
  const { data } = await q;
  const points = (data ?? []).map((r) => ({ id: r.id, lat: r.approx_lat as number, lng: r.approx_lng as number, label: r.item_name, type: r.type, href: `/reports/${r.id}` }));
  const tabs = [["", t("common.all")], ["lost", t("reportType.lost")], ["found", t("reportType.found")]] as const;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">{t("map.title")}</h1>
        <p className="muted">{t("map.subtitle")}</p>
      </div>
      <nav className="flex gap-1 rounded-xl bg-night-800 p-1">
        {tabs.map(([k, label]) => (
          <a key={k} href={k ? `/map?type=${k}` : "/map"} className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold ${(type ?? "") === k ? "bg-teal-400 text-night-950" : "text-slate-300"}`}>{label}</a>
        ))}
      </nav>
      <ReportsMap points={points} center={universityCenter(session.university)} />
      <p className="muted">{points.length === 0 ? t("map.noLocations") : t("map.approxNotice")}</p>
    </div>
  );
}
