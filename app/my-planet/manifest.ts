
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/my-planet/",
    name: "My Planet | Planet Health",
    short_name: "My Planet",
    description:
      "Your Planet Health membership, loyalty rewards and wallet.",
    start_url: "/my-planet/",
    scope: "/my-planet/",
    display: "standalone",
    background_color: "#F0EBE6",
    theme_color: "#45e017",
    orientation: "portrait",
    icons: [
      {
        src: "/my-planet-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/my-planet-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
