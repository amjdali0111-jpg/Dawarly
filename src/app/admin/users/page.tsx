import { requireStaff, isGlobalAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { adminScope } from "@/lib/admin-scope";
import { formatDate } from "@/lib/data";
import { ScopePicker } from "@/components/admin/ScopePicker";
import { UserAdminRow } from "@/components/admin/UserAdminRow";
import type { MemberType, Role } from "@/lib/types";

type Row = { id: string; full_name: string; role: Role; member_type: MemberType; faculty: string | null; restricted_until: string | null; sanctions: number; reports: number; created_at: string };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ u?: string; q?: string }> }) {
  const session = await requireStaff("admin");
  const { t, locale } = await getT();
  const sp = await searchParams;
  const scope = await adminScope(session, sp.u);
  const supabase = await getServerSupabase();
  const { data } = await supabase.rpc("admin_list_users", { p_university: scope.id, p_search: sp.q?.slice(0, 60) || null });
  const users = (data ?? []) as Row[];
  const { data: escalations } = await supabase.from("user_sanctions").select("user_id").eq("university_id", scope.id).eq("kind", "escalation");
  const escalated = new Set((escalations ?? []).map((e) => e.user_id));
  const global = isGlobalAdmin(session);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("admin.users")}</h1>
        {global && <ScopePicker current={scope.id} path="/admin/users" />}
      </div>
      <form method="get" className="flex gap-2">
        {sp.u && <input type="hidden" name="u" value={sp.u} />}
        <input name="q" defaultValue={sp.q} placeholder={t("admin.searchUsers")} className="input max-w-sm" />
        <button className="btn-ghost btn-sm" type="submit">{t("common.search")}</button>
      </form>
      <p className="text-xs text-slate-400">{t("admin.graduatedHelp")}</p>
      <ul className="space-y-2">
        {users.map((u) => {
          const restricted = Boolean(u.restricted_until && new Date(u.restricted_until) > new Date());
          const self = u.id === session.userId;
          const peerAdmin = !global && (u.role === "university_admin" || u.role === "global_admin");
          const assignable: Role[] = self || peerAdmin ? [] : global ? ["user", "security", "university_admin", "global_admin"] : ["user", "security"];
          return (
            <li key={u.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{u.full_name}</p>
                <p className="text-xs text-slate-400">
                  {t(`roles.${u.role}`)} · {t(`memberType.${u.member_type}`)}{u.faculty ? ` · ${u.faculty}` : ""} · {t("profile.reports")}: {u.reports} · {t("admin.sanctions")}: {u.sanctions} · {formatDate(u.created_at, locale)}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {restricted && <span className="badge-amber">{t("admin.restrictedUntil", { date: formatDate(u.restricted_until!, locale) })}</span>}
                  {escalated.has(u.id) && <span className="badge-lost">{t("admin.escalations")}</span>}
                </div>
              </div>
              {!self && !peerAdmin && <UserAdminRow userId={u.id} role={u.role} restricted={restricted} assignableRoles={assignable} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
