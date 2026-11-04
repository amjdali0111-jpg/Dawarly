import { getT } from "@/i18n/server";
import { ResetForm } from "./ResetForm";

// Reached from the recovery email via /auth/confirm, which establishes a session.
export default async function ResetPasswordPage() {
  const { t } = await getT();
  return (
    <div className="card p-6">
      <h1 className="mb-6 text-center text-2xl font-bold text-white">{t("auth.resetTitle")}</h1>
      <ResetForm />
    </div>
  );
}
