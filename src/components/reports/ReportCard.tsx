import Link from "next/link";
import { CalendarDays, ImageOff, MapPin } from "lucide-react";
import { SensitiveBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import type { Report } from "@/lib/types";

export function ReportCard({ report, image, categoryName, dateLabel, showStatus = false, footer }: {
  report: Report; image?: string; categoryName: string; dateLabel: string; showStatus?: boolean; footer?: React.ReactNode;
}) {
  return (
    <article className="card flex gap-3 p-3 transition hover:border-teal-400/30">
      <Link href={`/reports/${report.id}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-night-900 sm:h-24 sm:w-24">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-600"><ImageOff className="h-6 w-6" aria-hidden /></span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <TypeBadge type={report.type} />
          {report.is_sensitive && <SensitiveBadge />}
          {(showStatus || report.status !== "active") && <StatusBadge status={report.status} />}
        </div>
        <Link href={`/reports/${report.id}`} className="mt-1 block truncate font-semibold text-white hover:text-teal-200">{report.item_name}</Link>
        <p className="truncate text-xs text-slate-400">{categoryName} · {report.color}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden /><span className="max-w-[12rem] truncate">{report.location_text}</span></span>
          <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{dateLabel}</span>
        </div>
        {footer}
      </div>
    </article>
  );
}
