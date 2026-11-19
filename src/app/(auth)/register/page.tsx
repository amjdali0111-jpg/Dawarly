import Link from "next/link";
import type { Metadata } from "next";
import { getT } from "@/i18n/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = {
  title: "Register",
};

export default async function RegisterPage() {
  const { t } = await getT();

  let universities: {
    id: string;
    name_en: string;
    name_ar: string;
  }[] = [];

  if (isSupabaseConfigured()) {
    try {
      const supabase = await getServerSupabase();

      const { data, error } = await supabase
        .from("universities")
        .select("id, name_en, name_ar")
        .eq("is_active", true)
        .order("name_en");

      if (error) {
        // Typically 42501 when the anon role lacks EXECUTE on the RLS helpers
        // (see migration 20261030000008_allow_anon_university_listing.sql).
        console.error("[RegisterPage] Universities query failed:", { code: error.code, message: error.message });
      } else {
        universities = data ?? [];
        if (universities.length === 0) console.warn("[RegisterPage] No active universities found");
      }
    } catch (error) {
      console.error("[RegisterPage] Unexpected error:", error);
    }
  } else {
    console.error("[RegisterPage] Supabase is not configured");
  }

  return (
    <div className="card p-6">
      <h1 className="text-center text-2xl font-bold text-white">
        {t("auth.registerTitle")}
      </h1>

      <p className="mb-6 mt-1 text-center muted">
        {t("auth.registerSubtitle")}
      </p>

      {!isSupabaseConfigured() && (
        <p className="alert-warn mb-4">
          {t("common.notConfigured")}
        </p>
      )}

      <RegisterForm universities={universities} />

      <p className="mt-6 text-center text-sm text-slate-300">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="link">
          {t("auth.loginButton")}
        </Link>
      </p>
    </div>
  );
}