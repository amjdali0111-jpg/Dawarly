import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import type { Profile } from "@/lib/types";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import { AbuseReportButton } from "@/components/AbuseReportButton";

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/users/${id}`);
  if (id === session.userId) redirect("/profile");
  const { locale, t } = await getT();
  const supabase = await getServerSupabase();
  // RLS returns profiles from the viewer's own university only.
  const { data: profile } = await supabase.from("profiles")
    .select("id, university_id, full_name, avatar_path, member_type, role, faculty, academic_year, created_at, deleted_at")
    .eq("id", id).is("deleted_at", null).maybeSingle<Profile>();
  if (!profile) notFound();
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <ProfileSummary profile={profile} universityName={locale === "ar" ? session.university.name_ar : session.university.name_en} />
      <AbuseReportButton targetType="user" targetId={profile.id} label={t("profile.reportUser")} />
    </div>
  );
}
