import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getHoldings } from "@/lib/queries";
import { fetchQuotes } from "@/lib/quotes";
import { fetchUsdToTwd } from "@/lib/fx";
import { valuePortfolio } from "@/lib/analysis";
import { formatPercent, formatTWD } from "@/lib/money";
import {
  createHolding,
  deleteHolding,
  lookupHoldingSymbol,
  updateHolding,
} from "@/app/actions/holdings";
import BottomNav from "@/components/bottom-nav";
import HoldingsManager, { type HoldingRow } from "@/components/holdings-manager";

export const metadata = { title: "持股 · 記帳" };

export default async function HoldingsPage() {
  const userId = await requireUserId();

  const holdings = await getHoldings(userId);
  const usSymbols = holdings.filter((h) => h.market === "US").map((h) => h.symbol);

  // 有美股才需要匯率；沒有就不必打那支 API
  const [book, fx] = await Promise.all([
    fetchQuotes(usSymbols),
    usSymbols.length > 0 ? fetchUsdToTwd() : Promise.resolve(null),
  ]);

  const portfolio = valuePortfolio(
    holdings.map((h) => ({
      ...h,
      currency: h.market === "US" ? ("USD" as const) : ("TWD" as const),
    })),
    book.quotes,
    fx?.usdToTwd ?? null,
  );

  // Decimal 在伺服器端就轉成字串，不往 Client Component 傳（SPEC 5.5）
  const rows: HoldingRow[] = portfolio.items.map((item) => {
    const source = holdings.find((h) => h.symbol === item.symbol)!;
    return {
      id: source.id,
      symbol: item.symbol,
      name: item.name,
      market: source.market,
      currency: item.currency,
      shares: item.shares.toString(),
      cost: item.cost.toFixed(2),
      price: item.price ? item.price.toFixed(2) : null,
      value: item.value ? item.value.toFixed(2) : null,
      gain: item.gain ? item.gain.toFixed(2) : null,
      gainRatio: item.gainRatio,
      valueTwd: item.valueTwd ? item.valueTwd.toFixed(2) : null,
      quoteDate: item.quoteDate,
    };
  });

  const up = portfolio.totalGain.greaterThanOrEqualTo(0);

  async function create(input: { symbol: string; shares: string; cost: string }) {
    "use server";
    return createHolding(input);
  }
  async function update(
    id: string,
    input: { symbol: string; shares: string; cost: string },
  ) {
    "use server";
    return updateHolding(id, input);
  }
  async function remove(id: string) {
    "use server";
    return deleteHolding(id);
  }
  async function lookup(symbol: string) {
    "use server";
    return lookupHoldingSymbol(symbol);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg pb-8">
          <header className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">持股</h1>
            <Link href="/settings" className="text-sm text-slate-500 hover:text-slate-900">
              設定
            </Link>
          </header>

          {rows.length > 0 && (
            <section className="mt-5 rounded-2xl bg-slate-900 px-5 py-5 text-white">
              <p className="text-sm text-slate-400">總市值</p>
              <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
                {formatTWD(portfolio.totalValue)}
              </p>
              <p className="mt-2 text-sm">
                <span className="text-slate-400">成本 {formatTWD(portfolio.totalCost)}　</span>
                <span className={up ? "text-emerald-400" : "text-red-400"}>
                  {up ? "+" : ""}
                  {formatTWD(portfolio.totalGain)}
                  {portfolio.totalGainRatio !== null &&
                    `（${up ? "+" : ""}${formatPercent(portfolio.totalGainRatio, 1)}）`}
                </span>
              </p>

              <p className="mt-3 text-xs text-slate-500">
                {portfolio.quoteDate
                  ? `報價日期 ${portfolio.quoteDate}（證交所 / 櫃買中心公開資料，每 15 分鐘更新）`
                  : "目前取不到報價，市值以成本顯示"}
                {portfolio.missingQuotes > 0 &&
                  `　·　${portfolio.missingQuotes} 檔查無報價，以成本計入`}
                {portfolio.usdToTwd &&
                  `　·　美元匯率 ${portfolio.usdToTwd.toFixed(3)}`}
              </p>
            </section>
          )}

          {portfolio.missingFx > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              取不到美元匯率，{portfolio.missingFx} 檔美股部位暫時無法併入台幣合計，
              下方仍以美元顯示。
            </p>
          )}

          {book.failed.length > 0 && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {book.failed.join("、")} 的報價來源暫時無法連線，這些股票的市值先以成本顯示。
            </p>
          )}

          <div className="mt-6">
            <HoldingsManager
              rows={rows}
              onCreate={create}
              onUpdate={update}
              onDelete={remove}
              onLookup={lookup}
            />
          </div>
        </div>
      </main>
      <BottomNav />
    </>
  );
}
