import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${publicEnv.appName} — University Lost & Found`,
    short_name: publicEnv.appName,
    description: "Report, match and return lost and found items at your university.",
    start_url: "/reports",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1c2a",
    theme_color: "#0a1c2a",
    lang: "ar",
    dir: "auto",
    categories: ["education", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
