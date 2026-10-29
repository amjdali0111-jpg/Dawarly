import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { BarList, Legend, SERIES, SplitBar, TrendChart } from "@/components/admin/Charts";

type Analytics = {
  total: number; lost: number; found: number; active: number; under_review: number; expired: number; recovered: number; closed: number; sensitive: number;
  by_category: Array<{ slug: string; name_en: string; name_ar: string; count: number }>;
  daily: Array<{ day: string; lost: number; found: number }>;
};
type GlobalRow = { university_id: string; name_en: string; name_ar: string; users: number; reports: number; recovered: number; active: number };

// Aggregates only — no personal data. Global admins additionally see a
// per-university comparison.
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const supabase = await getServerSupabase();
  const global = isGlobalAdmin(session);
  const [{ data }, globalRes] = await Promise.all([
    supabase.rpc("university_analytics", { p_university: scope.id }),
    global ? supabase.rpc("global_analytics") : Promise.resolve({ data: null }),
  ]);
  const a = data as Analytics | null;
  const g = (globalRes.data ?? []) as GlobalRow[];
  const fmt = (d: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { day: "numeric", month: "short" }).format(new Date(d + "T00:00:00"));
  const name = (x: { name_en: string; name_ar: string }) => (locale === "ar" ? x.name_ar : x.name_en);

  if (!a) return <p className="alert-error">{t("common.genericError")}</p>;
  const statusRows = (["active", "under_review", "expired", "recovered", "closed"] as const)
    .map((s) => ({ label: t(`reportStatus.${s}`), value: Number(a[s]) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">{t("admin.analytics")}</h1>
          <p className="muted">{t("admin.scopeUniversity", { university: name(scope) })}</p>
        </div>
        {global && <ScopePicker current={scope.id} path="/admin/analytics" />}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t("admin.totals"), a.total], [t("reportStatus.recovered"), a.recovered], [t("reportStatus.active"), a.active], [t("reports.sensitiveBadge"), a.sensitive],
        ].map(([label, v]) => (
          <div key={String(label)} className="card"><p className="text-3xl font-bold text-white tabular-nums">{v}</p><p className="text-sm text-slate-400">{label}</p></div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("admin.lostVsFound")}</h2>
          <SplitBar a={{ label: t("reportType.lost"), value: Number(a.lost), color: SERIES.lost }} b={{ label: t("reportType.found"), value: Number(a.found), color: SERIES.found }} />
        </section>
        <section className="card space-y-3">
          <h2 className="font-semibold">{t("reports.filterStatus")}</h2>
          <BarList rows={statusRows} />
        </section>
      </div>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t("admin.last30")}</h2>
          <Legend items={[{ label: t("reportType.lost"), color: SERIES.lost }, { label: t("reportType.found"), color: SERIES.found }]} />
        </div>
        <TrendChart days={a.daily} labels={{ lost: t("reportType.lost"), found: t("reportType.found") }} dateFmt={fmt} />
        <details className="text-sm">
          <summary className="cursor-pointer text-teal-300">Table</summary>
          <table className="mt-2 w-full text-start text-xs">
            <thead><tr className="text-slate-400"><th className="text-start">{t("reports.date")}</th><th>{t("reportType.lost")}</th><th>{t("reportType.found")}</th></tr></thead>
            <tbody>{a.daily.map((d) => <tr key={d.day} className="border-t border-white/5"><td>{fmt(d.day)}</td><td className="text-center tabular-nums">{d.lost}</td><td className="text-center tabular-nums">{d.found}</td></tr>)}</tbody>
          </table>
        </details>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t("admin.byCategory")}</h2>
        {a.by_category.length ? <BarList rows={a.by_category.map((c) => ({ label: name(c), value: Number(c.count) }))} /> : <p className="muted">—</p>}
      </section>

      {global && g.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">{t("admin.scopeGlobal")}</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-400"><th className="text-start">{t("auth.university")}</th><th>{t("admin.usersCount")}</th><th>{t("admin.totals")}</th><th>{t("reportStatus.active")}</th><th>{t("reportStatus.recovered")}</th></tr></thead>
            <tbody>{g.map((u) => (
              <tr key={u.university_id} className="border-t border-white/5"><td>{name(u)}</td><td className="text-center tabular-nums">{u.users}</td><td className="text-center tabular-nums">{u.reports}</td><td className="text-center tabular-nums">{u.active}</td><td className="text-center tabular-nums">{u.recovered}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
