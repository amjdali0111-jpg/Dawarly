import Link from "next/link";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl font-bold text-white">{t("common.notFound")}</h1>
      <p className="max-w-md text-slate-300">{t("common.notFoundBody")}</p>
      <Link href="/" className="btn-primary">{t("common.goHome")}</Link>
    </div>
  );
}
