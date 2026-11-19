import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

// Public marketing and auth pages may be indexed; the signed-in app, admin
// area, API and auth callbacks may not (they redirect anonymous visitors anyway).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/register"],
        disallow: [
          "/admin", "/api/", "/auth/", "/reports", "/my-reports", "/map", "/matches", "/messages",
          "/notifications", "/profile", "/settings", "/requests", "/users/", "/account-issue", "/reset-password",
        ],
      },
    ],
    host: publicEnv.siteUrl,
  };
}
