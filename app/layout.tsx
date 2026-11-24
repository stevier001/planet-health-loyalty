
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Planet Health Staff",
  description: "Planet Health staff loyalty and wallet portal.",
  applicationName: "Planet Health Staff",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PH Staff",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
