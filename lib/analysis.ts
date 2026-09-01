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
  /** 預算剩下多少（還含著尚未支付的固定支出） */
  budgetRemaining: Decimal | null;
  /** 本月還沒發生、但跑不掉的固定支出（房租、訂閱等） */
  upcomingFixed: Decimal;
  /** 真正可以自由花用的餘額 = 預算剩餘 − 尚未支付的固定支出 */
  spendableRemaining: Decimal | null;
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
  /**
   * 本月還沒發生、但跑不掉的固定支出。
   *
   * 沒有這個，月初會系統性高估：預算裡還含著房租那筆錢，系統卻把它
   * 算成可以自由花用的。等房租記進去，額度又會突然腰斬——不是處境變了，
   * 是之前算錯了。
   */
  upcomingFixed?: MoneyInput;
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

  const upcomingFixed =
    input.upcomingFixed === undefined ? ZERO : money(input.upcomingFixed);
  const spendableRemaining = budgetRemaining
    ? budgetRemaining.minus(upcomingFixed)
    : null;

  const dailyAllowance =
    spendableRemaining && remainingDays > 0
      ? spendableRemaining.dividedBy(remainingDays)
      : null;

  return {
    totalDays,
    elapsedDays,
    remainingDays,
    dailyAverage,
    projectedTotal,
    budget,
    budgetRemaining,
    upcomingFixed,
    spendableRemaining,
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
  /** 台幣現金（含儲蓄，不含投資） */
  cash: Decimal;
  /** 美元現金（原幣別），例如複委託帳戶裡的餘額 */
  cashUsd: Decimal;
  /** 全部現金換算台幣後的合計；缺匯率時等於台幣現金 */
  cashTotalTwd: Decimal;
  /** 台股部位市值（台幣） */
  investmentTwd: Decimal;
  /** 美股部位市值（美元原幣別） */
  investmentUsd: Decimal;
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
  /** 開始記帳以來的總收入 */
  allTimeIncome: MoneyInput;
  /** 開始記帳以來的總消費支出（不含儲蓄與投資） */
  allTimeConsumption: MoneyInput;
  /** 開始記帳以來投入投資的金額 */
  allTimeInvestment: MoneyInput;
  /** 月均消費，用來算緊急預備金月數 */
  avgMonthlyConsumption?: MoneyInput | null;
  /** 美元現金（原幣別） */
  cashUsd?: MoneyInput;
  /** 美元匯率，用來把美元現金與美股併入台幣合計 */
  usdToTwd?: MoneyInput | null;
  /**
   * 投資部位的唯一來源：持股明細算出來的成本與市值。
   * 沒有持股紀錄時傳 null，投資成本就退回「記帳期間投入投資的金額」，
   * 而且沒有市值（不能假裝知道市價）。
   * cost / value 是台幣合計；byCurrency 是分幣別的原幣金額。
   */
  portfolio?: {
    cost: MoneyInput;
    value: MoneyInput;
    byCurrency?: {
      twd: { cost: MoneyInput; value: MoneyInput };
      usd: { cost: MoneyInput; value: MoneyInput };
    };
  } | null;
}): AssetSummary {
  const income = money(input.allTimeIncome);
  const consumption = money(input.allTimeConsumption);
  const invested = money(input.allTimeInvestment);

  // 存下來的錢 = 收入 − 消費。這個算法不依賴使用者有沒有乖乖記「儲蓄」那筆交易，
  // 錢只要沒花掉就算存下來了。其中投入投資的部分要扣掉，因為它已經不是現金。
  const cash = money(input.startingCash).plus(income).minus(consumption).minus(invested);

  // 有持股明細就以它為準；沒有才退回手動維護的設定值
  const usePortfolio = Boolean(input.portfolio);
  const investmentCost = usePortfolio
    ? money(input.portfolio!.cost)
    : invested;

  // 沒有持股就沒有市值可言，不用成本冒充現值
  const investmentValue = usePortfolio ? money(input.portfolio!.value) : null;

  const avg =
    input.avgMonthlyConsumption === null || input.avgMonthlyConsumption === undefined
      ? null
      : money(input.avgMonthlyConsumption);

  const fx =
    input.usdToTwd === null || input.usdToTwd === undefined
      ? null
      : money(input.usdToTwd);

  const cashUsd = input.cashUsd === undefined ? ZERO : money(input.cashUsd);
  // 缺匯率時不亂猜，美元現金就先不併入台幣合計
  const cashTotalTwd = fx ? cash.plus(cashUsd.times(fx)) : cash;

  const investmentTwd = input.portfolio?.byCurrency
    ? money(input.portfolio.byCurrency.twd.value)
    : (investmentValue ?? investmentCost);
  const investmentUsd = input.portfolio?.byCurrency
    ? money(input.portfolio.byCurrency.usd.value)
    : ZERO;

  const unrealizedGain = investmentValue
    ? investmentValue.minus(investmentCost)
    : null;

  return {
    cash,
    cashUsd,
    cashTotalTwd,
    investmentTwd,
    investmentUsd,
    investmentCost,
    investmentValue,
    unrealizedGain,
    unrealizedGainRatio:
      unrealizedGain && investmentCost.greaterThan(0)
        ? unrealizedGain.dividedBy(investmentCost).toNumber()
        : null,
    netWorth: cashTotalTwd.plus(investmentValue ?? investmentCost),
    // 美元現金同樣是隨時可動用的，要併進緊急預備金
    emergencyMonths:
      avg && avg.greaterThan(0) ? cashTotalTwd.dividedBy(avg).toNumber() : null,
  };
}

// ───────────────────────────── 月度歷史

export type MonthlyTotal = {
  yearMonth: YearMonth;
  income: Decimal;
  /** 消費支出合計 = 固定 + 變動 */
  consumption: Decimal;
  /** 其中的固定支出（房租、水電、訂閱等） */
  fixed: Decimal;
  savings: Decimal;
  investment: Decimal;
};

/** 取最近 N 個完整月份；沒有完整月份時才退而用當月 */
function recentMonths(
  history: MonthlyTotal[],
  currentYearMonth: YearMonth,
  months: number,
): MonthlyTotal[] {
  const complete = history.filter((h) => h.yearMonth < currentYearMonth);
  const pool = complete.length > 0 ? complete : history;
  return [...pool]
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1))
    .slice(0, months);
}

/**
 * 近 N 個月的平均消費，用來估緊急預備金月數。
 * 排除當月（還沒過完，會低估），沒有完整月份資料時才退而用當月。
 */
export function averageMonthlyConsumption(
  history: MonthlyTotal[],
  currentYearMonth: YearMonth,
  months = 3,
): Decimal | null {
  const recent = recentMonths(history, currentYearMonth, months);
  if (recent.length === 0) return null;

  const total = recent.reduce<Decimal>((acc, h) => acc.plus(h.consumption), ZERO);
  return total.dividedBy(recent.length);
}

/**
 * 近期月份的平均收入，給月初「薪水還沒入帳」時推估用。
 *
 * 為什麼需要：預算是 `收入 × (1 − 目標儲蓄率)`。月初只記了一筆小額
 * 收入（例如家人給的），若直接拿它當全月收入，預算會被錨定在極低的
 * 數字上——**部分收入比完全沒有收入更糟**，因為後者還會觸發後備機制。
 *
 * 跟固定支出一樣排除當月（當月的收入還沒收完）。
 */
export function averageMonthlyIncome(
  history: MonthlyTotal[],
  currentYearMonth: YearMonth,
  months = 3,
): Decimal | null {
  const complete = history.filter((h) => h.yearMonth < currentYearMonth);
  if (complete.length === 0) return null;

  const recent = [...complete]
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1))
    .slice(0, months);

  const total = recent.reduce<Decimal>((acc, h) => acc.plus(h.income), ZERO);
  return total.dividedBy(recent.length);
}

/**
 * 近期月份的固定支出參考值，給緩衝資金在「本月房租還沒記」時推估用。
 * 跟月均消費一樣排除當月——當月固定支出還沒發生完，拿來當參考會低估。
 */
export function averageMonthlyFixed(
  history: MonthlyTotal[],
  currentYearMonth: YearMonth,
  months = 3,
): Decimal | null {
  const complete = history.filter((h) => h.yearMonth < currentYearMonth);
  if (complete.length === 0) return null;

  const recent = [...complete]
    .sort((a, b) => (a.yearMonth < b.yearMonth ? 1 : -1))
    .slice(0, months);

  const total = recent.reduce<Decimal>((acc, h) => acc.plus(h.fixed), ZERO);
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

// ───────────────────────────── 持股估值

export type HoldingCurrency = "TWD" | "USD";

export type HoldingInput = {
  symbol: string;
  name: string;
  shares: MoneyInput;
  /** 累計投入成本（總額，以該檔的計價幣別表示） */
  cost: MoneyInput;
  /** 預設台幣；複委託標的是美元 */
  currency?: HoldingCurrency;
};

/** 只需要價格與日期，不必把整個 Quote 型別帶進純函式層 */
export type QuoteLike = { price: MoneyInput; date: string };

export type HoldingValuation = {
  symbol: string;
  name: string;
  currency: HoldingCurrency;
  shares: Decimal;
  /** 以下四項都是「原幣別」金額 */
  cost: Decimal;
  price: Decimal | null;
  value: Decimal | null;
  gain: Decimal | null;
  gainRatio: number | null;
  /** 換算成台幣後的金額；美元部位缺匯率時為 null */
  costTwd: Decimal | null;
  valueTwd: Decimal | null;
  quoteDate: string | null;
};

export type PortfolioSummary = {
  items: HoldingValuation[];
  /** 以下合計一律是台幣 */
  totalCost: Decimal;
  /**
   * 市值合計。查不到報價的部位**以成本計入**，
   * 否則總資產會因為外部 API 出問題而憑空縮水。
   */
  totalValue: Decimal;
  totalGain: Decimal;
  totalGainRatio: number | null;
  /** 有幾檔查不到報價，UI 要據此提示 */
  missingQuotes: number;
  /** 有幾檔因為缺匯率而無法併入台幣合計 */
  missingFx: number;
  /** 這批報價的最新日期 */
  quoteDate: string | null;
  /** 這次採用的美元匯率，沒有就是 null */
  usdToTwd: Decimal | null;
  /**
   * 依幣別的小計，金額是**原幣別**（台股台幣、美股美元），
   * 給「資產要分台幣與美金顯示」用。
   */
  byCurrency: {
    twd: { cost: Decimal; value: Decimal };
    usd: { cost: Decimal; value: Decimal };
  };
};

export function valuePortfolio(
  holdings: HoldingInput[],
  quotes: Map<string, QuoteLike>,
  usdToTwd?: MoneyInput | null,
): PortfolioSummary {
  const fx =
    usdToTwd === null || usdToTwd === undefined ? null : money(usdToTwd);

  const items: HoldingValuation[] = holdings.map((h) => {
    const currency: HoldingCurrency = h.currency ?? "TWD";
    const shares = money(h.shares);
    const cost = money(h.cost);
    const quote = quotes.get(h.symbol);
    const price = quote ? money(quote.price) : null;
    const value = price ? shares.times(price) : null;
    const gain = value ? value.minus(cost) : null;

    // 台幣部位直接用原值；美元部位要有匯率才換算得出來
    const toTwd = (v: Decimal | null): Decimal | null => {
      if (v === null) return null;
      if (currency === "TWD") return v;
      return fx ? v.times(fx) : null;
    };

    return {
      symbol: h.symbol,
      name: h.name,
      currency,
      shares,
      cost,
      price,
      value,
      gain,
      gainRatio:
        gain && cost.greaterThan(0) ? gain.dividedBy(cost).toNumber() : null,
      costTwd: toTwd(cost),
      // 沒有報價時退回成本，總資產才不會因為 API 失敗而暴跌
      valueTwd: toTwd(value ?? cost),
      quoteDate: quote?.date ?? null,
    };
  });

  const totalCost = items.reduce<Decimal>(
    (a, i) => (i.costTwd ? a.plus(i.costTwd) : a),
    ZERO,
  );
  const totalValue = items.reduce<Decimal>(
    (a, i) => (i.valueTwd ? a.plus(i.valueTwd) : a),
    ZERO,
  );
  const totalGain = totalValue.minus(totalCost);

  const dates = items
    .map((i) => i.quoteDate)
    .filter((d): d is string => d !== null)
    .sort();

  // 分幣別小計用原幣別金額，不換算
  const sumBy = (currency: HoldingCurrency) => {
    const picked = items.filter((i) => i.currency === currency);
    return {
      cost: picked.reduce<Decimal>((a, i) => a.plus(i.cost), ZERO),
      // 沒報價的部位退回成本，跟台幣合計的處理一致
      value: picked.reduce<Decimal>((a, i) => a.plus(i.value ?? i.cost), ZERO),
    };
  };

  return {
    items: [...items].sort((a, b) =>
      (b.valueTwd ?? ZERO).comparedTo(a.valueTwd ?? ZERO),
    ),
    totalCost,
    totalValue,
    totalGain,
    totalGainRatio: totalCost.greaterThan(0)
      ? totalGain.dividedBy(totalCost).toNumber()
      : null,
    missingQuotes: items.filter((i) => i.price === null).length,
    missingFx: items.filter((i) => i.costTwd === null).length,
    quoteDate: dates.length > 0 ? dates[dates.length - 1] : null,
    usdToTwd: fx,
    byCurrency: { twd: sumBy("TWD"), usd: sumBy("USD") },
  };
}

// ───────────────────────────── 緩衝／娛樂資金

export type BufferFund = {
  income: Decimal;
  /** 預估的整月固定支出 */
  fixed: Decimal;
  /** 固定支出是用歷史推估的（本月還沒記到房租之類的） */
  fixedEstimated: boolean;
  /** 目前已花的變動消費 */
  variableSoFar: Decimal;
  /** 依目前速度推估的整月變動消費 */
  variableProjected: Decimal;
  /** 緩衝 + 娛樂資金 = 收入 − 固定支出 − 預估變動消費 */
  buffer: Decimal;
  /** 佔收入比例；沒有收入時為 null */
  bufferRatio: number | null;
};

/**
 * 這個月扣掉「跑不掉的」與「照目前速度會花掉的」之後，還剩多少可以自由運用。
 *
 * **日均只用變動消費，不含固定支出。** 房租是某一天的一大筆，混進日均再
 * 乘上天數會嚴重高估——15,000 的房租在第 6 天會讓日均變成 2,600，
 * 乘 30 天就是 78,000。固定支出是整月一次，本來就該分開算。
 *
 * 固定支出取「本月已記錄」與「近期月份參考值」的較大者：月初房租還沒記時
 * 用歷史推估，否則會低估支出、高估緩衝——而高估是比較危險的那個方向。
 */
export function bufferFund(input: {
  income: MoneyInput;
  /** 本月已記錄的固定支出 */
  fixedSoFar: MoneyInput;
  /** 本月已記錄的變動消費 */
  variableSoFar: MoneyInput;
  elapsedDays: number;
  totalDays: number;
  /** 近期月份的固定支出參考值 */
  historicalFixed?: MoneyInput | null;
}): BufferFund {
  const income = money(input.income);
  const fixedSoFar = money(input.fixedSoFar);
  const variableSoFar = money(input.variableSoFar);

  const historical =
    input.historicalFixed === null || input.historicalFixed === undefined
      ? ZERO
      : money(input.historicalFixed);

  const useHistorical = historical.greaterThan(fixedSoFar);
  const fixed = useHistorical ? historical : fixedSoFar;

  const variableProjected =
    input.elapsedDays > 0
      ? variableSoFar.dividedBy(input.elapsedDays).times(input.totalDays)
      : ZERO;

  const buffer = income.minus(fixed).minus(variableProjected);

  return {
    income,
    fixed,
    fixedEstimated: useHistorical,
    variableSoFar,
    variableProjected,
    buffer,
    bufferRatio: income.greaterThan(0)
      ? buffer.dividedBy(income).toNumber()
      : null,
  };
}
