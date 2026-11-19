import type { NextConfig } from "next";

const originOf = (raw: string | undefined, fallback: string) => {
  try {
    return new URL((raw ?? "").replace(/\{[a-z]\}/gi, "a")).origin;
  } catch {
    return fallback;
  }
};

// Browser-side origins the app talks to. Server-only services (OpenAI,
// Anthropic, Resend) are called from the server and need no entry here.
const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://*.supabase.co");
const supabaseWs = supabase.replace(/^http/, "ws");
const tiles = originOf(process.env.NEXT_PUBLIC_MAP_TILE_URL, "https://tile.openstreetmap.org");
const isDev = process.env.NODE_ENV !== "production";

// Next.js injects inline bootstrap scripts, so 'unsafe-inline' is required for
// script-src without a per-request nonce; everything else is restricted.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} ${tiles}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabaseWs}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(!isDev && supabase.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  // Browsers and crawlers request /favicon.ico directly; serve the app icon.
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icons/icon-192.png", permanent: true }];
  },
};

export default nextConfig;
