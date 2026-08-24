import { describe, expect, it } from "vitest";
import {
  assetSummary,
  averageMonthlyConsumption,
  budgetFromTarget,
  categoryDelta,
  monthPace,
  savingsBreakdown,
  type MonthlyTotal,
} from "./analysis";
import { Decimal } from "./money";
import type { CategoryBreakdownItem } from "./reports";

describe("monthPace — 消費速度與每日可用額度", () => {
  it("日均用『已過天數』當分母，不是當月總天數", () => {
    // 8/18 已花 18,600。除以 18 是 1,033；除以 31 只有 600，會嚴重低估
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "18600",
    });

    expect(p.elapsedDays).toBe(18);
    expect(p.totalDays).toBe(31);
    expect(p.dailyAverage.toFixed(2)).toBe("1033.33");
  });

  it("月底預測 = 日均 × 當月總天數", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "18600",
    });
    expect(p.projectedTotal.toFixed(0)).toBe("32033");
  });

  it("剩餘天數包含今天", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "0",
    });
    expect(p.remainingDays).toBe(14); // 18~31 共 14 天
  });

  it("每日可用額度 = 預算剩餘 ÷ 剩餘天數", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "18600",
      budget: "31000",
    });

    expect(p.budgetRemaining?.toFixed(0)).toBe("12400");
    expect(p.dailyAllowance?.toFixed(0)).toBe("886"); // 12400 / 14
    expect(p.overBudget).toBe(false);
  });

  it("超出預算時 overBudget 為 true 且剩餘為負", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "35000",
      budget: "31000",
    });
    expect(p.overBudget).toBe(true);
    expect(p.budgetRemaining?.toFixed(0)).toBe("-4000");
  });

  it("月初第一天也能算，不會除以零", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-01",
      consumptionSoFar: "500",
      budget: "31000",
    });
    expect(p.elapsedDays).toBe(1);
    expect(p.remainingDays).toBe(31);
    expect(p.dailyAverage.toFixed(0)).toBe("500");
  });

  it("月底最後一天剩餘天數是 1，不會除以零", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-31",
      consumptionSoFar: "30000",
      budget: "31000",
    });
    expect(p.remainingDays).toBe(1);
    expect(p.dailyAllowance?.toFixed(0)).toBe("1000");
  });

  it("看過去的月份時已結束，沒有每日可用額度", () => {
    const p = monthPace({
      yearMonth: "2026-07",
      today: "2026-08-18",
      consumptionSoFar: "28000",
      budget: "31000",
    });
    expect(p.elapsedDays).toBe(31);
    expect(p.remainingDays).toBe(0);
    expect(p.dailyAllowance).toBeNull();
    // 月份已結束，預測值就等於實際值
    expect(p.projectedTotal.toFixed(0)).toBe("28000");
  });

  it("沒設預算時每日可用額度為 null，但日均仍算得出來", () => {
    const p = monthPace({
      yearMonth: "2026-08",
      today: "2026-08-18",
      consumptionSoFar: "18600",
    });
    expect(p.budget).toBeNull();
    expect(p.dailyAllowance).toBeNull();
    expect(p.dailyAverage.greaterThan(0)).toBe(true);
  });
});

describe("budgetFromTarget", () => {
  it("收入 50,000、目標儲蓄率 30% → 預算 35,000", () => {
    expect(budgetFromTarget("50000", 30)?.toFixed(0)).toBe("35000");
  });

  it("沒有目標或沒有收入時回傳 null", () => {
    expect(budgetFromTarget("50000", null)).toBeNull();
    expect(budgetFromTarget("0", 30)).toBeNull();
    expect(budgetFromTarget("50000", 100)).toBeNull();
  });
});

describe("assetSummary — 資產與緊急預備金", () => {
  const base = {
    startingCash: "152432",
    startingInvestment: "455086",
    allTimeIncome: "0",
    allTimeConsumption: "0",
    allTimeInvestment: "0",
  };

  it("還沒記帳時，現金與投資成本就是起始值", () => {
    const a = assetSummary(base);
    expect(a.cash.toFixed(0)).toBe("152432");
    expect(a.investmentCost.toFixed(0)).toBe("455086");
  });

  it("投資的錢要從現金扣掉，否則緊急預備金會虛胖", () => {
    // 賺 50,000、消費 30,000、其中 20,000 投入股票
    const a = assetSummary({
      ...base,
      allTimeIncome: "50000",
      allTimeConsumption: "30000",
      allTimeInvestment: "20000",
    });

    // 現金：152,432 + (50,000 − 30,000) − 20,000 = 152,432（沒變，錢轉去股票了）
    expect(a.cash.toFixed(0)).toBe("152432");
    expect(a.investmentCost.toFixed(0)).toBe("475086");
  });

  it("沒投資時，存下來的錢全部留在現金", () => {
    const a = assetSummary({
      ...base,
      allTimeIncome: "50000",
      allTimeConsumption: "30000",
      allTimeInvestment: "0",
    });
    expect(a.cash.toFixed(0)).toBe("172432");
  });

  it("緊急預備金月數 = 現金 ÷ 月均消費，不含投資", () => {
    const a = assetSummary({
      ...base,
      avgMonthlyConsumption: "30000",
    });
    // 152,432 / 30,000 = 5.08 個月。若把 455,086 的股票算進去會變成 20 個月，指標就失去意義
    expect(a.emergencyMonths).toBeCloseTo(5.08, 2);
  });

  it("沒有消費資料時緊急預備金月數為 null，不會除以零", () => {
    expect(assetSummary(base).emergencyMonths).toBeNull();
    expect(assetSummary({ ...base, avgMonthlyConsumption: "0" }).emergencyMonths).toBeNull();
  });

  it("有填投資現值時算得出未實現損益，總資產用現值", () => {
    const a = assetSummary({ ...base, investmentValue: "704975" });
    expect(a.unrealizedGain?.toFixed(0)).toBe("249889");
    expect(a.netWorth.toFixed(0)).toBe("857407"); // 152,432 + 704,975
  });

  it("沒填投資現值時，總資產退而用成本計算", () => {
    const a = assetSummary(base);
    expect(a.investmentValue).toBeNull();
    expect(a.unrealizedGain).toBeNull();
    expect(a.netWorth.toFixed(0)).toBe("607518"); // 152,432 + 455,086
  });
});

describe("averageMonthlyConsumption", () => {
  const history: MonthlyTotal[] = [
    { yearMonth: "2026-08", income: new Decimal(0), consumption: new Decimal(5000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-07", income: new Decimal(0), consumption: new Decimal(30000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-06", income: new Decimal(0), consumption: new Decimal(28000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-05", income: new Decimal(0), consumption: new Decimal(26000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-04", income: new Decimal(0), consumption: new Decimal(90000), savings: new Decimal(0), investment: new Decimal(0) },
  ];

  it("排除當月（還沒過完，會拉低平均）", () => {
    // 取 7、6、5 月 = (30000+28000+26000)/3 = 28000，不含 8 月的 5,000
    expect(averageMonthlyConsumption(history, "2026-08")?.toFixed(0)).toBe("28000");
  });

  it("只看最近 N 個月，更早的不影響", () => {
    // 4 月的 90,000 在 3 個月視窗外
    expect(averageMonthlyConsumption(history, "2026-08", 3)?.toFixed(0)).toBe("28000");
  });

  it("只有當月資料時退而用當月，不回傳 null", () => {
    const onlyCurrent = [history[0]];
    expect(averageMonthlyConsumption(onlyCurrent, "2026-08")?.toFixed(0)).toBe("5000");
  });

  it("完全沒資料時回傳 null", () => {
    expect(averageMonthlyConsumption([], "2026-08")).toBeNull();
  });
});

describe("savingsBreakdown — 儲蓄率拆解", () => {
  it("拆成『已明確投入』與『還在帳上』兩塊", () => {
    // 收入 50,000、消費 30,000 → 存下 20,000，其中只記了 15,000 進儲蓄/投資
    const b = savingsBreakdown({
      totalIncome: "50000",
      actualSaved: "20000",
      savingsExpense: "15000",
    });

    expect(b.setAside.toFixed(0)).toBe("15000");
    expect(b.unallocated.toFixed(0)).toBe("5000");
    expect(b.setAsideRatio).toBeCloseTo(0.3, 10);
    expect(b.unallocatedRatio).toBeCloseTo(0.1, 10);
    // 兩者相加要等於儲蓄率 40%
    expect((b.setAsideRatio ?? 0) + (b.unallocatedRatio ?? 0)).toBeCloseTo(0.4, 10);
  });

  it("沒有收入時比例為 null，不會除以零", () => {
    const b = savingsBreakdown({
      totalIncome: "0",
      actualSaved: "-3000",
      savingsExpense: "0",
    });
    expect(b.setAsideRatio).toBeNull();
    expect(b.unallocatedRatio).toBeNull();
  });
});

describe("categoryDelta — 分類月變化", () => {
  const item = (
    id: string,
    name: string,
    amount: string,
  ): CategoryBreakdownItem => ({
    categoryId: id,
    name,
    color: "#000",
    amount: new Decimal(amount),
    ratio: 0,
  });

  it("依變化幅度排序，增減都算", () => {
    const result = categoryDelta(
      [item("a", "餐飲", "8000"), item("b", "娛樂", "2000")],
      [item("a", "餐飲", "5700"), item("b", "娛樂", "2900")],
    );

    expect(result.map((r) => r.name)).toEqual(["餐飲", "娛樂"]);
    expect(result[0].delta.toFixed(0)).toBe("2300");
    expect(result[0].changeRatio).toBeCloseTo(0.4035, 3);
    expect(result[1].delta.toFixed(0)).toBe("-900");
  });

  it("這個月新出現的分類，變化比例為 null（顯示成新增）", () => {
    const result = categoryDelta([item("c", "醫療", "1500")], []);
    expect(result[0].previous.toFixed(0)).toBe("0");
    expect(result[0].changeRatio).toBeNull();
  });

  it("這個月消失的分類也要列出來（減少）", () => {
    const result = categoryDelta([], [item("d", "旅遊", "12000")]);
    expect(result[0].name).toBe("旅遊");
    expect(result[0].delta.toFixed(0)).toBe("-12000");
  });

  it("金額完全沒變的分類不列出來", () => {
    const result = categoryDelta([item("a", "餐飲", "5000")], [item("a", "餐飲", "5000")]);
    expect(result).toEqual([]);
  });
});

describe("assetSummary — 投資報酬率", () => {
  const base = {
    startingCash: "152432",
    startingInvestment: "455086",
    allTimeIncome: "0",
    allTimeConsumption: "0",
    allTimeInvestment: "0",
  };

  it("報酬率 = 未實現損益 ÷ 成本", () => {
    const a = assetSummary({ ...base, investmentValue: "704975" });
    // 249,889 / 455,086 = 54.91%
    expect(a.unrealizedGainRatio).toBeCloseTo(0.5491, 4);
  });

  it("虧損時報酬率為負", () => {
    const a = assetSummary({ ...base, investmentValue: "400000" });
    expect(a.unrealizedGain?.toFixed(0)).toBe("-55086");
    expect(a.unrealizedGainRatio).toBeCloseTo(-0.121, 3);
  });

  it("沒填現值時報酬率為 null（不能假裝知道市價）", () => {
    expect(assetSummary(base).unrealizedGainRatio).toBeNull();
  });

  it("成本為 0 時報酬率為 null，不會除以零", () => {
    const a = assetSummary({
      ...base,
      startingInvestment: "0",
      investmentValue: "5000",
    });
    expect(a.unrealizedGain?.toFixed(0)).toBe("5000");
    expect(a.unrealizedGainRatio).toBeNull();
  });
});
