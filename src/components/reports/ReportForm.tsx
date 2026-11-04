"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { MAX_PHOTOS, reportSchema, validatePhotoFile } from "@/lib/validation";
import { useI18n } from "@/i18n/client";
import type { TKey } from "@/i18n/translate";
import type { Category, ReportType } from "@/lib/types";
import { createReport, updateReport } from "@/app/actions/reports";
import { MapPicker } from "@/components/map/MapPicker";
import type { LatLng } from "@/components/map/LeafletMap";

export interface ReportFormInitial {
  type: ReportType;
  item_name: string;
  description: string;
  category_id: string;
  color: string;
  distinguishing_features: string;
  location_text: string;
  lat: number | null;
  lng: number | null;
  event_date: string;
  event_time: string;
  verification_notes: string;
  photos: Array<{ path: string; url: string }>;
}

type Field = keyof Omit<ReportFormInitial, "photos" | "lat" | "lng"> | "image_paths" | "lat";

/**
 * One form for lost AND found reports (feature parity). Photos are resized in
 * the browser and uploaded straight to the private storage bucket under
 * {university}/{user}/; the server then verifies ownership of every path.
 */
export function ReportForm({
  mode, reportId, categories, universityId, userId, center, initial,
}: {
  mode: "create" | "edit";
  reportId?: string;
  categories: Category[];
  universityId: string;
  userId: string;
  center: LatLng;
  initial: ReportFormInitial;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ReportFormInitial>(k: K, val: ReportFormInitial[K]) => setV((p) => ({ ...p, [k]: val }));
  const err = (code?: string) => (code ? t(`errors.${code}` as TKey) : null);
  const pin = v.lat != null && v.lng != null ? { lat: v.lat, lng: v.lng } : null;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setFormError(null);
    const room = MAX_PHOTOS - v.photos.length;
    const chosen = Array.from(files).slice(0, room);
    for (const f of chosen) {
      const bad = validatePhotoFile(f);
      if (bad) return setErrors((e) => ({ ...e, image_paths: bad }));
    }
    setUploading(true);
    try {
      const supabase = getBrowserSupabase();
      const added: ReportFormInitial["photos"] = [];
      for (const f of chosen) {
        const blob = await compressImage(f);
        const path = `${universityId}/${userId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage.from("report-images").upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        added.push({ path, url: URL.createObjectURL(blob) });
      }
      setV((p) => ({ ...p, photos: [...p.photos, ...added] }));
      setErrors((e) => ({ ...e, image_paths: undefined }));
    } catch {
      setErrors((e) => ({ ...e, image_paths: "validation:image_missing" }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removePhoto(path: string) {
    setV((p) => ({ ...p, photos: p.photos.filter((x) => x.path !== path) }));
    // Newly uploaded (not yet saved) photos can be deleted right away.
    if (mode === "create") void getBrowserSupabase().storage.from("report-images").remove([path]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      type: v.type, item_name: v.item_name, description: v.description, category_id: v.category_id, color: v.color,
      distinguishing_features: v.distinguishing_features, location_text: v.location_text, lat: v.lat, lng: v.lng,
      event_date: v.event_date, event_time: v.event_time || null, verification_notes: v.verification_notes || null,
      image_paths: v.photos.map((p) => p.path),
    };
    const parsed = reportSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[(issue.path[0] as Field) ?? "item_name"] ??= issue.message;
      setErrors(next);
      setFormError(t("common.genericError"));
      return;
    }
    setErrors({});
    setFormError(null);
    start(async () => {
      const res = mode === "create" ? await createReport(JSON.stringify(parsed.data)) : await updateReport(reportId!, JSON.stringify(parsed.data));
      if (!res.ok) return setFormError(res.error);
      const id = res.data?.id ?? reportId;
      const held = mode === "create" && (res.data as { held?: boolean })?.held;
      router.push(`/reports/${id}?${mode === "create" ? (held ? "held=1" : "created=1") : "updated=1"}`);
      router.refresh();
    });
  }

  const fieldClass = (f: Field) => `input ${errors[f] ? "border-danger-400" : ""}`;
  const FieldError = ({ f }: { f: Field }) => (errors[f] ? <p className="mt-1 text-xs text-red-300" role="alert">{err(errors[f])}</p> : null);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {mode === "create" && (
        <fieldset>
          <legend className="label">{t("reports.whatHappened")}</legend>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-night-900 p-1">
            {(["lost", "found"] as const).map((type) => (
              <label key={type} className={`cursor-pointer rounded-lg py-2.5 text-center text-sm font-semibold ${v.type === type ? (type === "lost" ? "bg-teal-400 text-night-950" : "bg-amber-400 text-night-950") : "text-slate-300"}`}>
                <input type="radio" name="type" value={type} checked={v.type === type} onChange={() => set("type", type)} className="sr-only" />
                {type === "lost" ? t("reports.iLost") : t("reports.iFound")}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="item_name">{t("reports.itemName")}</label>
            <input id="item_name" className={fieldClass("item_name")} value={v.item_name} maxLength={120} placeholder={t("reports.itemNamePh")} onChange={(e) => set("item_name", e.target.value)} />
            <FieldError f="item_name" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category_id">{t("reports.category")}</label>
              <select id="category_id" className={fieldClass("category_id")} value={v.category_id} onChange={(e) => set("category_id", e.target.value)}>
                <option value="">{t("reports.selectCategory")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{locale === "ar" ? c.name_ar : c.name_en}</option>)}
              </select>
              <FieldError f="category_id" />
            </div>
            <div>
              <label className="label" htmlFor="color">{t("reports.color")}</label>
              <input id="color" className={fieldClass("color")} value={v.color} maxLength={60} placeholder={t("reports.colorPh")} onChange={(e) => set("color", e.target.value)} />
              <FieldError f="color" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="description">{t("reports.description")}</label>
            <textarea id="description" rows={4} className={fieldClass("description")} value={v.description} maxLength={2000} placeholder={t("reports.descriptionPh")} onChange={(e) => set("description", e.target.value)} />
            <FieldError f="description" />
          </div>
          <div>
            <label className="label" htmlFor="features">{t("reports.features")}</label>
            <input id="features" className={fieldClass("distinguishing_features")} value={v.distinguishing_features} maxLength={1000} placeholder={t("reports.featuresPh")} onChange={(e) => set("distinguishing_features", e.target.value)} />
            <FieldError f="distinguishing_features" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="event_date">{t("reports.date")}</label>
              <input id="event_date" type="date" className={fieldClass("event_date")} value={v.event_date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("event_date", e.target.value)} />
              <FieldError f="event_date" />
            </div>
            <div>
              <label className="label" htmlFor="event_time">{t("reports.time")} <span className="text-xs text-slate-500">({t("common.optional")})</span></label>
              <input id="event_time" type="time" className="input" value={v.event_time} onChange={(e) => set("event_time", e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <span className="label">{t("reports.photos")}</span>
          <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
            {v.photos.map((p) => (
              <div key={p.path} className="group relative aspect-square overflow-hidden rounded-xl bg-night-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removePhoto(p.path)} className="absolute end-1 top-1 rounded-full bg-night-950/80 p-1.5" aria-label={t("reports.removePhoto")}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
            {v.photos.length < MAX_PHOTOS && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-teal-400/40 text-center text-xs text-teal-200 hover:bg-teal-400/5">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <ImagePlus className="h-6 w-6" aria-hidden />}
                {uploading ? t("reports.uploading") : t("reports.addPhoto")}
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" className="sr-only" disabled={uploading} onChange={(e) => onFiles(e.target.files)} />
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">{t("reports.photosHelp")} ({v.photos.length}/{MAX_PHOTOS})</p>
          <FieldError f="image_paths" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="location_text">{t("reports.location")}</label>
        <input id="location_text" className={fieldClass("location_text")} value={v.location_text} maxLength={200} placeholder={t("reports.locationPh")} onChange={(e) => set("location_text", e.target.value)} />
        <p className="mb-2 mt-1 text-xs text-slate-400">{t("reports.locationHelp")}</p>
        <FieldError f="location_text" />
        <MapPicker value={pin} center={center} onChange={(p) => setV((s) => ({ ...s, lat: p?.lat ?? null, lng: p?.lng ?? null }))} />
      </div>

      <div>
        <label className="label" htmlFor="verification_notes">{t("reports.verificationNotes")} <span className="text-xs text-slate-500">({t("common.optional")})</span></label>
        <textarea id="verification_notes" rows={2} className="input" maxLength={1000} value={v.verification_notes} onChange={(e) => set("verification_notes", e.target.value)} />
        <p className="mt-1 text-xs text-slate-400">{t("reports.verificationNotesHelp")}</p>
      </div>

      <p className="flex items-start gap-2 text-xs text-amber-200/90"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t("reports.sensitiveNotice")}</p>

      {formError && <p className="alert-error" role="alert">{formError}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary min-w-40" disabled={pending || uploading}>
          {pending ? t("common.saving") : mode === "create" ? t("reports.submit") : t("reports.saveChanges")}
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.back()}>{t("common.cancel")}</button>
      </div>
    </form>
  );
}
