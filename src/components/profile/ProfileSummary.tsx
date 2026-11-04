import { Star } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate, profileNames } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { Avatar } from "@/components/Avatar";

/**
 * Profile header + ratings. Ratings come through RLS, which only returns them
 * to authenticated members of the same university.
 */
export async function ProfileSummary({ profile, universityName }: { profile: Profile; universityName: string }) {
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const [{ count: reports }, { count: recovered }, { data: summary }, { data: ratings }] = await Promise.all([
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("owner_id", profile.id),
    supabase.from("recovery_requests").select("id", { count: "exact", head: true }).eq("finder_id", profile.id).eq("status", "completed"),
    supabase.rpc("user_rating_summary", { p_user: profile.id }),
    supabase.from("ratings").select("id, stars, comment, rater_id, created_at").eq("ratee_id", profile.id).is("hidden_at", null).order("created_at", { ascending: false }).limit(20),
  ]);
  const s = (summary as Array<{ average: number | null; total: number }> | null)?.[0];
  const raters = await profileNames(supabase, (ratings ?? []).map((r) => r.rater_id));

  return (
    <div className="space-y-4">
      <div className="card flex flex-col items-center gap-2 text-center">
        <Avatar name={profile.full_name} path={profile.avatar_path} size={88} />
        <h1 className="text-xl font-bold text-white">{profile.full_name}</h1>
        <p className="text-sm text-slate-400">
          {t(`memberType.${profile.member_type}`)}{profile.role !== "user" ? ` · ${t(`roles.${profile.role}`)}` : ""}
          {profile.faculty ? ` · ${profile.faculty}` : ""}
        </p>
        <p className="text-xs text-slate-500">{universityName} · {t("profile.memberSince", { date: formatDate(profile.created_at, locale) })}</p>
        <dl className="mt-3 grid w-full grid-cols-3 gap-2">
          <div className="rounded-xl bg-night-900 p-3"><dd className="text-2xl font-bold text-teal-300">{reports ?? 0}</dd><dt className="text-xs text-slate-400">{t("profile.reports")}</dt></div>
          <div className="rounded-xl bg-night-900 p-3"><dd className="text-2xl font-bold text-teal-300">{recovered ?? 0}</dd><dt className="text-xs text-slate-400">{t("profile.recovered")}</dt></div>
          <div className="rounded-xl bg-night-900 p-3"><dd className="text-2xl font-bold text-amber-300">{s?.average ?? "—"}</dd><dt className="text-xs text-slate-400">{t("profile.ratings")}</dt></div>
        </dl>
      </div>
      <section className="card space-y-3">
        <h2 className="font-semibold text-white">{t("profile.ratings")}</h2>
        {s && Number(s.total) > 0 && <p className="text-sm text-amber-200">{t("profile.averageOf", { avg: s.average ?? 0, count: s.total })}</p>}
        {(ratings ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">{t("profile.noRatings")}</p>
        ) : (
          <ul className="space-y-3">
            {(ratings ?? []).map((r) => (
              <li key={r.id} className="rounded-xl bg-night-900 p-3">
                <div className="flex items-center gap-1" aria-label={`${r.stars}/5`}>
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.stars ? "fill-amber-400 text-amber-400" : "text-slate-600"}`} aria-hidden />)}
                  <span className="ms-2 text-xs text-slate-500">{raters.get(r.rater_id)?.deleted ? t("common.deletedUser") : raters.get(r.rater_id)?.full_name} · {formatDate(r.created_at, locale)}</span>
                </div>
                {r.comment && <p className="mt-1 text-sm text-slate-200">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">{t("profile.ratingsPrivate")}</p>
      </section>
    </div>
  );
}
