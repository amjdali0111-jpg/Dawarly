"use client";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { saveCategory } from "@/app/actions/admin";
import { useI18n } from "@/i18n/client";
import type { Category } from "@/lib/types";

export function CategoryForm({ category, universityId, allowGlobal }: { category?: Category; universityId: string; allowGlobal: boolean }) {
  const { t } = useI18n();
  return (
    <ActionForm action={saveCategory} className="grid gap-2 sm:grid-cols-6" resetOnSuccess={!category}>
      {category && <input type="hidden" name="id" value={category.id} />}
      <input type="hidden" name="university_id" value={universityId} />
      {!category && <input name="slug" required pattern="[a-z0-9-]{2,60}" placeholder={t("admin.slug")} className="input sm:col-span-2" dir="ltr" />}
      <input name="name_en" required defaultValue={category?.name_en} placeholder={t("admin.nameEn")} className="input" dir="ltr" />
      <input name="name_ar" required defaultValue={category?.name_ar} placeholder={t("admin.nameAr")} className="input" dir="rtl" />
      <input name="sort_order" type="number" defaultValue={category?.sort_order ?? 100} className="input" aria-label="sort" />
      <div className="flex flex-wrap items-center gap-3 text-xs sm:col-span-6">
        <label className="flex items-center gap-1"><input type="checkbox" name="is_sensitive" defaultChecked={category?.is_sensitive} className="accent-amber-400" />{t("admin.sensitive")}</label>
        <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={category?.is_active ?? true} className="accent-teal-400" />{t("admin.active")}</label>
        {!category && allowGlobal && <label className="flex items-center gap-1"><input type="checkbox" name="scope" value="global" />{t("admin.platformDefault")}</label>}
        <SubmitButton className="btn-primary btn-sm">{category ? t("common.save") : t("admin.addCategory")}</SubmitButton>
      </div>
    </ActionForm>
  );
}
