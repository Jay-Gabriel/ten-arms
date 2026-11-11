import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ten Arms · 3D Action RPG",
  description: "The dead rise in waves. Switch weapons mid-combo to multiply your score, dodge at the last second to slow time, and charge your energy for an ultimate.",
  keywords: ["Three.js", "Next.js", "3D Action RPG", "Ten Arms", "WebGL", "Samurai"],
  authors: [{ name: "Ten Arms Clone" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#0b0a12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased bg-[#0b0a12] text-[#f3ecdf] overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
