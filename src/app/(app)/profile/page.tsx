import { requireSession } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { ProfileSummary } from "@/components/profile/ProfileSummary";
import { ProfileForm } from "@/components/profile/ProfileForm";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireSession("/profile");
  const { t, locale } = await getT();
  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_360px]">
      <ProfileSummary profile={session.profile} universityName={locale === "ar" ? session.university.name_ar : session.university.name_en} />
      <section className="card h-fit space-y-3">
        <h2 className="font-semibold text-white">{t("profile.editProfile")}</h2>
        {session.email && <p className="text-xs text-slate-400">{session.email}</p>}
        <ProfileForm profile={session.profile} />
      </section>
    </div>
  );
}
