"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { saveUniversity } from "@/app/actions/admin";
import { useI18n } from "@/i18n/client";
import type { University } from "@/lib/types";

export function UniversityForm({ university }: { university?: University }) {
  const { t } = useI18n();
  return (
    <ActionForm action={saveUniversity} className="grid gap-2 sm:grid-cols-6" resetOnSuccess={!university}>
      {university && <input type="hidden" name="id" value={university.id} />}
      {!university && <input name="slug" required pattern="[a-z0-9-]{2,60}" placeholder={t("admin.slug")} className="input" dir="ltr" />}
      <input name="name_en" required minLength={2} defaultValue={university?.name_en} placeholder={t("admin.nameEn")} className="input sm:col-span-2" dir="ltr" />
      <input name="name_ar" required minLength={2} defaultValue={university?.name_ar} placeholder={t("admin.nameAr")} className="input sm:col-span-2" dir="rtl" />
      <input name="center_lat" type="number" step="any" defaultValue={university?.center_lat ?? ""} placeholder={t("admin.centerLat")} className="input" />
      <input name="center_lng" type="number" step="any" defaultValue={university?.center_lng ?? ""} placeholder={t("admin.centerLng")} className="input" />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={university?.is_active ?? true} className="accent-teal-400" />{t("admin.active")}</label>
      <SubmitButton className="btn-primary btn-sm">{university ? t("common.save") : t("admin.addUniversity")}</SubmitButton>
    </ActionForm>
  );
}
