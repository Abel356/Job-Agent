import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earthwork · Tech Jobs",
  description: "Private Canadian and US tech jobs, with Simplify listings and clear sponsorship signals.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

