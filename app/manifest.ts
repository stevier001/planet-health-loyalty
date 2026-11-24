
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/staff",
    name: "Planet Health Staff",
    short_name: "PH Staff",
    description: "Planet Health staff loyalty and wallet portal.",
    start_url: "/staff",
    scope: "/",
    display: "standalone",
    background_color: "#F0EBE6",
    theme_color: "#111111",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/staff-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/staff-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
