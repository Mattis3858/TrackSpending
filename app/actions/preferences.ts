"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { HIDE_AMOUNTS_COOKIE } from "@/lib/preferences";

/** 切換金額遮罩。純顯示偏好，不需要登入檢查也不碰資料庫。 */
export async function setHideAmounts(hidden: boolean): Promise<void> {
  const store = await cookies();
  store.set(HIDE_AMOUNTS_COOKIE, hidden ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // 金額是在伺服器端算好字串的，要重新渲染整個 layout 才會換成遮罩
  revalidatePath("/", "layout");
}
