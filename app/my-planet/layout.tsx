
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "My Planet | Planet Health",
  description:
    "Your Planet Health membership, loyalty rewards and wallet.",
  applicationName: "My Planet",
  manifest: "/my-planet.webmanifest",
  icons: {
    icon: "/my-planet-192.png",
    apple: "/my-planet-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "My Planet",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#45e017",
};

export default function MyPlanetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
