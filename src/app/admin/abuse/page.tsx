import Link from "next/link";
import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { formatDate, profileNames } from "@/lib/data";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { AbuseResolveForm } from "@/components/admin/CaseForms";
import type { TKey } from "@/i18n/translate";

export default async function AdminAbusePage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("abuse_reports").select("id, target_type, target_id, target_user_id, reporter_id, reason, details, status, outcome, created_at")
    .eq("university_id", scope.id).order("status").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const people = await profileNames(supabase, rows.flatMap((r) => [r.reporter_id, r.target_user_id ?? ""]));
  const targetHref = (r: (typeof rows)[number]) =>
    r.target_type === "report" ? `/admin/reports/${r.target_id}` : r.target_type === "user" ? `/users/${r.target_id}`
      : r.target_type === "conversation" ? `/messages/${r.target_id}` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.abuse")}</h1>
        {isGlobalAdmin(session) && <ScopePicker current={scope.id} path="/admin/abuse" />}
      </div>
      <p className="text-xs text-slate-400">{t("admin.graduatedHelp")}</p>
      {rows.length === 0 ? <p className="card text-center text-slate-400">{t("admin.noPending")}</p> : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={r.status === "open" ? "badge-amber" : "badge-muted"}>{r.status}</span>
                <span className="font-semibold">{t(`abuse.reasons.${r.reason}` as TKey)}</span>
                <span className="text-slate-400">· {r.target_type}</span>
                <span className="ms-auto text-xs text-slate-500">{formatDate(r.created_at, locale, true)}</span>
              </div>
              <p className="text-xs text-slate-400">
                {t("admin.reporter")}: {people.get(r.reporter_id)?.full_name} · {t("admin.target")}: {people.get(r.target_user_id ?? "")?.full_name ?? "—"}
                {targetHref(r) && <> · <Link className="link" href={targetHref(r)!}>{t("common.view")}</Link></>}
              </p>
              {r.details && <p className="text-sm text-slate-200">{r.details}</p>}
              {r.status === "open" ? <AbuseResolveForm abuseId={r.id} canRemove={["report", "message", "rating"].includes(r.target_type)} /> : <p className="text-xs text-slate-400">{t("admin.outcome")}: {r.outcome}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
