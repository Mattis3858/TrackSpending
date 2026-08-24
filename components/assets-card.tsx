import { requireUserId } from "@/lib/auth";
import { getHoldings } from "@/lib/queries";
import { fetchQuotes } from "@/lib/quotes";
import { fetchUsdToTwd } from "@/lib/fx";
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
  startingInvestment: string;
  investmentValue: string | null;
  allTimeIncome: string;
  allTimeConsumption: string;
  allTimeInvestment: string;
  avgMonthlyConsumption: string | null;
};

function Stat({
  label,
  value,
  tone = "text-slate-900",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`tabular mt-0.5 text-base font-semibold ${tone}`}>{value}</p>
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

  const holdings = await getHoldings(userId);
  const usSymbols = holdings.filter((h) => h.market === "US").map((h) => h.symbol);

  const [book, fx] = await Promise.all([
    fetchQuotes(usSymbols),
    usSymbols.length > 0 ? fetchUsdToTwd() : Promise.resolve(null),
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
    startingInvestment: props.startingInvestment,
    investmentValue: props.investmentValue,
    allTimeIncome: props.allTimeIncome,
    allTimeConsumption: props.allTimeConsumption,
    allTimeInvestment: props.allTimeInvestment,
    avgMonthlyConsumption: props.avgMonthlyConsumption,
    portfolio: portfolio
      ? { cost: portfolio.totalCost, value: portfolio.totalValue }
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
        <Stat label="現金" value={fmt(assets.cash)} />
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
          value={fmt(assets.investmentValue ?? assets.investmentCost)}
        />
        <Stat label="總資產" value={fmt(assets.netWorth)} />
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
          : "　投資現值目前是手動維護的，到「持股」頁登錄持股就會自動更新。"}
      </p>
    </section>
  );
}
