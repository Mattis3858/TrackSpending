"use server";

import { cookies } from "next/headers";
import { HIDE_AMOUNTS_COOKIE } from "@/lib/preferences";

/** 切換金額遮罩。純顯示偏好，不需要登入檢查也不碰資料庫。 */
export async function setHideAmounts(hidden: boolean): Promise<void> {
  const store = await cookies();
  store.set(HIDE_AMOUNTS_COOKIE, hidden ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  // 這裡刻意**不呼叫** revalidatePath。
  //
  // 它會連同這條路由的 fetch 快取一起清掉，於是每按一次眼睛就要重抓
  // 2,000 多檔股票報價（實測 ~1.3 秒）。切換顯示格式不該有這種代價。
  //
  // 重新渲染由客戶端的 router.refresh() 負責，那不會動到 Data Cache。
}
