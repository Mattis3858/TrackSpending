"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, type Theme } from "@/lib/preferences";

/**
 * 切換深色模式。
 *
 * 跟金額遮罩一樣刻意**不呼叫** revalidatePath——它會連同這條路由的
 * fetch 快取一起清掉（包含股票報價）。切換佈景不該有那種代價。
 * 重新渲染由客戶端的 router.refresh() 負責。
 */
export async function setTheme(theme: Theme): Promise<void> {
  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
