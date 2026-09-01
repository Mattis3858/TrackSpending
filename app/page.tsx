import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import {
  getCategories,
  getFrequentCategoryIds,
  getLastUsedCategoryId,
  getMonthlyTotals,
  getTransactionsForMonth,
  getRecurringTemplates,
  getUserSetting,
  sumMonthlyTotals,
} from "@/lib/queries";
import { readYearMonth } from "@/lib/params";
import { ensureProvisioned } from "@/lib/provisioning";
import { expenseByCategory, summarizeMonth } from "@/lib/reports";
import {
  averageMonthlyConsumption,
  averageMonthlyFixed,
  averageMonthlyIncome,
  budgetFromTarget,
  bufferFund,
  monthPace,
  savingsBreakdown,
} from "@/lib/analysis";
import { Suspense } from "react";
import AssetsCard, { AssetsCardSkeleton } from "@/components/assets-card";
import { ZERO, amountFormatter, formatPercent, money, sum } from "@/lib/money";
import { getHideAmounts } from "@/lib/preferences";
import { setHideAmounts } from "./actions/preferences";
import AmountVisibilityToggle from "@/components/amount-visibility-toggle";
import { addDays, currentYearMonth, todayTaipei } from "@/lib/date";
import type { TransactionInput } from "@/lib/validation";
import { createTransaction } from "./actions/transactions";
import MonthSwitcher from "@/components/month-switcher";
import BottomNav from "@/components/bottom-nav";
import CategoryPie, { type PieDatum } from "@/components/category-pie";
import QuickAddSheet from "@/components/quick-add-sheet";
import { signOut } from "./actions/auth";

const FALLBACK_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#94a3b8",
];

function Card({
  title,
  children,
  note,
}: {
  title: string;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <h2 className="text-sm font-medium text-slate-600">{title}</h2>
      <div className="mt-3">{children}</div>
      {note && <p className="mt-3 text-xs text-slate-400">{note}</p>}
    </section>
  );
}

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

export default async function HomePage(props: PageProps<"/">) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  const ym = readYearMonth(searchParams.m);

  const [
    txs,
    initialCategories,
    frequentIds,
    lastUsedCategoryId,
    history,
    setting,
    templates,
  ] =
    await Promise.all([
      getTransactionsForMonth(userId, ym),
      getCategories(userId),
      getFrequentCategoryIds(userId),
      getLastUsedCategoryId(userId),
      getMonthlyTotals(userId),
      getUserSetting(userId),
      getRecurringTemplates(userId),
    ]);

  // 新註冊的使用者還沒有分類，第一次進來時補上（冪等，已有就什麼都不做）
  const provision = await ensureProvisioned(userId, initialCategories.length > 0);
  const categories = provision.created
    ? await getCategories(userId)
    : initialCategories;

  const summary = summarizeMonth(txs);
  const hidden = await getHideAmounts();
  const fmt = amountFormatter(hidden);
  const today = todayTaipei();
  const thisMonth = currentYearMonth();
  const allTime = sumMonthlyTotals(history);

  // 預算：手動設定優先；沒設就用「收入 x (1 - 目標儲蓄率)」推算。
  //
  // 收入取「本月已記錄」與「近期月均」的較大者。月初薪水還沒入帳時，
  // 若直接用當月已記錄的（可能只有一筆小額進帳），預算會被錨定在極低
  // 的數字上，每日額度就會荒謬地小。等薪水入帳、實際超過歷史值之後，
  // 就自動改用實際收入。
  const avgIncome = averageMonthlyIncome(history, thisMonth);
  const incomeEstimated = Boolean(
    avgIncome && avgIncome.greaterThan(summary.totalIncome),
  );
  const expectedIncome = incomeEstimated ? avgIncome! : summary.totalIncome;

  const budget = setting.monthlyBudget
    ? money(setting.monthlyBudget)
    : budgetFromTarget(expectedIncome, setting.targetSavingsRate);

  // 每月跑不掉的固定支出。範本是使用者自己填的精確值，歷史平均是
  // 沒填範本時的後備；取較大者，寧可保守也不要高估可用額度。
  const templateFixed = sum(
    templates.filter((t) => t.active).map((t) => t.amount),
  );
  const historyFixed = averageMonthlyFixed(history, thisMonth) ?? ZERO;
  const expectedFixed = templateFixed.greaterThan(historyFixed)
    ? templateFixed
    : historyFixed;

  const pace = monthPace({
    yearMonth: ym,
    today,
    // 變動與固定分開傳：日均只能算變動消費，房租那種一次性的大筆
    // 混進日均再乘天數會嚴重高估
    variableSoFar: summary.variableExpense,
    fixedSoFar: summary.fixedExpense,
    expectedFixed,
    budget,
  });

  const avgConsumption = averageMonthlyConsumption(history, thisMonth);

  // 緩衝資金：扣掉「跑不掉的」與「照目前速度會花掉的」之後還剩多少
  // 有手動設定月預算時以它為基準：使用者已經明確表達「這個月我打算花多少」，
  // 那比系統用歷史推估的收入更能代表意圖。
  const bufferBasis = budget ?? expectedIncome;

  const buffer = bufferFund({
    income: bufferBasis,
    fixedSoFar: summary.fixedExpense,
    variableSoFar: summary.variableExpense,
    elapsedDays: pace.elapsedDays,
    totalDays: pace.totalDays,
    historicalFixed: expectedFixed,
  });

  const breakdown = savingsBreakdown({
    totalIncome: summary.totalIncome,
    actualSaved: summary.actualSaved,
    savingsExpense: summary.savingsExpense,
  });

  const pieData: PieDatum[] = expenseByCategory(txs).map((item, i) => ({
    name: item.name,
    label: fmt(item.amount),
    value: Number(item.amount.toFixed(2)),
    ratio: item.ratio,
    color: item.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));

  const isCurrentMonth = ym === thisMonth;
  const setAsidePct = Math.max(0, Math.round((breakdown.setAsideRatio ?? 0) * 100));
  const unallocatedPct = Math.max(
    0,
    Math.round((breakdown.unallocatedRatio ?? 0) * 100),
  );

  async function quickAdd(input: TransactionInput) {
    "use server";
    return createTransaction(input);
  }

  return (
    <>
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-4 pb-24">
          <header className="flex items-center justify-between">
            <MonthSwitcher ym={ym} basePath="/" />
            <div className="flex items-center gap-1">
              <AmountVisibilityToggle hidden={hidden} onToggleAction={setHideAmounts} />
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
                >
                  登出
                </button>
              </form>
            </div>
          </header>

          {/* 每日可用額度：最能當場改變決策的數字，放最上面 */}
          <section className="rounded-2xl bg-slate-900 px-5 py-6 text-white">
            {isCurrentMonth && pace.dailyAllowance ? (
              <>
                <p className="text-sm text-slate-400">
                  接下來每天可以花（還有 {pace.remainingDays} 天）
                </p>
                <p className="tabular mt-1 text-5xl font-semibold tracking-tight">
                  {pace.overBudget
                    ? fmt(0)
                    : fmt(pace.dailyAllowance.toFixed(0))}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {pace.overBudget
                    ? `已超出本月預算 ${fmt(pace.budgetRemaining!.abs())}`
                    : `本月預算 ${fmt(pace.budget!)}${
                        incomeEstimated ? "（依近期收入推估）" : ""
                      }，已用 ${fmt(summary.consumptionExpense)}${
                        pace.upcomingFixed.greaterThan(0)
                          ? `，另有固定支出 ${fmt(pace.upcomingFixed)} 尚未支付`
                          : ""
                      }`}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-400">儲蓄率</p>
                <p className="tabular mt-1 text-5xl font-semibold tracking-tight">
                  {formatPercent(summary.savingsRate)}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  {summary.savingsRate === null
                    ? "這個月還沒有收入紀錄"
                    : `實際存下 ${fmt(summary.actualSaved)}`}
                  {isCurrentMonth && !budget && " · 到設定填目標儲蓄率可看每日額度"}
                </p>
              </>
            )}
          </section>

          {/* 儲蓄率拆解 */}
          {summary.savingsRate !== null && (
            <Card title="儲蓄率">
              <div className="flex items-baseline gap-3">
                <span className="tabular text-3xl font-semibold">
                  {formatPercent(summary.savingsRate)}
                </span>
                <span className="text-sm text-slate-500">
                  實際存下 {fmt(summary.actualSaved)}
                </span>
              </div>

              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${setAsidePct}%` }}
                />
                <div
                  className="bg-emerald-200"
                  style={{ width: `${unallocatedPct}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  已投入儲蓄／投資 {fmt(breakdown.setAside)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-200" />
                  還在帳上 {fmt(breakdown.unallocated)}
                </span>
              </div>
            </Card>
          )}

          {/* 本月數字 */}
          <section className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <Stat
              label="收入"
              value={fmt(summary.totalIncome)}
              tone="text-emerald-600"
            />
            <Stat label="消費" value={fmt(summary.consumptionExpense)} />
            <Stat
              label="結餘"
              value={fmt(summary.balance)}
              tone={summary.balance.isNegative() ? "text-red-600" : "text-slate-900"}
            />
          </section>

          {/* 消費速度 */}
          <Card
            title="消費速度"
            note={
              pace.projectionReliable
                ? `日均只算變動消費（餐食、飲料、交通這類日常）。房租、訂閱是整月一次的大筆支出，混進日均再乘天數會嚴重高估，所以月底預測是「變動日均 × 天數 + 整月固定支出 ${fmt(expectedFixed)}」。`
                : `月初資料還太少，任何一筆消費乘上整月天數都會失真，所以先不顯示預測。過幾天就會出現。`
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label={`日均變動消費（已過 ${pace.elapsedDays} 天）`}
                value={fmt(pace.dailyAverage.toFixed(0))}
              />
              <Stat
                label={isCurrentMonth ? "照這速度月底約" : "當月總消費"}
                value={
                  pace.projectionReliable
                    ? fmt(pace.projectedTotal.toFixed(0))
                    : "—"
                }
                tone={
                  pace.projectionReliable &&
                  pace.budget &&
                  pace.projectedTotal.greaterThan(pace.budget)
                    ? "text-red-600"
                    : "text-slate-900"
                }
              />
            </div>
          </Card>

          {/* 緩衝／娛樂資金 */}
          {summary.totalIncome.greaterThan(0) && (
            <Card
              title="緩衝／娛樂資金"
              note={
                !buffer.projectionReliable
                  ? "月初的變動消費資料還太少，外推出來的數字沒有意義，過幾天再看。"
                  : buffer.fixedEstimated
                    ? "固定支出用近三個月推估（本月的房租等還沒記錄）。低估支出會高估緩衝，寧可保守。"
                    : `扣掉每月跑不掉的固定支出，再扣掉照目前速度會花掉的變動消費之後，剩下可以自由運用的錢。基準是${
                        setting.monthlyBudget ? "你設定的月預算" : "推估的月收入"
                      }。`
              }
            >
              <p
                className={
                  buffer.projectionReliable && buffer.buffer.isNegative()
                    ? "tabular text-3xl font-semibold text-red-600"
                    : "tabular text-3xl font-semibold"
                }
              >
                {buffer.projectionReliable ? fmt(buffer.buffer.toFixed(0)) : "—"}
              </p>

              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <p className="tabular">
                  {setting.monthlyBudget ? "月預算" : "收入"} {fmt(buffer.income)} − 固定支出{" "}
                  {fmt(buffer.fixed)} − 預估變動消費{" "}
                  {buffer.projectionReliable
                    ? fmt(buffer.variableProjected.toFixed(0))
                    : "—"}
                </p>
                <p className="tabular">
                  變動消費目前已花 {fmt(buffer.variableSoFar)}
                  {pace.elapsedDays > 0 &&
                    `，日均 ${fmt(buffer.variableSoFar.dividedBy(pace.elapsedDays).toFixed(0))}`}
                </p>
              </div>
            </Card>
          )}

          {/* 資產：唯一需要外部報價 API 的區塊，串流載入避免拖慢整頁 */}
          <Suspense fallback={<AssetsCardSkeleton />}>
            <AssetsCard
              hidden={hidden}
              startingCash={setting.startingCash}
              cashUsd={setting.cashUsd}
              allTimeIncome={allTime.income.toFixed(2)}
              allTimeConsumption={allTime.consumption.toFixed(2)}
              allTimeInvestment={allTime.investment.toFixed(2)}
              avgMonthlyConsumption={
                avgConsumption ? avgConsumption.toFixed(2) : null
              }
            />
          </Suspense>

          {/* 分類圓餅圖 */}
          <Card title="消費分類">
            <CategoryPie data={pieData} />
          </Card>

          <Link
            href={`/transactions?m=${ym}`}
            className="block rounded-xl border border-slate-300 bg-white px-4 py-3 text-center text-base font-medium text-slate-700 hover:bg-slate-50"
          >
            交易明細
          </Link>
        </div>
      </main>

      <QuickAddSheet
        categories={categories}
        frequentIds={frequentIds}
        lastUsedCategoryId={lastUsedCategoryId}
        today={today}
        yesterday={addDays(today, -1)}
        onSubmitAction={quickAdd}
      />
      <BottomNav />
    </>
  );
}
