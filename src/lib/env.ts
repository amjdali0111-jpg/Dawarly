/**
 * Normalises a site URL: trims, adds https:// when the protocol is missing
 * (a common Vercel misconfiguration) and drops the trailing slash. Returns ""
 * for empty or unparsable values so callers can fall back safely.
 */
export function normalizeSiteUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(withProto).origin;
  } catch {
    return "";
  }
}

/** NEXT_PUBLIC_SITE_URL as explicitly configured ("" when unset or invalid). */
export const configuredSiteUrl = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

// Public configuration (safe to ship to the browser).
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: configuredSiteUrl || "http://localhost:3000",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Dawarly",
  mapTileUrl: process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
};

export const isSupabaseConfigured = () => Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
