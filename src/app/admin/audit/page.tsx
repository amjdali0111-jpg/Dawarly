import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { formatDate, profileNames } from "@/lib/data";
import { ScopePicker } from "@/components/admin/ScopePicker";

// Audit events hold actions and identifiers, never chat contents.
export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const scope = await adminScope(session, (await searchParams).u);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("audit_events").select("id, action, actor_id, target_type, target_id, metadata, created_at")
    .eq("university_id", scope.id).order("created_at", { ascending: false }).limit(200);
  const people = await profileNames(supabase, (data ?? []).map((e) => e.actor_id ?? ""));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.audit")}</h1>
        {isGlobalAdmin(session) && <ScopePicker current={scope.id} path="/admin/audit" />}
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-xs">
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-b border-white/5">
                <td className="whitespace-nowrap p-2 text-slate-400">{formatDate(e.created_at, locale, true)}</td>
                <td className="p-2 font-mono">{e.action}</td>
                <td className="p-2">{e.actor_id ? people.get(e.actor_id)?.full_name ?? e.actor_id.slice(0, 8) : "system"}</td>
                <td className="p-2 text-slate-400">{e.target_type}:{String(e.target_id ?? "").slice(0, 8)}</td>
                <td className="p-2 font-mono text-slate-500">{JSON.stringify(e.metadata).slice(0, 120)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
