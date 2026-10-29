import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_PAGES, isProtectedPath } from "@/lib/routes";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  let verified = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      verified = Boolean(data.user?.email_confirmed_at);
    } catch {
      verified = false;
    }
  }

  if (!verified && isProtectedPath(path)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  if (verified && AUTH_PAGES.includes(path)) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/reports";
    dest.search = "";
    return NextResponse.redirect(dest);
  }
  // Authenticated pages must never be stored by shared caches.
  if (isProtectedPath(path)) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|images/|sw.js|manifest.webmanifest|offline.html|api/cron).*)"],
};
