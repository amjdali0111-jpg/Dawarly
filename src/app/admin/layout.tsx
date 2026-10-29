import Link from "next/link";
import { requireStaff, isGlobalAdmin, isUniversityAdmin } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";

// Server-side gate: security staff and administrators only. Pages that need
// admin rights re-check with requireStaff("admin"), and the database
// re-authorizes every query and action.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff("security");
  const { t } = await getT();
  const admin = isUniversityAdmin(session);
  const links = [
    { href: "/admin", label: t("admin.dashboard"), show: true },
    { href: "/admin/reports", label: t("admin.reviewQueue"), show: admin },
    { href: "/admin/security", label: t("admin.security"), show: true },
    { href: "/admin/abuse", label: t("admin.abuse"), show: admin },
    { href: "/admin/disputes", label: t("admin.disputes"), show: admin },
    { href: "/admin/users", label: t("admin.users"), show: admin },
    { href: "/admin/categories", label: t("admin.categories"), show: admin },
    { href: "/admin/analytics", label: t("admin.analytics"), show: admin },
    { href: "/admin/audit", label: t("admin.audit"), show: admin },
    { href: "/admin/universities", label: t("admin.universities"), show: isGlobalAdmin(session) },
  ].filter((l) => l.show);
  return (
    <AppShell session={session}>
      <div className="space-y-4">
        <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label={t("admin.title")}>
          {links.map((l) => <Link key={l.href} href={l.href} className="btn-ghost btn-sm shrink-0">{l.label}</Link>)}
        </nav>
        {children}
      </div>
    </AppShell>
  );
}
