import type { University } from "@/lib/types";

const DEFAULT_CENTER = (process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER ?? "24.7136,46.6753").split(",").map(Number);

export function universityCenter(u: Pick<University, "center_lat" | "center_lng">) {
  return u.center_lat != null && u.center_lng != null
    ? { lat: u.center_lat, lng: u.center_lng }
    : { lat: DEFAULT_CENTER[0] || 24.7136, lng: DEFAULT_CENTER[1] || 46.6753 };
}
