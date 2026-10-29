import Link from "next/link";
import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { formatDate, profileNames } from "@/lib/data";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { DisputeResolveForm } from "@/components/admin/CaseForms";

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("disputes")
    .select("id, reason, status, resolution, created_at, opened_by, recovery_requests(id, report_id, item_owner_id, finder_id, status)")
    .eq("university_id", scope.id).order("status").order("created_at", { ascending: false }).limit(100);
  type Row = { id: string; reason: string; status: string; resolution: string | null; created_at: string; opened_by: string; recovery_requests: { id: string; report_id: string; item_owner_id: string; finder_id: string; status: string } | null };
  const rows = (data ?? []) as unknown as Row[];
  const people = await profileNames(supabase, rows.flatMap((r) => [r.opened_by, r.recovery_requests?.item_owner_id ?? "", r.recovery_requests?.finder_id ?? ""]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.disputes")}</h1>
        {isGlobalAdmin(session) && <ScopePicker current={scope.id} path="/admin/disputes" />}
      </div>
      {rows.length === 0 ? <p className="card text-center text-slate-400">{t("admin.noPending")}</p> : (
        <ul className="space-y-2">
          {rows.map((d) => (
            <li key={d.id} className="card space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={d.status === "open" ? "badge-amber" : "badge-muted"}>{d.status}</span>
                <span className="text-xs text-slate-500">{formatDate(d.created_at, locale, true)}</span>
                {d.recovery_requests && <Link href={`/admin/reports/${d.recovery_requests.report_id}`} className="link ms-auto text-xs">{t("common.view")}</Link>}
              </div>
              <p className="text-xs text-slate-400">
                {t("requests.itemOwner")}: {people.get(d.recovery_requests?.item_owner_id ?? "")?.full_name} · {t("requests.finder")}: {people.get(d.recovery_requests?.finder_id ?? "")?.full_name}
              </p>
              <p className="text-sm">{d.reason}</p>
              {d.status === "open" ? <DisputeResolveForm disputeId={d.id} /> : <p className="text-xs text-slate-400">{t("admin.resolution")}: {d.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
