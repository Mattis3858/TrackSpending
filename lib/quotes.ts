/**
 * 台股報價 — 見 SPEC 8.6
 *
 * 兩個免費且公開的來源，不需要金鑰：
 *   證交所（上市）  https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
 *   櫃買中心（上櫃）https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes
 *
 * 設計原則：
 * 1. **報價抓不到絕不能讓頁面壞掉。** 外部 API 不在我們的控制範圍，
 *    任何失敗都退化成「沒有現值」，成本與其他報表照常顯示。
 * 2. 解析邏輯是純函式，由 lib/quotes.test.ts 用真實樣本離線測試，
 *    不需要連網也不會因為當天行情變動而測試不穩。
 * 3. 個人淨值不需要即時報價，快取 15 分鐘，避免每次載入都打外部 API。
 */

import type { Market } from "@/generated/prisma/enums";
import { Decimal, money } from "./money";
import type { Ymd } from "./date";

export type Quote = {
  symbol: string;
  name: string;
  market: Market;
  price: Decimal;
  /** 較前一交易日的漲跌 */
  change: Decimal;
  /** 報價所屬日期 */
  date: Ymd;
};

export type QuoteBook = {
  /** key 是股票代號 */
  quotes: Map<string, Quote>;
  /** 抓取失敗的來源，UI 可據此提示「現值可能不是最新」 */
  failed: Market[];
};

const TWSE_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TPEX_URL = "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";

/** 快取 15 分鐘：個人淨值不需要即時報價 */
const REVALIDATE_SECONDS = 900;
const TIMEOUT_MS = 8000;

// ───────────────────────────── 純解析（可離線測試）

/** 民國日期 "1150821" -> "2026-08-21"。格式不對回傳 null，不拋錯。 */
export function rocDateToYmd(roc: string): Ymd | null {
  if (!/^\d{7}$/.test(roc)) return null;
  const year = Number(roc.slice(0, 3)) + 1911;
  const month = roc.slice(3, 5);
  const day = roc.slice(5, 7);
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** 報價欄位可能是 "--"、空字串（停牌、無成交），一律回傳 null 而不是 0 */
function parsePrice(raw: unknown): Decimal | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().replace(/,/g, "");
  if (!v || !/^[+-]?[0-9]*[.]?[0-9]+$/.test(v)) return null;
  try {
    return money(v);
  } catch {
    return null;
  }
}

type TwseRow = {
  Date?: string;
  Code?: string;
  Name?: string;
  ClosingPrice?: string;
  Change?: string;
};

/** 證交所（上市）的欄位：Code / Name / ClosingPrice / Change */
export function parseTwseRows(rows: unknown): Quote[] {
  if (!Array.isArray(rows)) return [];
  const out: Quote[] = [];

  for (const row of rows as TwseRow[]) {
    const symbol = row?.Code?.trim();
    const name = row?.Name?.trim();
    const price = parsePrice(row?.ClosingPrice);
    const date = rocDateToYmd(row?.Date ?? "");
    if (!symbol || !name || !price || !date) continue;

    out.push({
      symbol,
      name,
      market: "TWSE",
      price,
      change: parsePrice(row?.Change) ?? new Decimal(0),
      date,
    });
  }
  return out;
}

type TpexRow = {
  Date?: string;
  SecuritiesCompanyCode?: string;
  CompanyName?: string;
  Close?: string;
  Change?: string;
};

/** 櫃買中心（上櫃）的欄位名稱跟證交所不同：SecuritiesCompanyCode / CompanyName / Close */
export function parseTpexRows(rows: unknown): Quote[] {
  if (!Array.isArray(rows)) return [];
  const out: Quote[] = [];

  for (const row of rows as TpexRow[]) {
    const symbol = row?.SecuritiesCompanyCode?.trim();
    const name = row?.CompanyName?.trim();
    const price = parsePrice(row?.Close);
    const date = rocDateToYmd(row?.Date ?? "");
    if (!symbol || !name || !price || !date) continue;

    out.push({
      symbol,
      name,
      market: "TPEX",
      price,
      change: parsePrice(row?.Change) ?? new Decimal(0),
      date,
    });
  }
  return out;
}

// ───────────────────────────── 抓取（永不拋錯）

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // 逾時、DNS、對方掛掉——一律當作「這次沒有報價」
    return null;
  }
}

/**
 * 抓取兩個市場的報價。
 * 單一來源失敗不影響另一個；兩個都失敗就回傳空的 quotes，
 * 呼叫端會退化成只顯示成本。
 */
export async function fetchQuotes(): Promise<QuoteBook> {
  const [twseRaw, tpexRaw] = await Promise.all([
    fetchJson(TWSE_URL),
    fetchJson(TPEX_URL),
  ]);

  const failed: Market[] = [];
  if (twseRaw === null) failed.push("TWSE");
  if (tpexRaw === null) failed.push("TPEX");

  const quotes = new Map<string, Quote>();
  // 先放上市，再放上櫃；同代號時以先放的為準（實務上不會重複）
  for (const q of parseTwseRows(twseRaw)) quotes.set(q.symbol, q);
  for (const q of parseTpexRows(tpexRaw)) {
    if (!quotes.has(q.symbol)) quotes.set(q.symbol, q);
  }

  return { quotes, failed };
}

/** 新增持股時用代號查名稱與市場 */
export async function lookupSymbol(symbol: string): Promise<Quote | null> {
  const { quotes } = await fetchQuotes();
  return quotes.get(symbol.trim().toUpperCase()) ?? null;
}
