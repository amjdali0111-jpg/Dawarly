import Link from "next/link";
import { getT } from "@/i18n/server";
import { ForgotForm } from "./ForgotForm";

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return (
    <div className="card p-6">
      <h1 className="text-center text-2xl font-bold text-white">{t("auth.forgotTitle")}</h1>
      <p className="mb-6 mt-1 text-center muted">{t("auth.forgotBody")}</p>
      <ForgotForm />
      <p className="mt-6 text-center text-sm"><Link href="/login" className="link">{t("auth.loginButton")}</Link></p>
    </div>
  );
}
