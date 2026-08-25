/**
 * 報價與匯率的資料庫快取 — 見 SPEC 8.12
 *
 * 為什麼不用 Next.js 的 fetch 快取就好：
 * Next 的快取條目是「依渲染它的路由檔案標記」的，所以任何
 * `revalidatePath("/")`——例如你記一筆帳——都會把首頁渲染時建立的
 * 快取一起清掉，包含報價。下次開首頁又要跑去台灣重抓 300KB。
 *
 * 存在自己的資料庫就完全不受 Next 快取語意影響，而且函式與資料庫同區，
 * 讀取只要幾毫秒。
 *
 * 另一個重點：**只快取使用者實際持有的代號**。證交所的端點一次回傳
 * 全市場 2,000 多檔，但我們只需要其中幾檔。
 */

import type { Market } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/money";
import { fetchQuotes, type Quote, type QuoteBook } from "@/lib/quotes";
import { fetchUsdToTwd, type FxRate } from "@/lib/fx";

/** 報價快取存活時間。個人淨值不需要即時報價。 */
const TTL_MS = 15 * 60 * 1000;
/** 匯率一天才變一次 */
const FX_TTL_MS = 6 * 60 * 60 * 1000;

export type WantedSymbol = { symbol: string; market: Market };

function rowToQuote(row: {
  symbol: string;
  name: string;
  market: Market;
  price: unknown;
  quoteDate: string;
}): Quote {
  return {
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    currency: row.market === "US" ? "USD" : "TWD",
    price: money(row.price as { toString(): string }),
    change: money("0"), // 快取不存漲跌，資產畫面用不到
    date: row.quoteDate,
  };
}

/**
 * 取得指定代號的報價。
 *
 * 1. 先讀資料庫快取，全部都在且夠新就直接回傳（不打外部 API）
 * 2. 有缺或過期才去抓，抓完只把「需要的代號」寫回快取
 * 3. 外部 API 掛掉時，**退回用過期的快取**而不是完全沒有報價
 *    ——昨天的收盤價遠比「查無報價、以成本顯示」有用
 */
export async function getQuotes(wanted: WantedSymbol[]): Promise<QuoteBook> {
  if (wanted.length === 0) return { quotes: new Map(), failed: [] };

  const symbols = [...new Set(wanted.map((w) => w.symbol))];
  const cached = await prisma.quoteCache.findMany({
    where: { symbol: { in: symbols } },
  });

  const cutoff = Date.now() - TTL_MS;
  const fresh = cached.filter((c) => c.fetchedAt.getTime() >= cutoff);

  if (fresh.length === symbols.length) {
    return {
      quotes: new Map(fresh.map((c) => [c.symbol, rowToQuote(c)])),
      failed: [],
    };
  }

  const usSymbols = wanted
    .filter((w) => w.market === "US")
    .map((w) => w.symbol);
  const book = await fetchQuotes(usSymbols);

  // 只寫回我們需要的代號，不是全市場
  const toStore = symbols
    .map((s) => book.quotes.get(s))
    .filter((q): q is Quote => q !== undefined);

  if (toStore.length > 0) {
    const now = new Date();
    await prisma.$transaction(
      toStore.map((q) =>
        prisma.quoteCache.upsert({
          where: { symbol: q.symbol },
          update: {
            name: q.name,
            market: q.market,
            price: q.price.toFixed(6),
            quoteDate: q.date,
            fetchedAt: now,
          },
          create: {
            symbol: q.symbol,
            name: q.name,
            market: q.market,
            price: q.price.toFixed(6),
            quoteDate: q.date,
            fetchedAt: now,
          },
        }),
      ),
    );
  }

  // 這次沒抓到的，用過期快取補上——昨天的收盤價比沒有報價有用
  const result = new Map<string, Quote>();
  for (const c of cached) result.set(c.symbol, rowToQuote(c));
  for (const s of symbols) {
    const q = book.quotes.get(s);
    if (q) result.set(s, q);
  }

  return { quotes: result, failed: book.failed };
}

/** 匯率同樣先讀快取，失敗時退回過期值 */
export async function getUsdToTwd(): Promise<FxRate | null> {
  const cached = await prisma.fxRateCache.findUnique({
    where: { pair: "USDTWD" },
  });

  if (cached && cached.fetchedAt.getTime() >= Date.now() - FX_TTL_MS) {
    return { usdToTwd: money(cached.rate), date: cached.rateDate };
  }

  const fresh = await fetchUsdToTwd();
  if (fresh) {
    await prisma.fxRateCache.upsert({
      where: { pair: "USDTWD" },
      update: {
        rate: fresh.usdToTwd.toFixed(6),
        rateDate: fresh.date,
        fetchedAt: new Date(),
      },
      create: {
        pair: "USDTWD",
        rate: fresh.usdToTwd.toFixed(6),
        rateDate: fresh.date,
      },
    });
    return fresh;
  }

  // 抓不到就用過期的匯率，總比整個美元部位無法換算好
  return cached ? { usdToTwd: money(cached.rate), date: cached.rateDate } : null;
}
