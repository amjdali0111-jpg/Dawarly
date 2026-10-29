import { requireSession } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getT } from "@/i18n/server";
import { profileNames } from "@/lib/data";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { signOut } from "@/app/actions/auth";
import { DeleteAccountForm, EmailPrefsForm, PasswordForm, UnblockButton } from "./SettingsForms";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const { t } = await getT();
  const supabase = await getServerSupabase();
  const [{ data: blocks }, { data: blockers }] = await Promise.all([
    supabase.from("blocks").select("blocked_id").eq("blocker_id", session.userId),
    supabase.rpc("account_deletion_blockers"),
  ]);
  const names = await profileNames(supabase, (blocks ?? []).map((b) => b.blocked_id));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="page-title">{t("settings.title")}</h1>
      <section className="card flex items-center justify-between gap-3">
        <h2 className="font-semibold">{t("settings.language")}</h2>
        <LanguageSwitcher />
      </section>
      <section className="card"><EmailPrefsForm enabled={session.emailNotifications} /></section>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.password")}</h2>
        <PasswordForm />
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">{t("settings.blockedUsers")}</h2>
        {(blocks ?? []).length === 0 ? <p className="muted">{t("settings.noBlocked")}</p> : (
          <ul className="space-y-2">
            {(blocks ?? []).map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between gap-2 text-sm">
                <span>{names.get(b.blocked_id)?.full_name ?? "—"}</span>
                <UnblockButton userId={b.blocked_id} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card lg:hidden">
        <form action={signOut}><button className="btn-ghost w-full" type="submit">{t("common.signOut")}</button></form>
      </section>
      <section className="card space-y-3 border-danger-500/30">
        <h2 className="font-semibold text-red-200">{t("settings.dangerZone")}</h2>
        <p className="text-sm text-slate-300">{t("settings.deleteBody")}</p>
        <DeleteAccountForm blockers={(blockers as string[] | null) ?? []} />
      </section>
    </div>
  );
}
