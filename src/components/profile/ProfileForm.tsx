"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { setAvatar, updateProfile } from "@/app/actions/profile";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { validatePhotoFile } from "@/lib/validation";
import { useI18n } from "@/i18n/client";
import type { Profile } from "@/lib/types";

export function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  const router = useRouter();
  const [memberType, setMemberType] = useState(profile.member_type);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onAvatar(file?: File) {
    if (!file || validatePhotoFile(file)) return;
    start(async () => {
      const blob = await compressImage(file, 512);
      const path = `${profile.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await getBrowserSupabase().storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (error) return setAvatarMsg(t("common.genericError"));
      const res = await setAvatar(path);
      setAvatarMsg(res.ok ? res.message ?? null : res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <label className="btn-ghost btn-sm cursor-pointer">
        <Camera className="h-4 w-4" aria-hidden />
        {pending ? t("common.saving") : t("profile.changeAvatar")}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onAvatar(e.target.files?.[0])} />
      </label>
      {avatarMsg && <p className="text-sm text-teal-300">{avatarMsg}</p>}
      <ActionForm action={updateProfile} className="space-y-3">
        <div>
          <label className="label" htmlFor="full_name">{t("auth.fullName")}</label>
          <input id="full_name" name="full_name" defaultValue={profile.full_name} required minLength={2} maxLength={120} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="member_type">{t("auth.memberType")}</label>
          <select id="member_type" name="member_type" value={memberType} onChange={(e) => setMemberType(e.target.value as Profile["member_type"])} className="input">
            {(["student", "employee", "faculty"] as const).map((m) => <option key={m} value={m}>{t(`memberType.${m}`)}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="faculty">{t("auth.college")}</label>
            <input id="faculty" name="faculty" defaultValue={profile.faculty ?? ""} maxLength={120} className="input" />
          </div>
          {memberType === "student" && (
            <div>
              <label className="label" htmlFor="academic_year">{t("auth.academicYear")}</label>
              <input id="academic_year" name="academic_year" type="number" min={1} max={10} defaultValue={profile.academic_year ?? ""} className="input" />
            </div>
          )}
        </div>
        <SubmitButton pendingText={t("common.saving")}>{t("common.save")}</SubmitButton>
      </ActionForm>
    </div>
  );
}
