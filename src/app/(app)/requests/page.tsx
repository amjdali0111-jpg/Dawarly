import Link from "next/link";
import { requireSession, isSecurityStaff } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { formatDate, profileNames } from "@/lib/data";
import type { RecoveryRequest, ReportType } from "@/lib/types";
import { RequestStatusBadge, SensitiveBadge, TypeBadge } from "@/components/Badges";
import { RequestActions } from "@/components/requests/RequestActions";

export const metadata = { title: "Requests" };

const COLS = "id, university_id, report_id, requester_id, match_id, item_owner_id, finder_id, message, verification_answer, status, is_sensitive, handover_method, handover_details, owner_confirmed_at, finder_confirmed_at, security_confirmed_at, completed_at, created_at";

type Row = RecoveryRequest & { reports: { id: string; item_name: string; type: ReportType; owner_id: string } | null };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession("/requests");
  const { t, locale } = await getT();
  const supabase = await getServerSupabase();
  const staff = isSecurityStaff(session);
  const tab = (await searchParams).tab === "outgoing" ? "outgoing" : (await searchParams).tab === "security" && staff ? "security" : "incoming";

  let query = supabase.from("recovery_requests").select(`${COLS}, reports!inner(id, item_name, type, owner_id)`).order("created_at", { ascending: false }).limit(100);
  if (tab === "outgoing") query = query.eq("requester_id", session.userId);
  else if (tab === "incoming") query = query.eq("reports.owner_id", session.userId);
  else query = query.eq("university_id", session.university.id).or("is_sensitive.eq.true,handover_method.eq.security");
  const { data } = await query;
  const rows = (data ?? []) as unknown as Row[];

  const [names, { data: ratings }] = await Promise.all([
    profileNames(supabase, rows.flatMap((r) => [r.requester_id, r.reports?.owner_id ?? ""])),
    rows.length ? supabase.from("ratings").select("recovery_request_id").in("recovery_request_id", rows.map((r) => r.id)) : Promise.resolve({ data: [] }),
  ]);
  const rated = new Set((ratings ?? []).map((r) => r.recovery_request_id));
  const nameOf = (id: string) => (names.get(id)?.deleted ? t("common.deletedUser") : names.get(id)?.full_name ?? "—");

  const tabs = [
    { key: "incoming", label: t("requests.incoming") },
    { key: "outgoing", label: t("requests.outgoing") },
    ...(staff ? [{ key: "security", label: t("requests.security") }] : []),
  ];

  return (
    <div className="space-y-5">
      <h1 className="page-title">{t("requests.title")}</h1>
      <nav className="flex gap-1 rounded-xl bg-night-800 p-1" aria-label={t("requests.title")}>
        {tabs.map((x) => (
          <Link key={x.key} href={`/requests?tab=${x.key}`} aria-current={tab === x.key ? "page" : undefined}
            className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold ${tab === x.key ? "bg-teal-400 text-night-950" : "text-slate-300"}`}>
            {x.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="card text-center text-slate-400">{t("requests.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const me = session.userId;
            const isReportOwner = r.reports?.owner_id === me;
            const isRequester = r.requester_id === me;
            const isParty = me === r.item_owner_id || me === r.finder_id;
            const securityHere = staff && (r.is_sensitive || r.handover_method === "security") && !isParty;
            const myConfirmation = me === r.item_owner_id ? r.owner_confirmed_at : me === r.finder_id ? r.finder_confirmed_at : r.security_confirmed_at;
            return (
              <li key={r.id} className="card space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {r.reports && <TypeBadge type={r.reports.type} />}
                  <RequestStatusBadge status={r.status} />
                  {r.is_sensitive && <SensitiveBadge />}
                  <span className="ms-auto text-xs text-slate-500">{formatDate(r.created_at, locale, true)}</span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">{t("requests.about")}</p>
                  <Link href={`/reports/${r.report_id}`} className="font-semibold text-white hover:text-teal-200">{r.reports?.item_name}</Link>
                </div>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-slate-400">{t("requests.itemOwner")}</dt><dd>{nameOf(r.item_owner_id)}</dd></div>
                  <div><dt className="text-xs text-slate-400">{t("requests.finder")}</dt><dd>{nameOf(r.finder_id)}</dd></div>
                  {r.message && <div className="sm:col-span-2"><dt className="text-xs text-slate-400">{t("requests.message")}</dt><dd className="whitespace-pre-line">{r.message}</dd></div>}
                  {r.verification_answer && (isReportOwner || securityHere || isRequester) && (
                    <div className="sm:col-span-2"><dt className="text-xs text-amber-300">{t("requests.proof")}</dt><dd className="whitespace-pre-line">{r.verification_answer}</dd></div>
                  )}
                  {r.handover_method && <div><dt className="text-xs text-slate-400">{t("requests.method")}</dt><dd>{r.handover_method === "security" ? t("requests.methodSecurity") : t("requests.methodDirect")}</dd></div>}
                  {r.handover_details && <div><dt className="text-xs text-slate-400">{t("requests.handoverDetails")}</dt><dd>{r.handover_details}</dd></div>}
                </dl>
                {(r.status === "accepted" || r.status === "completed") && (
                  <ul className="flex flex-wrap gap-2 text-xs">
                    <li className={r.owner_confirmed_at ? "badge bg-teal-400/15 text-teal-200" : "badge-muted"}>{r.owner_confirmed_at ? "✓ " : "○ "}{t("requests.ownerConfirmed")}</li>
                    <li className={r.finder_confirmed_at ? "badge bg-teal-400/15 text-teal-200" : "badge-muted"}>{r.finder_confirmed_at ? "✓ " : "○ "}{t("requests.finderConfirmed")}</li>
                    {r.handover_method === "security" && (
                      <li className={r.security_confirmed_at ? "badge bg-teal-400/15 text-teal-200" : "badge-muted"}>{r.security_confirmed_at ? "✓ " : "○ "}{t("requests.securityConfirmed")}</li>
                    )}
                  </ul>
                )}
                {r.completed_at && <p className="text-xs text-emerald-300">{t("requests.completedOn", { date: formatDate(r.completed_at, locale) })}</p>}
                {r.status === "completed" && me === r.item_owner_id && rated.has(r.id) && <p className="text-xs text-slate-400">{t("requests.alreadyRated")}</p>}
                <RequestActions
                  requestId={r.id}
                  canRespond={isReportOwner && r.status === "pending" && !r.is_sensitive}
                  canRejectOnly={isReportOwner && r.status === "security_review"}
                  canSecurityReview={securityHere && r.status === "security_review"}
                  canWithdraw={isRequester && ["pending", "security_review", "accepted"].includes(r.status)}
                  canConfirm={r.status === "accepted" && (isParty || (securityHere && r.handover_method === "security"))}
                  alreadyConfirmed={Boolean(myConfirmation)}
                  canFailOrDispute={isParty && r.status === "accepted"}
                  canDispute={isParty && ["accepted", "completed", "failed"].includes(r.status)}
                  canRate={r.status === "completed" && me === r.item_owner_id && !rated.has(r.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
