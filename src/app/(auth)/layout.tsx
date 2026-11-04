import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { publicEnv } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center bg-[url('/images/campus-night.svg')] bg-cover bg-center px-4 py-6">
      <div className="absolute inset-0 bg-night-950/75" aria-hidden />
      <div className="relative z-10 flex w-full max-w-md items-center justify-between">
        <Link href="/" aria-label="Home" className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          <Logo name={publicEnv.appName} />
        </Link>
        <LanguageSwitcher compact />
      </div>
      <main className="relative z-10 mt-8 w-full max-w-md">{children}</main>
    </div>
  );
}
