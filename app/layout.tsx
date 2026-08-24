import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "記帳",
  description: "個人記帳系統：每月收支、儲蓄率與分類統計",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-TW" className="h-full antialiased">
      <body className="bg-slate-50 text-slate-900 min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
