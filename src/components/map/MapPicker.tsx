"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Crosshair, X } from "lucide-react";
import { useI18n } from "@/i18n/client";
import type { LatLng } from "./LeafletMap";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div className="h-[260px] animate-pulse rounded-2xl bg-night-900" />,
});

/** Optional map pin. Manual text entry always remains available. */
export function MapPicker({ value, onChange, center }: { value: LatLng | null; onChange: (v: LatLng | null) => void; center: LatLng }) {
  const { t } = useI18n();
  const [unavailable, setUnavailable] = useState(false);
  return (
    <div className="space-y-2">
      {unavailable ? (
        <p className="alert-warn">{t("reports.mapUnavailable")}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <LeafletMap center={value ?? center} value={value} onPick={onChange} height={260} onUnavailable={() => setUnavailable(true)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => navigator.geolocation?.getCurrentPosition((pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }), () => undefined, { timeout: 8000 })}
        >
          <Crosshair className="h-4 w-4" aria-hidden />
          {t("reports.useMyLocation")}
        </button>
        {value && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange(null)}>
            <X className="h-4 w-4" aria-hidden />
            {t("reports.clearPin")}
          </button>
        )}
      </div>
    </div>
  );
}
