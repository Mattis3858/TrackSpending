"use server";

/**
 * 手動刷新報價。
 *
 * 注意這**不會**讓報價變成「當下的盤中價」——證交所的 STOCK_DAY_ALL
 * 只提供已收盤的完整交易日資料，所以週末或收盤前按下去，拿到的仍是
 * 上一個交易日的收盤價。它的用途是：
 *   1. 今天收盤結算後，不必等 15 分鐘快取過期就能拿到今天的價格
 *   2. 剛新增持股時立刻取得報價
 *   3. 懷疑數字沒更新時，有個明確的動作可以確認
 */

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth";
import { getHoldings } from "@/lib/queries";
import { getQuotes, getUsdToTwd } from "@/lib/quote-cache";
import type { ActionResult } from "./transactions";

export async function refreshQuotes(): Promise<ActionResult> {
  const userId = await requireUserId();

  try {
    const holdings = await getHoldings(userId);
    if (holdings.length === 0) {
      return { ok: false, message: "還沒有持股紀錄" };
    }

    const hasUs = holdings.some((h) => h.market === "US");
    const [book] = await Promise.all([
      getQuotes(
        holdings.map((h) => ({ symbol: h.symbol, market: h.market })),
        { force: true },
      ),
      hasUs ? getUsdToTwd({ force: true }) : Promise.resolve(null),
    ]);

    if (book.quotes.size === 0) {
      return { ok: false, message: "報價來源目前無法連線，請稍後再試" };
    }

    revalidatePath("/");
    revalidatePath("/settings/holdings");
    return { ok: true };
  } catch (error) {
    console.error("refreshQuotes failed", error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "刷新失敗",
    };
  }
}
