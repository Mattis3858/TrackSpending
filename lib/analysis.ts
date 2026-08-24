/**
 * 衍生分析 — 見 SPEC 第 8.5 節
 *
 * 跟 lib/reports.ts 一樣是純函式、不碰資料庫，全部由 lib/analysis.test.ts 覆蓋。
 * reports.ts 負責「單月加總」，這裡負責「從加總再推出來的東西」：
 * 消費速度、每日可用額度、資產與緊急預備金、分類月變化。
 */

import { daysInMonth, type YearMonth, type Ymd } from "./date";
import { Decimal, ZERO, money, type MoneyInput } from "./money";
import type { CategoryBreakdownItem } from "./reports";

// ───────────────────────────── 消費速度 / 每日可用額度

export type MonthPace = {
  /** 當月總天數 */
  totalDays: number;
  /** 已經過完的天數（過去的月份 = 總天數，未來的月份 = 0） */
  elapsedDays: number;
  /** 還剩幾天可以花，包含今天 */
  remainingDays: number;
  /** 日均消費 = 已花的消費 ÷ 已過天數。分母用已過天數而不是總天數，否則月中會嚴重低估 */
  dailyAverage: Decimal;
  /** 照這個速度，月底預計會花多少 */
  projectedTotal: Decimal;
  /** 月消費預算，沒設定就是 null */
  budget: Decimal | null;
  /** 預算剩下多少 */
  budgetRemaining: Decimal | null;
  /** 接下來每天可以花多少（含今天）。沒預算或月份已結束時為 null */
  dailyAllowance: Decimal | null;
  /** 已經超出預算 */
  overBudget: boolean;
};

export function monthPace(input: {
  yearMonth: YearMonth;
  today: Ymd;
  /** 當月已發生的消費支出（不含儲蓄與投資） */
  consumptionSoFar: MoneyInput;
  budget?: MoneyInput | null;
}): MonthPace {
  const totalDays = daysInMonth(input.yearMonth);
  const currentMonth = input.today.slice(0, 7);
  const consumption = money(input.consumptionSoFar);

  let elapsedDays: number;
  let remainingDays: number;

  if (input.yearMonth < currentMonth) {
    elapsedDays = totalDays;
    remainingDays = 0;
  } else if (input.yearMonth > currentMonth) {
    elapsedDays = 0;
    remainingDays = totalDays;
  } else {
    elapsedDays = Number(input.today.slice(8, 10));
    // 今天還沒過完，所以剩餘天數包含今天
    remainingDays = totalDays - elapsedDays + 1;
  }

  const dailyAverage =
    elapsedDays > 0 ? consumption.dividedBy(elapsedDays) : ZERO;
  const projectedTotal =
    elapsedDays > 0 ? dailyAverage.times(totalDays) : ZERO;

  const budget =
    input.budget === null || input.budget === undefined
      ? null
      : money(input.budget);
  const budgetRemaining = budget ? budget.minus(consumption) : null;
  const dailyAllowance =
    budgetRemaining && remainingDays > 0
      ? budgetRemaining.dividedBy(remainingDays)
      : null;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    dailyAverage,
    projectedTotal,
    budget,
    budgetRemaining,
    dailyAllowance,
    overBudget: budgetRemaining !== null && budgetRemaining.isNegative(),
  };
}

/**
 * 沒有手動設定月預算時，用「近期收入 × (1 − 目標儲蓄率)」推算。
 * 剛進職場收入還不穩定，用目標反推比固定預算實際。
 */
export function budgetFromTarget(
  monthlyIncome: MoneyInput,
  targetSavingsRate: number | null | undefined,
): Decimal | null {
  if (targetSavingsRate === null || targetSavingsRate === undefined) return null;
  if (targetSavingsRate < 0 || targetSavingsRate >= 100) return null;
  const income = money(monthlyIncome);
  if (!income.greaterThan(0)) return null;
  return income.times(100 - targetSavingsRate).dividedBy(100);
}

// ───────────────────────────── 資產與緊急預備金

export type AssetSummary = {
  /** 隨時可動用的現金（含儲蓄，不含投資） */
  cash: Decimal;
  /** 投資的累計投入成本 */
  investmentCost: Decimal;
  /** 投資現值，需要使用者手動更新；沒填就是 null */
  investmentValue: Decimal | null;
  /** 未實現損益 = 現值 − 成本 */
  unrealizedGain: Decimal | null;
  /** 報酬率 = 未實現損益 ÷ 成本。成本為 0 時無法計算，回傳 null */
  unrealizedGainRatio: number | null;
  /** 總資產：現金 + 投資（有現值用現值，否則用成本） */
  netWorth: Decimal;
  /** 緊急預備金可以撐幾個月 = 現金 ÷ 月均消費。沒有消費資料時為 null */
  emergencyMonths: number | null;
};

export function assetSummary(input: {
  /** 開始記帳前手上的現金 */
  startingCash: MoneyInput;
  /** 開始記帳前的投資成本 */
  startingInvestment: MoneyInput;
  /** 使用者手動填的投資現值 */
  investmentValue?: MoneyInput | null;
  /** 開始記帳以來的總收入 */
  allTimeIncome: MoneyInput;
  /** 開始記帳以來的總消費支出（不含儲蓄與投資） */
  allTimeConsumption: MoneyInput;
  /** 開始記帳以來投入投資的金額 */
  allTimeInvestment: MoneyInput;
  /** 月均消費，用來算緊急預備金月數 */
  avgMonthlyConsumption?: MoneyInput | null;
}): AssetSummary {
  const income = money(input.allTimeIncome);
  const consumption = money(input.allTimeConsumption);
  const invested = money(input.allTimeInvestment);

  // 存下來的錢 = 收入 − 消費。這個算法不依賴使用者有沒有乖乖記「儲蓄」那筆交易，
  // 錢只要沒花掉就算存下來了。其中投入投資的部分要扣掉，因為它已經不是現金。
  const cash = money(input.startingCash).plus(income).minus(consumption).minus(invested);
  const investmentCost = money(input.startingInvestment).plus(invested);

  const investmentValue =
    input.investmentValue === null || input.investmentValue === undefined
      ? null
      : money(input.investmentValue);

  const avg =
    input.avgMonthlyConsumption === null || input.avgMonthlyConsumption === undefined
      ? null
      : money(input.avgMonthlyConsumption);

  const unrealizedGain = investmentValue
    ? investmentValue.minus(investmentCost)
    : null;

  return {
    cash,
    investmentCost,
    investmentValue,
    unrealizedGain,
    unrealizedGainRatio:
      unrealizedGain && investmentCost.greaterThan(0)
        ? unrealizedGain.dividedBy(investmentCost).toNumber()
        : null,
    netWorth: cash.plus(investmentValue ?? investmentCost),
    emergencyMonths:
      avg && avg.greaterThan(0) ? cash.dividedBy(avg).toNumber() : null,
  };
}

// ───────────────────────────── 月度歷史

export type MonthlyTotal = {
  yearMonth: YearMonth;
  income: Decimal;
  consumption: Decimal;
  savings: Decimal;
  investment: Decimal;
};

/**
 * 近 N 個月的平均消費，用來估緊急預備金月數。
 * 排除當月（還沒過完，會低估），沒有完整月份資料時才退而用當月。
 */
export function averageMonthlyConsumption(
  history: MonthlyTotal[],
  currentYearMonth: YearMonth,
  months = 3,
): Decimal | null {
  const complete = history.filter((h) => h.yearMonth < currentYearMonth);
  const pool = complete.length > 0 ? complete : history;
  if (pool.length === 0) return null;

  const recent = [...pool]
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1))
    .slice(0, months);

  const total = recent.reduce<Decimal>((acc, h) => acc.plus(h.consumption), ZERO);
  return total.dividedBy(recent.length);
}

/** 儲蓄率的拆解：存下來的錢有多少已明確投入，多少還躺在帳上 */
export type SavingsBreakdown = {
  /** 明確記錄為儲蓄或投資的金額 */
  setAside: Decimal;
  /** 收入減消費後，沒有明確歸類、還留在帳上的錢 */
  unallocated: Decimal;
  /** setAside 佔收入比例 */
  setAsideRatio: number | null;
  /** unallocated 佔收入比例 */
  unallocatedRatio: number | null;
};

export function savingsBreakdown(input: {
  totalIncome: MoneyInput;
  /** 收入 − 消費支出 */
  actualSaved: MoneyInput;
  /** 明確記為儲蓄 + 投資的金額 */
  savingsExpense: MoneyInput;
}): SavingsBreakdown {
  const income = money(input.totalIncome);
  const setAside = money(input.savingsExpense);
  const unallocated = money(input.actualSaved).minus(setAside);
  const ratio = (v: Decimal) =>
    income.greaterThan(0) ? v.dividedBy(income).toNumber() : null;

  return {
    setAside,
    unallocated,
    setAsideRatio: ratio(setAside),
    unallocatedRatio: ratio(unallocated),
  };
}

// ───────────────────────────── 分類月變化

export type CategoryDeltaItem = {
  categoryId: string | null;
  name: string;
  color: string | null;
  current: Decimal;
  previous: Decimal;
  delta: Decimal;
  /** 變化比例；上月為 0 時無法計算，回傳 null（顯示成「新增」） */
  changeRatio: number | null;
};

/** 本月 vs 上月的分類消費變化，依變化幅度由大到小排序 */
export function categoryDelta(
  current: CategoryBreakdownItem[],
  previous: CategoryBreakdownItem[],
): CategoryDeltaItem[] {
  const key = (i: { categoryId: string | null }) => i.categoryId ?? "__none__";
  const prevMap = new Map(previous.map((i) => [key(i), i]));
  const currMap = new Map(current.map((i) => [key(i), i]));

  const items: CategoryDeltaItem[] = [];

  for (const k of new Set([...currMap.keys(), ...prevMap.keys()])) {
    const c = currMap.get(k);
    const p = prevMap.get(k);
    const source = c ?? p;
    if (!source) continue;

    const currentAmount = c?.amount ?? ZERO;
    const previousAmount = p?.amount ?? ZERO;
    const delta = currentAmount.minus(previousAmount);
    if (delta.isZero()) continue;

    items.push({
      categoryId: source.categoryId,
      name: source.name,
      color: source.color,
      current: currentAmount,
      previous: previousAmount,
      delta,
      changeRatio: previousAmount.greaterThan(0)
        ? delta.dividedBy(previousAmount).toNumber()
        : null,
    });
  }

  return items.sort((a, b) => b.delta.abs().comparedTo(a.delta.abs()));
}
