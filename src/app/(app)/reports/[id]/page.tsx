import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Clock, Lock, MapPin, MessageCircle, Shield, Tag } from "lucide-react";
import { requireSession, isSecurityStaff, isUniversityAdmin } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { categoryLabel, formatDate, profileNames, signedUrls } from "@/lib/data";
import { REPORT_COLUMNS, type Report } from "@/lib/types";
import { SensitiveBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import { Avatar } from "@/components/Avatar";
import { RequestForm } from "@/components/reports/RequestForm";
import { OwnerActions } from "@/components/reports/OwnerActions";
import { AbuseReportButton } from "@/components/AbuseReportButton";
import { startConversation } from "@/app/actions/reports";
import { SecurityConversations } from "@/components/chat/SecurityConversations";
import type { TKey } from "@/i18n/translate";

export default async function ReportDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string; held?: string; updated?: string; error?: string; match?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/reports/${id}`);
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();

  // RLS decides visibility: other universities and hidden reports return nothing.
  const { data: report } = await supabase.from("reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle<Report>();
  if (!report) notFound();

  const isOwner = report.owner_id === session.userId;
  const staff = isSecurityStaff(session);
  const [{ data: category }, { data: images }, { data: priv }, owners, { data: myRequests }, { count: requestCount }] = await Promise.all([
    supabase.from("categories").select("name_en, name_ar").eq("id", report.category_id).maybeSingle(),
    supabase.from("report_images").select("storage_path, position").eq("report_id", id).order("position"),
    supabase.from("report_private").select("exact_lat, exact_lng, verification_notes").eq("report_id", id).maybeSingle(),
    profileNames(supabase, [report.owner_id]),
    supabase.from("recovery_requests").select("id, status").eq("report_id", id).eq("requester_id", session.userId)
      .in("status", ["pending", "security_review", "accepted", "disputed"]),
    isOwner || staff
      ? supabase.from("recovery_requests").select("id", { count: "exact", head: true }).eq("report_id", id)
      : Promise.resolve({ count: 0 }),
  ]);
  const urls = await signedUrls(supabase, "report-images", (images ?? []).map((i) => i.storage_path));
  const { data: securityConvs } = staff && !isOwner
    ? await supabase.rpc("security_case_conversations", { p_report: id })
    : { data: null };
  const photos = (images ?? []).map((i) => urls.get(i.storage_path)).filter(Boolean) as string[];
  const owner = owners.get(report.owner_id);
  const banner =
    report.status === "under_review" ? t("reports.underReviewBanner")
      : report.status === "expired" ? t("reports.expiredBanner")
      : report.status === "recovered" ? t("reports.recoveredBanner")
      : report.status === "closed" ? t("reports.closedBanner")
      : report.status === "removed" ? t("reports.removedBanner") : null;
  const errorText = sp.error ? t(`errors.${sp.error}` as TKey) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {sp.created && <p className="alert-info">{t("reports.created")}</p>}
      {sp.held && <p className="alert-warn">{t("reports.createdHeld")}</p>}
      {sp.updated && <p className="alert-info">{t("reports.updated")}</p>}
      {errorText && !errorText.startsWith("errors.") && <p className="alert-error">{errorText}</p>}
      {banner && <p className={report.status === "recovered" ? "alert-info" : "alert-warn"}>{banner}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <article className="card space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={report.type} />
            <StatusBadge status={report.status} />
            {report.is_sensitive && <SensitiveBadge />}
          </div>
          <h1 className="text-2xl font-bold text-white">{report.item_name}</h1>

          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photos.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className={`overflow-hidden rounded-xl bg-night-900 ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`${report.item_name} ${i + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-night-900 p-6 text-center text-sm text-slate-400">
              {report.is_sensitive ? t("reports.sensitivePhotosHidden") : t("reports.noPhotos")}
            </p>
          )}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2"><Tag className="h-4 w-4 text-teal-300" aria-hidden /><dt className="text-slate-400">{t("reports.category")}:</dt><dd>{categoryLabel(category, locale)}</dd></div>
            <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-full border border-white/30" aria-hidden /><dt className="text-slate-400">{t("reports.color")}:</dt><dd>{report.color}</dd></div>
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-teal-300" aria-hidden /><dt className="text-slate-400">{t("reports.eventDate")}:</dt><dd>{formatDate(report.event_date, locale)}{report.event_time ? ` · ${report.event_time.slice(0, 5)}` : ""}</dd></div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-teal-300" aria-hidden /><dt className="text-slate-400">{t("reports.location")}:</dt><dd>{report.location_text}</dd></div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-teal-300" aria-hidden /><dt className="text-slate-400">{t("reports.expiresOn")}:</dt><dd>{formatDate(report.expires_at, locale)}</dd></div>
          </dl>
          <section>
            <h2 className="mb-1 font-semibold text-white">{t("reports.description")}</h2>
            <p className="whitespace-pre-line text-slate-200">{report.description}</p>
          </section>
          <section>
            <h2 className="mb-1 font-semibold text-white">{t("reports.features")}</h2>
            <p className="whitespace-pre-line text-slate-200">{report.distinguishing_features}</p>
          </section>
          {priv && (priv.verification_notes || priv.exact_lat != null) && (
            <section className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm">
              <h2 className="mb-1 flex items-center gap-1 font-semibold text-amber-200"><Lock className="h-4 w-4" aria-hidden />{t("reports.privateDetails")}</h2>
              {priv.verification_notes && <p className="text-slate-200">{priv.verification_notes}</p>}
              {priv.exact_lat != null && <p className="text-xs text-slate-400">{t("reports.exactLocation")}: {priv.exact_lat.toFixed(5)}, {priv.exact_lng?.toFixed(5)}</p>}
            </section>
          )}
          {!isOwner && <AbuseReportButton targetType="report" targetId={report.id} />}
        </article>

        <aside className="space-y-4">
          <div className="card flex items-center gap-3">
            <Avatar name={owner?.full_name ?? "?"} path={owner?.avatar_path ?? null} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400">{t("reports.reportedBy")}</p>
              {owner?.deleted ? (
                <p className="font-semibold">{t("common.deletedUser")}</p>
              ) : (
                <Link href={`/users/${report.owner_id}`} className="font-semibold hover:text-teal-200">{owner?.full_name}</Link>
              )}
              <p className="text-xs text-slate-500">{t("reports.postedOn")} {formatDate(report.created_at, locale)}</p>
            </div>
          </div>

          {isOwner ? (
            <div className="card space-y-3">
              <OwnerActions reportId={report.id} status={report.status} canRenew={report.status === "expired"} />
              <Link href="/requests" className="link block text-sm">{t("reports.requestsOnThis")}: {requestCount ?? 0}</Link>
            </div>
          ) : (
            <>
              {["active", "expired", "recovered"].includes(report.status) && (
                <form action={startConversation} className="card">
                  <input type="hidden" name="report_id" value={report.id} />
                  <button className="btn-ghost w-full" type="submit"><MessageCircle className="h-4 w-4" aria-hidden />{t("reports.startChat")}</button>
                  <p className="mt-2 text-xs text-slate-500">{t("messages.privacy")}</p>
                </form>
              )}
              {report.status === "active" && (
                <div className="card">
                  {myRequests && myRequests.length > 0 ? (
                    <p className="text-sm text-teal-200">{t("reports.alreadyRequested")} <Link href="/requests" className="link">{t("nav.requests")}</Link></p>
                  ) : (
                    <RequestForm reportId={report.id} reportType={report.type} matchId={sp.match} />
                  )}
                </div>
              )}
            </>
          )}

          {staff && !isOwner && (
            <div className="card space-y-2 text-sm">
              {isUniversityAdmin(session) && <Link href={`/admin/reports/${report.id}`} className="btn-ghost btn-sm w-full"><Shield className="h-4 w-4" aria-hidden />{t("nav.admin")}</Link>}
              {(requestCount ?? 0) > 0 && <Link href="/requests?tab=security" className="link block">{t("reports.requestsOnThis")}: {requestCount}</Link>}
              <SecurityConversations items={(securityConvs ?? []) as Array<{ conversation_id: string; last_message_at: string; joined: boolean }>} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
