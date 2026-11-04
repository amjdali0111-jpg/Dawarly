import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";

/** University selector for global admins (plain GET form). */
export async function ScopePicker({ current, path }: { current: string; path: string }) {
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("universities").select("id, name_en, name_ar").order("name_en");
  return (
    <form method="get" action={path} className="flex items-center gap-2">
      <label htmlFor="scope-u" className="text-xs text-slate-400">{t("auth.university")}</label>
      <select id="scope-u" name="u" defaultValue={current} className="input max-w-xs py-1.5">
        {(data ?? []).map((u) => <option key={u.id} value={u.id}>{locale === "ar" ? u.name_ar : u.name_en}</option>)}
      </select>
      <button className="btn-ghost btn-sm" type="submit">{t("common.apply")}</button>
    </form>
  );
}
