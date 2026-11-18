import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";

// The font variable sits on <html>: the App shell tokens live on :root and read it from there.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

const description = "A labelled stopwatch with a session history. Saved in this browser only.";

export const metadata: Metadata = {
  title: "Time tracker | Bookchaowalit",
  description,
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  authors: [{ name: "Bookchaowalit", url: "https://bookchaowalit.com" }],
  robots: { index: true, follow: true },
  openGraph: { type: "website", url: "/", siteName: "Bookchaowalit", title: "Time tracker | Bookchaowalit", description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
