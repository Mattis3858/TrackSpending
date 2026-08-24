import { NextResponse } from "next/server";

/**
 * 健康檢查與部署診斷。
 *
 * 存在的理由：Vercel 的 x-vercel-id 只在函式真的被叫用時才顯示執行區域，
 * 靜態頁從邊緣快取送出時看不到，導致「函式到底跑在哪一區」無法確認。
 * 這支端點強制走函式，直接把區域報出來。
 *
 * 不回傳任何敏感資訊，也不碰資料庫。
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    region: process.env.VERCEL_REGION ?? "local",
    env: process.env.VERCEL_ENV ?? "development",
    time: new Date().toISOString(),
  });
}
