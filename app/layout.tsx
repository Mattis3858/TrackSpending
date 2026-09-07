import type { Metadata, Viewport } from "next";
import { getTheme } from "@/lib/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "記帳",
  description: "個人記帳系統：每月收支、儲蓄率與分類統計",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // 手機瀏覽器的網址列／狀態列底色。淺色模式用頁面底色，深色模式用更深的，
  // 否則深色頁面上方會露出一條淺色的邊。
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 在伺服器端就讀 cookie 決定主題，HTML 一送出就是對的顏色。
  // 若改用 localStorage，每次載入都會先閃一下淺色。
  const theme = await getTheme();

  return (
    <html
      lang="zh-TW"
      className={theme === "dark" ? "dark h-full antialiased" : "h-full antialiased"}
    >
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
