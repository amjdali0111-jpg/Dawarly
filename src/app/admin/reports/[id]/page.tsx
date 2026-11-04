import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate, profileNames, signedUrls } from "@/lib/data";
import { REPORT_COLUMNS, type Report } from "@/lib/types";
import { RequestStatusBadge, SensitiveBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import { AdminReportActions } from "@/components/admin/AdminReportActions";
import type { TKey } from "@/i18n/translate";

export default async function AdminReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff("admin");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  // RLS: university admins see their own university's reports only.
  const { data: report } = await supabase.from("reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle<Report>();
  if (!report) notFound();
  const [{ data: priv }, { data: images }, { data: flags }, { data: requests }, { data: audit }] = await Promise.all([
    supabase.from("report_private").select("exact_lat, exact_lng, verification_notes").eq("report_id", id).maybeSingle(),
    supabase.from("report_images").select("storage_path, ai_analysis").eq("report_id", id).order("position"),
    supabase.from("moderation_flags").select("id, source, reasons, created_at, resolved_at, resolution, resolved_by").eq("report_id", id).order("created_at", { ascending: false }),
    supabase.from("recovery_requests").select("id, status, requester_id, created_at").eq("report_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_events").select("id, action, actor_id, created_at").eq("target_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  const urls = await signedUrls(supabase, "report-images", (images ?? []).map((i) => i.storage_path));
  const people = await profileNames(supabase, [report.owner_id, ...(requests ?? []).map((r) => r.requester_id), ...(flags ?? []).map((f) => f.resolved_by ?? ""), ...(audit ?? []).map((a) => a.actor_id ?? "")]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <article className="card space-y-3">
        <div className="flex flex-wrap gap-1.5"><TypeBadge type={report.type} /><StatusBadge status={report.status} />{report.is_sensitive && <SensitiveBadge />}</div>
        <h1 className="text-2xl font-bold text-white">{report.item_name}</h1>
        <p className="text-sm text-slate-400">{people.get(report.owner_id)?.full_name} · {formatDate(report.created_at, locale, true)} · <Link href={`/reports/${id}`} className="link">{t("common.view")}</Link></p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {(images ?? []).map((i) => urls.get(i.storage_path) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i.storage_path} src={urls.get(i.storage_path)} alt="" className="aspect-square rounded-lg object-cover" />
          ))}
        </div>
        <p className="whitespace-pre-line text-slate-200">{report.description}</p>
        <p className="text-sm"><span className="text-slate-400">{t("reports.features")}:</span> {report.distinguishing_features}</p>
        <p className="text-sm"><span className="text-slate-400">{t("reports.location")}:</span> {report.location_text}</p>
        {priv && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm">
            <p className="font-semibold text-amber-200">{t("reports.privateDetails")}</p>
            {priv.verification_notes && <p>{priv.verification_notes}</p>}
            {priv.exact_lat != null && <p className="text-xs text-slate-400">{priv.exact_lat}, {priv.exact_lng}</p>}
          </div>
        )}
        <section>
          <h2 className="mb-2 font-semibold">{t("admin.reasons")}</h2>
          <ul className="space-y-1 text-sm">
            {(flags ?? []).map((f) => (
              <li key={f.id} className="rounded-lg bg-night-900 p-2">
                <span className="badge-muted me-1">{f.source}</span>
                {(f.reasons as string[]).map((r) => t(`admin.flagReasons.${r}` as TKey)).join(" · ")}
                <span className="block text-xs text-slate-500">{formatDate(f.created_at, locale, true)}{f.resolved_at ? ` → ${f.resolution} (${people.get(f.resolved_by ?? "")?.full_name ?? ""})` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </article>
      <aside className="space-y-4">
        <div className="card"><AdminReportActions reportId={report.id} status={report.status} /></div>
        <div className="card space-y-2 text-sm">
          <h2 className="font-semibold">{t("reports.requestsOnThis")}</h2>
          {(requests ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2"><span>{people.get(r.requester_id)?.full_name}</span><RequestStatusBadge status={r.status} /></div>
          ))}
        </div>
        <div className="card space-y-1 text-xs">
          <h2 className="mb-1 text-sm font-semibold">{t("admin.audit")}</h2>
          {(audit ?? []).map((a) => <p key={a.id} className="text-slate-400">{formatDate(a.created_at, locale, true)} · {a.action} · {people.get(a.actor_id ?? "")?.full_name ?? "system"}</p>)}
        </div>
      </aside>
    </div>
  );
}
