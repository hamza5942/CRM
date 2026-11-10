import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthShell from "../components/AuthShell";
import "./globals.css";

export const instant = false;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Codex Solutions",
  description: "Operations, sales, and team activity at a glance.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/icon.png" },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f3f7f9] font-sans text-slate-900">
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
