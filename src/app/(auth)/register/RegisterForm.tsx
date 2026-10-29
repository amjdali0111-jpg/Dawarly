"use client";
import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { register } from "@/app/actions/auth";
import { useI18n } from "@/i18n/client";
import type { University } from "@/lib/types";

export function RegisterForm({ universities }: { universities: Pick<University, "id" | "name_en" | "name_ar">[] }) {
  const { t, locale } = useI18n();
  const [memberType, setMemberType] = useState<"student" | "employee" | "faculty">("student");
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="text-center" role="status">
        <MailCheck className="mx-auto mb-3 h-12 w-12 text-teal-300" aria-hidden />
        <h2 className="text-xl font-bold text-white">{t("auth.checkEmailTitle")}</h2>
        <p className="mt-2 text-slate-300">{done}</p>
        <Link href="/login" className="btn-primary mt-6">{t("auth.loginButton")}</Link>
      </div>
    );
  }

  return (
    <ActionForm action={register} className="space-y-4" refreshOnSuccess={false} hideMessageOnSuccess onSuccess={(r) => r.ok && setDone(r.message ?? "")}>
      <fieldset>
        <legend className="label">{t("auth.memberType")}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-night-900 p-1">
          {(["student", "employee", "faculty"] as const).map((m) => (
            <label key={m} className={`cursor-pointer rounded-lg px-2 py-2 text-center text-sm font-semibold ${memberType === m ? "bg-teal-400 text-night-950" : "text-slate-300"}`}>
              <input type="radio" name="member_type" value={m} checked={memberType === m} onChange={() => setMemberType(m)} className="sr-only" />
              {t(`auth.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="label" htmlFor="full_name">{t("auth.fullName")}</label>
        <input id="full_name" name="full_name" required minLength={2} maxLength={120} autoComplete="name" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="email">{t("auth.email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="university_id">{t("auth.university")}</label>
        <select id="university_id" name="university_id" required defaultValue="" className="input">
          <option value="" disabled>{t("auth.selectUniversity")}</option>
          {universities.map((u) => <option key={u.id} value={u.id}>{locale === "ar" ? u.name_ar : u.name_en}</option>)}
        </select>
        {universities.length === 0 && <p className="mt-1 text-xs text-amber-200">{t("auth.noUniversities")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="faculty">{t("auth.college")} <span className="text-xs text-slate-500">({t("common.optional")})</span></label>
          <input id="faculty" name="faculty" maxLength={120} className="input" />
        </div>
        {memberType === "student" && (
          <div>
            <label className="label" htmlFor="academic_year">{t("auth.academicYear")} <span className="text-xs text-slate-500">({t("common.optional")})</span></label>
            <input id="academic_year" name="academic_year" type="number" min={1} max={10} className="input" />
          </div>
        )}
      </div>
      <div>
        <label className="label" htmlFor="password">{t("auth.password")}</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" aria-describedby="pw-hint" />
        <p id="pw-hint" className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm_password">{t("auth.confirmPassword")}</label>
        <input id="confirm_password" name="confirm_password" type="password" required autoComplete="new-password" className="input" />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" name="terms" required className="mt-1 accent-teal-400" />
        {t("auth.agreeTerms")}
      </label>
      <SubmitButton className="btn-primary w-full" pendingText={t("common.loading")}>{t("auth.registerButton")}</SubmitButton>
    </ActionForm>
  );
}
