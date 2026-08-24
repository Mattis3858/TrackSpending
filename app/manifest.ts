import type { MetadataRoute } from "next";

/**
 * PWA manifest — 讓 Chrome on Android 能把這個網站裝成 WebAPK
 * （主畫面圖示 + 應用程式抽屜 + 多工切換器裡的獨立項目）。
 *
 * 這不是另一個 app：安裝後的殼載入的還是同一個網站，
 * 所以之後改任何東西都只要改這個專案、push 一次就好。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "記帳",
    short_name: "記帳",
    description: "個人記帳系統：每月收支、儲蓄率與分類統計",
    lang: "zh-TW",
    start_url: "/",
    scope: "/",
    // standalone = 開啟後沒有網址列與分頁列，看起來就是一般 app
    display: "standalone",
    orientation: "portrait",
    // 啟動畫面底色，跟 body 的 bg-slate-50 一致，避免開啟時閃一下白底
    background_color: "#f8fafc",
    // Android 狀態列顏色
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android 的自適應圖示會把圖裁成圓形／方圓形，
        // 這個版本是滿版底色 + 內容縮在中央安全區，裁切後才不會缺角
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // 長按主畫面圖示會跳出的捷徑
    shortcuts: [
      {
        name: "記一筆",
        short_name: "記一筆",
        url: "/transactions/new",
      },
      {
        name: "交易明細",
        short_name: "明細",
        url: "/transactions",
      },
    ],
  };
}
