import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/i18n/server";
import { dirOf } from "@/i18n/config";
import { I18nProvider } from "@/i18n/client";
import { makeT } from "@/i18n/translate";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { publicEnv } from "@/lib/env";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-sans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = makeT(await getLocale());
  return {
    metadataBase: new URL(publicEnv.siteUrl),
    title: { default: `${publicEnv.appName} — ${t("common.tagline")}`, template: `%s · ${publicEnv.appName}` },
    description: t("landing.heroSubtitle"),
    applicationName: publicEnv.appName,
    appleWebApp: { capable: true, title: publicEnv.appName, statusBarStyle: "black-translucent" },
    icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a1c2a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)} className={cairo.variable}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale}>
          {children}
          <ServiceWorkerRegister />
        </I18nProvider>
      </body>
    </html>
  );
}
