
"use client";

import { useEffect } from "react";

export default function RegisterMyPlanetServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/my-planet/sw.js", {
          scope: "/my-planet/",
        })
        .catch((error) => {
          console.error(
            "My Planet service worker registration failed:",
            error
          );
        });
    }
  }, []);

  return null;
}
