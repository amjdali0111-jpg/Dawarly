"use client";
import { useI18n } from "@/i18n/client";

// Generic error boundary: never renders error details (they may contain private data).
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-slate-200">{t("common.genericError")}</p>
      <button className="btn-primary" onClick={reset}>↻</button>
    </div>
  );
}
