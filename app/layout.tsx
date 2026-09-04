import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AutoInvoiceNoticeModal from "@/components/AutoInvoiceNoticeModal";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "町田歯科技工所 管理システム",
  description: "町田歯科技工所向けの受注・加工・納品・請求管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <AutoInvoiceNoticeModal />
      </body>
    </html>
  );
}
