import { requireSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

// Every page in this group requires a verified session (checked on the server).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return <AppShell session={session}>{children}</AppShell>;
}
