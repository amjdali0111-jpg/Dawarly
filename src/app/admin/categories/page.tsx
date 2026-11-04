import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { CategoryForm } from "@/components/admin/CategoryForm";
import type { Category } from "@/lib/types";

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const global = isGlobalAdmin(session);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("categories").select("id, university_id, slug, name_en, name_ar, icon, is_sensitive, is_active, sort_order")
    .or(`university_id.is.null,university_id.eq.${scope.id}`).order("sort_order");
  const cats = (data ?? []) as Category[];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.categories")}</h1>
        {global && <ScopePicker current={scope.id} path="/admin/categories" />}
      </div>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("admin.addCategory")}</h2>
        <CategoryForm universityId={scope.id} allowGlobal={global} />
      </section>
      <ul className="space-y-2">
        {cats.map((c) => (
          <li key={c.id} className="card space-y-2">
            <p className="text-sm font-semibold">
              {locale === "ar" ? c.name_ar : c.name_en} <span className="text-xs text-slate-500" dir="ltr">({c.slug})</span>
              {c.university_id === null && <span className="badge-muted ms-2">{t("admin.platformDefault")}</span>}
              {c.is_sensitive && <span className="badge-amber ms-2">{t("admin.sensitive")}</span>}
              {!c.is_active && <span className="badge-muted ms-2">✕ {t("admin.active")}</span>}
            </p>
            {(c.university_id !== null || global) && <CategoryForm category={c} universityId={scope.id} allowGlobal={global} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
