import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cycling Explorer",
  description: "All your Strava activities on one map — plus tile overlays for your mapping software",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full overflow-hidden font-sans">{children}</body>
    </html>
  );
}
