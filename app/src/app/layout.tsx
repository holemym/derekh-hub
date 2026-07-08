import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import AppShell from "@/components/AppShell";
import Splash from "@/components/Splash";
import SWRegister from "@/components/SWRegister";
import "./globals.css";

// Hanken Grotesk — the app typeface (DESIGN.md §Typography). Only the three
// weights the scale uses are loaded.
const sans = Hanken_Grotesk({
  variable: "--font-sans-src",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Derech",
  description: "Burial & body-transport operations hub — Vienna.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Derech",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0d0b" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppShell>{children}</AppShell>
          <Splash />
          <SWRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
