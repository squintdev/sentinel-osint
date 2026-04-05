import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENTINEL — OSINT Intelligence Dashboard",
  description: "Real-time global intelligence monitoring platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
