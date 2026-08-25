import { requireUserId } from "@/lib/auth";
import { getHoldings } from "@/lib/queries";
import { getQuotes, getUsdToTwd } from "@/lib/quote-cache";
import { assetSummary, valuePortfolio } from "@/lib/analysis";
import { amountFormatter, formatPercent } from "@/lib/money";
import { SkeletonBar, SkeletonCard } from "./skeleton";

/**
 * 資產卡。這是首頁唯一需要打外部 API（報價）的區塊，
 * 所以首頁把它包在 Suspense 裡串流載入——報價來源慢的時候，
 * 其餘畫面不會被卡住。
 *
 * 所有金額都在這裡格式化成字串，Decimal 不會外流。
 */

type Props = {
  hidden: boolean;
  startingCash: string;
  cashUsd: string;
  allTimeIncome: string;
  allTimeConsumption: string;
  allTimeInvestment: string;
  avgMonthlyConsumption: string | null;
};

function Stat({
  label,
  value,
  sub,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  /** 第二行，用來顯示同一項目的外幣部分 */
  sub?: string | null;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`tabular mt-0.5 text-base font-semibold ${tone}`}>{value}</p>
      {sub && <p className="tabular mt-0.5 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

export function AssetsCardSkeleton() {
  return (
    <SkeletonCard className="animate-pulse">
      <SkeletonBar className="h-4 w-12" />
      <div className="mt-4 grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <SkeletonBar className="h-3 w-16" />
            <SkeletonBar className="mt-2 h-5 w-24" />
          </div>
        ))}
      </div>
      <SkeletonBar className="mt-4 h-3 w-3/4" />
    </SkeletonCard>
  );
}

export default async function AssetsCard(props: Props) {
  const userId = await requireUserId();
  const fmt = amountFormatter(props.hidden);
  const fmtUsd = amountFormatter(props.hidden, "USD");

  const holdings = await getHoldings(userId);
  const hasUs = holdings.some((h) => h.market === "US");

  // 有美股持股、或有美元現金，都需要匯率才能併入台幣合計
  const needsFx = hasUs || Number(props.cashUsd) > 0;

  const [book, fx] = await Promise.all([
    getQuotes(holdings.map((h) => ({ symbol: h.symbol, market: h.market }))),
    needsFx ? getUsdToTwd() : Promise.resolve(null),
  ]);

  // 有持股明細就用它算投資部位；沒有才退回設定頁手動維護的數值
  const portfolio =
    holdings.length > 0
      ? valuePortfolio(
          holdings.map((h) => ({
            ...h,
            currency: h.market === "US" ? ("USD" as const) : ("TWD" as const),
          })),
          book.quotes,
          fx?.usdToTwd ?? null,
        )
      : null;

  const assets = assetSummary({
    startingCash: props.startingCash,
    allTimeIncome: props.allTimeIncome,
    allTimeConsumption: props.allTimeConsumption,
    allTimeInvestment: props.allTimeInvestment,
    avgMonthlyConsumption: props.avgMonthlyConsumption,
    cashUsd: props.cashUsd,
    usdToTwd: fx?.usdToTwd ?? null,
    portfolio: portfolio
      ? {
          cost: portfolio.totalCost,
          value: portfolio.totalValue,
          byCurrency: portfolio.byCurrency,
        }
      : null,
  });

  const gainUp = assets.unrealizedGain
    ? !assets.unrealizedGain.isNegative()
    : true;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-slate-600">資產</h2>
        {portfolio?.quoteDate && (
          <span className="text-xs text-slate-400">報價 {portfolio.quoteDate}</span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-4">
        <Stat
          label="現金"
          value={fmt(assets.cash)}
          sub={assets.cashUsd.greaterThan(0) ? fmtUsd(assets.cashUsd) : null}
        />
        <Stat
          label="緊急預備金"
          value={
            assets.emergencyMonths === null
              ? "—"
              : `${assets.emergencyMonths.toFixed(1)} 個月`
          }
          tone={
            assets.emergencyMonths !== null && assets.emergencyMonths < 3
              ? "text-amber-600"
              : "text-slate-900"
          }
        />
        <Stat
          label="投資"
          value={fmt(assets.investmentTwd)}
          sub={
            assets.investmentUsd.greaterThan(0)
              ? fmtUsd(assets.investmentUsd)
              : null
          }
        />
        <Stat
          label="總資產"
          value={fmt(assets.netWorth)}
          sub={fx ? `美元匯率 ${fx.usdToTwd.toFixed(2)}` : null}
        />
      </div>

      {assets.unrealizedGain && (
        <p className="mt-3 text-xs text-slate-400">
          投資成本 {fmt(assets.investmentCost)}，未實現損益{" "}
          <span className={gainUp ? "text-emerald-600" : "text-red-600"}>
            {gainUp ? "+" : ""}
            {fmt(assets.unrealizedGain)}
            {assets.unrealizedGainRatio !== null && (
              <>
                {" ("}
                {assets.unrealizedGainRatio > 0 ? "+" : ""}
                {formatPercent(assets.unrealizedGainRatio, 1)}
                {")"}
              </>
            )}
          </span>
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        {assets.emergencyMonths === null
          ? "累積一個月的消費紀錄後，就能算出緊急預備金可以撐多久。"
          : "緊急預備金只算現金，不含投資 — 真的需要用錢時不該被迫在低點賣股。"}
        {portfolio
          ? [
              portfolio.missingQuotes > 0
                ? `　${portfolio.missingQuotes} 檔查無報價，以成本計入。`
                : "",
              portfolio.missingFx > 0
                ? `　取不到美元匯率，${portfolio.missingFx} 檔美股未併入合計。`
                : "",
            ].join("")
          : "　到「持股」頁登錄持股，投資市值就會用公開報價自動計算。"}
      </p>
    </section>
  );
}
