import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Earthwork · Global Jobs",
  description: "Your private workspace for jobs across countries, remote opportunities and employer-stated visa sponsorship.",
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

