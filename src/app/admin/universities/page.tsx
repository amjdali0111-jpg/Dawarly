import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { UniversityForm } from "@/components/admin/UniversityForm";
import type { University } from "@/lib/types";

export default async function AdminUniversitiesPage() {
  await requireStaff("global");
  const { t } = await getT();
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("universities").select("id, slug, name_en, name_ar, center_lat, center_lng, is_active").order("name_en");
  return (
    <div className="space-y-4">
      <h1 className="page-title">{t("admin.universities")}</h1>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("admin.addUniversity")}</h2>
        <UniversityForm />
      </section>
      <ul className="space-y-2">
        {((data ?? []) as University[]).map((u) => (
          <li key={u.id} className="card space-y-2">
            <p className="text-sm font-semibold">{u.name_en} · {u.name_ar} <span className="text-xs text-slate-500" dir="ltr">({u.slug})</span>
              <Link href={`/admin?u=${u.id}`} className="link ms-2 text-xs">{t("admin.dashboard")}</Link></p>
            <UniversityForm university={u} />
          </li>
        ))}
      </ul>
    </div>
  );
}
