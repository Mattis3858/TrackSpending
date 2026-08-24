/**
 * 台股報價 — 見 SPEC 8.6
 *
 * 三個免費且公開的來源，不需要金鑰：
 *   證交所（上市）  https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL
 *   櫃買中心（上櫃）https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes
 *   Yahoo（美股）   https://query1.finance.yahoo.com/v8/finance/chart/<代號>
 *
 * 台股那兩支是官方端點、一次回傳全市場；Yahoo 是非官方端點、一次一檔，
 * 而且**必須帶 User-Agent**（不帶會被回 429）。Yahoo 隨時可能改或擋，
 * 所以美股報價失敗時就退化成以成本顯示，不影響台股與其他報表。
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

export type Currency = "TWD" | "USD";

export type Quote = {
  symbol: string;
  name: string;
  market: Market;
  /** 報價的計價幣別。美股是 USD，合計時要換算台幣 */
  currency: Currency;
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
      currency: "TWD",
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
      currency: "TWD",
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
export async function fetchQuotes(usSymbols: string[] = []): Promise<QuoteBook> {
  const [twseRaw, tpexRaw, usQuotes] = await Promise.all([
    fetchJson(TWSE_URL),
    fetchJson(TPEX_URL),
    fetchUsQuotes(usSymbols),
  ]);

  const failed: Market[] = [];
  if (twseRaw === null) failed.push("TWSE");
  if (tpexRaw === null) failed.push("TPEX");
  // 有要查美股卻一檔都沒回來，才算美股來源失敗
  if (usSymbols.length > 0 && usQuotes.length === 0) failed.push("US");

  const quotes = new Map<string, Quote>();
  // 先放上市，再放上櫃；同代號時以先放的為準（實務上不會重複）
  for (const q of parseTwseRows(twseRaw)) quotes.set(q.symbol, q);
  for (const q of parseTpexRows(tpexRaw)) {
    if (!quotes.has(q.symbol)) quotes.set(q.symbol, q);
  }
  // 美股代號是英文字母，不會跟台股的數字代號衝突
  for (const q of usQuotes) quotes.set(q.symbol, q);

  return { quotes, failed };
}

/** 新增持股時用代號查名稱與市場 */
export async function lookupSymbol(symbol: string): Promise<Quote | null> {
  const target = symbol.trim().toUpperCase();
  if (!target) return null;

  const { quotes } = await fetchQuotes();
  const tw = quotes.get(target);
  if (tw) return tw;

  // 台股清單裡沒有就當作複委託標的去 Yahoo 查
  const [us] = await fetchUsQuotes([target]);
  return us ?? null;
}

// ───────────────────────────── 美股（複委託）

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
/** Yahoo 不帶 User-Agent 會回 429 */
const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

type YahooMeta = {
  symbol?: string;
  currency?: string;
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
  longName?: string;
  shortName?: string;
};

/** 解析 Yahoo chart 回應，取出報價。格式不符一律回 null，不拋錯。 */
export function parseYahooChart(raw: unknown): Quote | null {
  const meta = (
    raw as { chart?: { result?: { meta?: YahooMeta }[] } } | null
  )?.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const symbol = meta.symbol?.trim().toUpperCase();
  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  if (!symbol || price === null || !Number.isFinite(price) || price <= 0) return null;

  const prev = meta.previousClose ?? meta.chartPreviousClose;
  const change =
    typeof prev === "number" && Number.isFinite(prev)
      ? money(String(price)).minus(money(String(prev)))
      : new Decimal(0);

  // regularMarketTime 是 Unix 秒
  const date =
    typeof meta.regularMarketTime === "number"
      ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);

  return {
    symbol,
    name: meta.longName?.trim() || meta.shortName?.trim() || symbol,
    market: "US",
    // 目前只支援美元計價的複委託標的
    currency: "USD",
    price: money(String(price)),
    change,
    date,
  };
}

async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const res = await fetch(
      `${YAHOO_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": YAHOO_UA, accept: "application/json" },
      },
    );
    if (!res.ok) return null;
    return parseYahooChart(await res.json());
  } catch {
    return null;
  }
}

/**
 * 抓指定美股代號的報價。Yahoo 的批次端點（v7/quote）已經回 401 不能用，
 * 只能一檔一個請求；持股數量不多加上 15 分鐘快取，成本可以接受。
 */
export async function fetchUsQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()))].filter(Boolean);
  if (unique.length === 0) return [];

  const results = await Promise.all(unique.map(fetchYahooQuote));
  return results.filter((q): q is Quote => q !== null);
}
