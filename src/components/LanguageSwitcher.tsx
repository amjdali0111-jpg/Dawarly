"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/actions/auth";
import { useI18n } from "@/i18n/client";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      className="btn-ghost btn-sm"
      disabled={pending}
      aria-label={t("common.language")}
      onClick={() => start(async () => { await setLocale(next); router.refresh(); })}
    >
      <Languages className="h-4 w-4" aria-hidden />
      {!compact && <span>{t("common.switchLanguage")}</span>}
      {compact && <span className="uppercase">{next}</span>}
    </button>
  );
}
