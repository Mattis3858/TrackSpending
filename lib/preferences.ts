/**
 * 使用者的顯示偏好，存在 cookie 而不是 localStorage。
 *
 * 原因：這些頁面是 Server Component，金額在伺服器端就格式化成字串。
 * 用 localStorage 的話，HTML 會先帶著真實金額送到瀏覽器、再由 JS 蓋掉，
 * 中間會閃一下真實數字 —— 那正好是「有人在旁邊」時最不該發生的事。
 * 放 cookie 伺服器就讀得到，送出去的 HTML 本身就已經是遮罩過的。
 */
import { cookies } from "next/headers";

export const HIDE_AMOUNTS_COOKIE = "hide_amounts";

export async function getHideAmounts(): Promise<boolean> {
  const store = await cookies();
  return store.get(HIDE_AMOUNTS_COOKIE)?.value === "1";
}
