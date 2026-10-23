import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNavbar from "@/components/AppNavbar";
import { Suspense } from "react";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mailer",
  description: "Private email outreach and campaign management",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900">
        <Suspense fallback={<div className="sticky top-0 z-40 h-[57px] border-b border-zinc-200 bg-white" />}>
          <AppNavbar />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
