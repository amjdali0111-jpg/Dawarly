import { getServerSupabase } from "@/lib/supabase/server";

/** Avatars live in a private bucket; a short-lived signed URL is created per render. */
export async function Avatar({ name, path, size = 40 }: { name: string; path: string | null; size?: number }) {
  let url: string | null = null;
  if (path) {
    const supabase = await getServerSupabase();
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 600);
    url = data?.signedUrl ?? null;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-600 font-bold text-night-950" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {initials || "?"}
    </span>
  );
}
