/**
 * 匯率 — 見 SPEC 8.7
 *
 * 來源：https://open.er-api.com/v6/latest/USD（免費、免金鑰、每日更新）
 *
 * 台灣銀行的牌告匯率端點會回 HTML（有防爬機制），不能直接用。
 *
 * 跟報價一樣的原則：**抓不到絕不能讓頁面壞掉**。取不到匯率時回傳 null，
 * 呼叫端會把美股部位維持以美元顯示、不併入台幣總計，而不是用 0 或猜的匯率。
 */

import { Decimal, money } from "./money";
import type { Ymd } from "./date";

const FX_URL = "https://open.er-api.com/v6/latest/USD";

/** 匯率一天才變一次，快取 6 小時綽綽有餘 */
const REVALIDATE_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 8000;

export type FxRate = {
  /** 1 USD 等於多少 TWD */
  usdToTwd: Decimal;
  /** 這個匯率的日期 */
  date: Ymd | null;
};

type ErApiResponse = {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
};

/** 解析函式獨立出來，方便離線測試 */
export function parseFxResponse(raw: unknown): FxRate | null {
  const data = raw as ErApiResponse | null;
  if (!data || data.result !== "success") return null;

  const rate = data.rates?.TWD;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;

  let date: Ymd | null = null;
  if (data.time_last_update_utc) {
    const parsed = new Date(data.time_last_update_utc);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed.toISOString().slice(0, 10);
    }
  }

  try {
    return { usdToTwd: money(String(rate)), date };
  } catch {
    return null;
  }
}

/** 取得美元對台幣匯率。任何失敗都回傳 null，永不拋錯。 */
export async function fetchUsdToTwd(): Promise<FxRate | null> {
  try {
    const res = await fetch(FX_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return parseFxResponse(await res.json());
  } catch {
    return null;
  }
}
