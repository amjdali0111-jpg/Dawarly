"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";

// Generic error boundary: never renders error details (they may contain private data).
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  useEffect(() => {
    // The digest matches the server log entry; the message itself is not shown.
    console.error("[app] render error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-slate-200">{t("common.genericError")}</p>
      <button
        className="btn-primary"
        disabled={pending}
        aria-label={t("common.genericError")}
        // reset() alone re-renders the same failed server output: refresh first
        // so server components are fetched again.
        onClick={() => start(() => { router.refresh(); reset(); })}
      >
        ↻
      </button>
    </div>
  );
}
