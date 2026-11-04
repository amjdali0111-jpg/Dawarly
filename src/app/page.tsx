import Image from "next/image";
import Link from "next/link";
import { Building2, CalendarPlus, CheckCircle2, FileSearch, Handshake, MessagesSquare, Search, ShieldCheck, Sparkles, Users } from "lucide-react";
import { getT } from "@/i18n/server";
import { getSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// The public landing page. It intentionally contains NO report feed
// ("latest/recent reports"): report data is only available after sign-in.
async function getPublicStats(): Promise<{ universities: number; reports: number; recovered: number } | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc("public_stats");
    return error ? null : (data as { universities: number; reports: number; recovered: number });
  } catch {
    return null;
  }
}

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { t } = await getT();
  const { deleted } = await searchParams;
  const [session, stats] = await Promise.all([getSession(), getPublicStats()]);
  const startHref = (type: "lost" | "found") => `/reports/new?type=${type}`;

  return (
    <div className="min-h-dvh">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo name={publicEnv.appName} />
          <nav className="hidden items-center gap-6 text-sm text-slate-200 md:flex" aria-label={t("common.menu")}>
            <a href="#how" className="hover:text-teal-300">{t("nav.howItWorks")}</a>
            <a href="#privacy" className="hover:text-teal-300">{t("nav.about")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitcher compact />
            {session ? (
              <Link href="/reports" className="btn-primary btn-sm">{t("nav.reports")}</Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost btn-sm">{t("nav.login")}</Link>
                <Link href="/register" className="btn-primary btn-sm hidden sm:inline-flex">{t("nav.register")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {deleted && <p className="alert-info absolute inset-x-4 top-20 z-30 mx-auto max-w-md text-center">{t("settings.deleted")}</p>}
      {/* Hero — "Campus After Dark" */}
      <section className="relative isolate overflow-hidden pb-14 pt-24 sm:pt-28" data-testid="hero">
        <Image src="/images/campus-night.svg" alt="" fill priority className="-z-10 object-cover" unoptimized />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-night-950/30 via-night-950/40 to-night-900" />
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <Image
              src="/images/hero-characters.webp"
              alt=""
              width={566}
              height={480}
              priority
              className="mx-auto w-full max-w-md drop-shadow-2xl"
            />
          </div>
          <div className="order-1 text-center lg:order-2 lg:text-start">
            <h1 className="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
              {t("landing.heroTitle")}
              <span className="mt-2 block text-teal-300">{t("landing.heroHighlight")}</span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-slate-200 lg:mx-0">{t("landing.heroSubtitle")}</p>

            <form action="/reports" method="get" role="search" className="mx-auto mt-6 flex max-w-xl overflow-hidden rounded-xl bg-white shadow-xl lg:mx-0">
              <label htmlFor="hero-search" className="sr-only">{t("common.search")}</label>
              <input id="hero-search" name="q" placeholder={t("landing.searchPlaceholder")} className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-night-900 placeholder:text-slate-500 focus:outline-none" />
              <button type="submit" className="bg-teal-400 px-4 text-night-950" aria-label={t("common.search")}>
                <Search className="h-5 w-5" aria-hidden />
              </button>
            </form>

            <div className="mx-auto mt-5 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2 lg:mx-0">
              <Link href={startHref("found")} className="btn-amber py-3.5 text-base">
                <CalendarPlus className="h-5 w-5" aria-hidden />
                {t("landing.reportFound")}
              </Link>
              <Link href={startHref("lost")} className="btn-primary py-3.5 text-base">
                <FileSearch className="h-5 w-5" aria-hidden />
                {t("landing.reportLost")}
              </Link>
            </div>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-4xl px-4">
          <ul className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-night-900/80 p-4 text-center text-sm backdrop-blur sm:grid-cols-4">
            {[
              { icon: Building2, label: t("landing.featureUniversities") },
              { icon: Users, label: t("landing.featureCommunity") },
              { icon: Sparkles, label: t("landing.featureAi") },
              { icon: ShieldCheck, label: t("landing.featureSafe") },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex flex-col items-center gap-2 text-slate-200">
                <Icon className="h-6 w-6 text-teal-300" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {stats && (
        <section className="mx-auto max-w-4xl px-4" aria-label="stats">
          <dl className="grid grid-cols-3 gap-3 text-center">
            {[
              [stats.universities, t("landing.statsUniversities")],
              [stats.reports, t("landing.statsReports")],
              [stats.recovered, t("landing.statsRecovered")],
            ].map(([n, label]) => (
              <div key={String(label)} className="card">
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="text-2xl font-bold text-teal-300">{Number(n).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="mb-8 text-center text-2xl font-bold text-white sm:text-3xl">{t("landing.howTitle")}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: CalendarPlus, title: t("landing.step1Title"), body: t("landing.step1Body") },
            { icon: Sparkles, title: t("landing.step2Title"), body: t("landing.step2Body") },
            { icon: MessagesSquare, title: t("landing.step3Title"), body: t("landing.step3Body") },
            { icon: Handshake, title: t("landing.step4Title"), body: t("landing.step4Body") },
          ].map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="card">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300"><Icon className="h-5 w-5" aria-hidden /></span>
                <span className="text-sm text-slate-400">{i + 1}</span>
              </div>
              <h3 className="font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm text-slate-300">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="privacy" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card">
            <ShieldCheck className="mb-3 h-7 w-7 text-teal-300" aria-hidden />
            <h2 className="text-xl font-bold text-white">{t("landing.privacyTitle")}</h2>
            <p className="mt-2 text-slate-300">{t("landing.privacyBody")}</p>
          </div>
          <div className="card flex flex-col justify-between">
            <div>
              <CheckCircle2 className="mb-3 h-7 w-7 text-amber-300" aria-hidden />
              <h2 className="text-xl font-bold text-white">{t("landing.ctaTitle")}</h2>
              <p className="mt-2 text-slate-300">{t("landing.ctaBody")}</p>
            </div>
            <div className="mt-4 flex gap-3">
              <Link href={session ? "/reports" : "/register"} className="btn-primary">{session ? t("nav.reports") : t("nav.register")}</Link>
              {!session && <Link href="/login" className="btn-ghost">{t("nav.login")}</Link>}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-slate-500">{t("landing.footer")}</footer>
    </div>
  );
}
