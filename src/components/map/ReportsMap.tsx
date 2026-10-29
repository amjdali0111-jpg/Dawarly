"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useI18n } from "@/i18n/client";
import type { LatLng, MapPoint } from "./LeafletMap";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[480px] animate-pulse rounded-2xl bg-night-900" />,
});

export function ReportsMap({ points, center }: { points: MapPoint[]; center: LatLng }) {
  const { t } = useI18n();
  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <p className="alert-warn">{t("map.unavailable")}</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10">
      <LeafletMap center={center} zoom={15} points={points} height={480} onUnavailable={() => setUnavailable(true)} />
    </div>
  );
}
