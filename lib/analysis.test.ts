import { describe, expect, it } from "vitest";
import {
  assetSummary,
  averageMonthlyConsumption,
  averageMonthlyFixed,
  averageMonthlyIncome,
  budgetFromTarget,
  bufferFund,
  categoryDelta,
  monthPace,
  savingsBreakdown,
  valuePortfolio,
  type MonthlyTotal,
} from "./analysis";
import { Decimal, money } from "./money";
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
    allTimeIncome: "0",
    allTimeConsumption: "0",
    allTimeInvestment: "0",
  };
  const PORTFOLIO = { cost: "455086", value: "704975" };

  it("還沒記帳也沒有持股時，現金就是起始值、投資為 0", () => {
    const a = assetSummary(base);
    expect(a.cash.toFixed(0)).toBe("152432");
    expect(a.investmentCost.toFixed(0)).toBe("0");
    // 沒有持股就沒有市值可言，不用成本冒充
    expect(a.investmentValue).toBeNull();
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
    // 沒有持股明細時，投資成本就是記帳期間投入的金額
    expect(a.investmentCost.toFixed(0)).toBe("20000");
  });

  it("沒投資時，存下來的錢全部留在現金", () => {
    const a = assetSummary({
      ...base,
      allTimeIncome: "50000",
      allTimeConsumption: "30000",
    });
    expect(a.cash.toFixed(0)).toBe("172432");
  });

  it("緊急預備金月數 = 現金 ÷ 月均消費，不含投資", () => {
    const a = assetSummary({
      ...base,
      portfolio: PORTFOLIO,
      avgMonthlyConsumption: "30000",
    });
    // 152,432 / 30,000 = 5.08。若把 455,086 的股票算進去會變成 20 個月，指標就失去意義
    expect(a.emergencyMonths).toBeCloseTo(5.08, 2);
  });

  it("沒有消費資料時緊急預備金月數為 null，不會除以零", () => {
    expect(assetSummary(base).emergencyMonths).toBeNull();
    expect(assetSummary({ ...base, avgMonthlyConsumption: "0" }).emergencyMonths).toBeNull();
  });

  it("有持股時算得出未實現損益，總資產用市值", () => {
    const a = assetSummary({ ...base, portfolio: PORTFOLIO });
    expect(a.unrealizedGain?.toFixed(0)).toBe("249889");
    expect(a.netWorth.toFixed(0)).toBe("857407"); // 152,432 + 704,975
  });

  it("完全沒有持股時，總資產只有現金", () => {
    const a = assetSummary(base);
    expect(a.unrealizedGain).toBeNull();
    expect(a.netWorth.toFixed(0)).toBe("152432");
  });
});

describe("assetSummary — 持股是投資部位的唯一來源", () => {
  const base = {
    startingCash: "152432",
    allTimeIncome: "50000",
    allTimeConsumption: "30000",
    allTimeInvestment: "20000",
  };

  it("持股成本已含記帳期間投入的錢，不可以再加 allTimeInvestment", () => {
    const a = assetSummary({
      ...base,
      portfolio: { cost: "2045000", value: "2462325" },
    });

    expect(a.investmentCost.toFixed(0)).toBe("2045000");
    expect(a.investmentCost.toFixed(0)).not.toBe("2065000");
    expect(a.investmentValue?.toFixed(0)).toBe("2462325");
  });

  it("現金的算法不受持股影響（投資的錢仍要從現金扣掉）", () => {
    const withPortfolio = assetSummary({
      ...base,
      portfolio: { cost: "2045000", value: "2462325" },
    });
    const without = assetSummary(base);

    expect(withPortfolio.cash.toFixed(0)).toBe(without.cash.toFixed(0));
    expect(withPortfolio.cash.toFixed(0)).toBe("152432");
  });
});

describe("assetSummary — 現金與投資依幣別拆分", () => {
  const base = {
    startingCash: "152432",
    allTimeIncome: "0",
    allTimeConsumption: "0",
    allTimeInvestment: "0",
  };
  const FX = "31.798233";

  it("台幣現金與美元現金分開保留，合計換算台幣", () => {
    const a = assetSummary({ ...base, cashUsd: "10.35", usdToTwd: FX });

    expect(a.cash.toFixed(0)).toBe("152432");
    expect(a.cashUsd.toFixed(2)).toBe("10.35");
    expect(a.cashTotalTwd.toFixed(2)).toBe("152761.11"); // 152,432 + 10.35 x 31.798233
  });

  it("緊急預備金用換算後的總現金（美元現金也是隨時可動用的）", () => {
    const withUsd = assetSummary({
      ...base,
      cashUsd: "10.35",
      usdToTwd: FX,
      avgMonthlyConsumption: "30000",
    });
    const without = assetSummary({ ...base, avgMonthlyConsumption: "30000" });

    expect(withUsd.emergencyMonths!).toBeGreaterThan(without.emergencyMonths!);
  });

  it("缺匯率時美元現金不併入合計，也不亂猜", () => {
    const a = assetSummary({ ...base, cashUsd: "10.35", usdToTwd: null });

    expect(a.cashUsd.toFixed(2)).toBe("10.35");
    expect(a.cashTotalTwd.toFixed(0)).toBe("152432");
    expect(a.netWorth.toFixed(0)).toBe("152432");
  });

  it("投資依幣別拆成台股（台幣）與美股（美元）", () => {
    const a = assetSummary({
      ...base,
      usdToTwd: FX,
      portfolio: {
        cost: "2045365",
        value: "2454684",
        byCurrency: {
          twd: { cost: "2000000", value: "2410000" },
          usd: { cost: "1426.64", value: "1405.22" },
        },
      },
    });

    expect(a.investmentTwd.toFixed(0)).toBe("2410000");
    expect(a.investmentUsd.toFixed(2)).toBe("1405.22");
    expect(a.netWorth.toFixed(0)).toBe("2607116"); // 152,432 + 2,454,684
  });

  it("沒有美元部位時，行為跟以前完全一樣", () => {
    const a = assetSummary(base);
    expect(a.cashUsd.toFixed(2)).toBe("0.00");
    expect(a.cashTotalTwd.toFixed(0)).toBe(a.cash.toFixed(0));
    expect(a.investmentUsd.toFixed(2)).toBe("0.00");
  });
});

describe("averageMonthlyConsumption", () => {
  const history: MonthlyTotal[] = [
    { yearMonth: "2026-08", income: new Decimal(0), consumption: new Decimal(5000), fixed: new Decimal(3000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-07", income: new Decimal(0), consumption: new Decimal(30000), fixed: new Decimal(18000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-06", income: new Decimal(0), consumption: new Decimal(28000), fixed: new Decimal(18000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-05", income: new Decimal(0), consumption: new Decimal(26000), fixed: new Decimal(17000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-04", income: new Decimal(0), consumption: new Decimal(90000), fixed: new Decimal(18000), savings: new Decimal(0), investment: new Decimal(0) },
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
    allTimeIncome: "0",
    allTimeConsumption: "0",
    allTimeInvestment: "0",
  };

  it("報酬率 = 未實現損益 ÷ 成本", () => {
    const a = assetSummary({
      ...base,
      portfolio: { cost: "455086", value: "704975" },
    });
    // 249,889 / 455,086 = 54.91%
    expect(a.unrealizedGainRatio).toBeCloseTo(0.5491, 4);
  });

  it("虧損時報酬率為負", () => {
    const a = assetSummary({
      ...base,
      portfolio: { cost: "455086", value: "400000" },
    });
    expect(a.unrealizedGain?.toFixed(0)).toBe("-55086");
    expect(a.unrealizedGainRatio).toBeCloseTo(-0.121, 3);
  });

  it("沒有持股時報酬率為 null（不能假裝知道市價）", () => {
    expect(assetSummary(base).unrealizedGainRatio).toBeNull();
  });

  it("成本為 0 時報酬率為 null，不會除以零", () => {
    const a = assetSummary({
      ...base,
      portfolio: { cost: "0", value: "5000" },
    });
    expect(a.unrealizedGain?.toFixed(0)).toBe("5000");
    expect(a.unrealizedGainRatio).toBeNull();
  });
});

describe("valuePortfolio — 持股估值", () => {
  const holdings = [
    { symbol: "2330", name: "台積電", shares: "1000", cost: "2000000" },
    { symbol: "0050", name: "元大台灣50", shares: "500", cost: "45000" },
  ];
  const quotes = new Map([
    ["2330", { price: "2410", date: "2026-08-21" }],
    ["0050", { price: "104.65", date: "2026-08-21" }],
  ]);

  it("市值 = 股數 x 價格，損益與報酬率跟著算出來", () => {
    const p = valuePortfolio(holdings, quotes);
    const tsmc = p.items.find((i) => i.symbol === "2330")!;

    expect(tsmc.value?.toFixed(0)).toBe("2410000");
    expect(tsmc.gain?.toFixed(0)).toBe("410000");
    expect(tsmc.gainRatio).toBeCloseTo(0.205, 4);
  });

  it("合計正確", () => {
    const p = valuePortfolio(holdings, quotes);
    expect(p.totalCost.toFixed(0)).toBe("2045000");
    expect(p.totalValue.toFixed(0)).toBe("2462325"); // 2,410,000 + 52,325
    expect(p.totalGain.toFixed(0)).toBe("417325");
    expect(p.missingQuotes).toBe(0);
  });

  it("依市值由大到小排序", () => {
    expect(valuePortfolio(holdings, quotes).items.map((i) => i.symbol)).toEqual([
      "2330",
      "0050",
    ]);
  });

  it("查不到報價的部位以成本計入，總資產不會因為 API 掛掉而暴跌", () => {
    const p = valuePortfolio(holdings, new Map());

    expect(p.missingQuotes).toBe(2);
    expect(p.items[0].price).toBeNull();
    expect(p.items[0].value).toBeNull();
    // 市值退回成本，損益為 0，而不是把資產算成 0
    expect(p.totalValue.toFixed(0)).toBe("2045000");
    expect(p.totalGain.toFixed(0)).toBe("0");
  });

  it("只有部分查得到報價時，其餘仍以成本計入", () => {
    const partial = new Map([["2330", { price: "2410", date: "2026-08-21" }]]);
    const p = valuePortfolio(holdings, partial);

    expect(p.missingQuotes).toBe(1);
    expect(p.totalValue.toFixed(0)).toBe("2455000"); // 2,410,000 + 45,000（成本）
  });

  it("零股（小數股數）計算正確", () => {
    const p = valuePortfolio(
      [{ symbol: "2330", name: "台積電", shares: "13.5", cost: "30000" }],
      quotes,
    );
    expect(p.totalValue.toFixed(2)).toBe("32535.00");
  });

  it("沒有持股時各項為 0，報酬率為 null 不會除以零", () => {
    const p = valuePortfolio([], quotes);
    expect(p.totalCost.toFixed(0)).toBe("0");
    expect(p.totalGainRatio).toBeNull();
    expect(p.quoteDate).toBeNull();
  });

  it("回報最新的報價日期", () => {
    const mixed = new Map([
      ["2330", { price: "2410", date: "2026-08-21" }],
      ["0050", { price: "104.65", date: "2026-08-24" }],
    ]);
    expect(valuePortfolio(holdings, mixed).quoteDate).toBe("2026-08-24");
  });
});


describe("valuePortfolio — 複委託（美股）多幣別", () => {
  const mixed = [
    { symbol: "2330", name: "台積電", shares: "1000", cost: "2000000" },
    {
      symbol: "VOO",
      name: "Vanguard S&P 500 ETF",
      shares: "2",
      cost: "1426.64",
      currency: "USD" as const,
    },
  ];
  const quotes = new Map([
    ["2330", { price: "2410", date: "2026-08-21" }],
    ["VOO", { price: "702.61", date: "2026-08-24" }],
  ]);
  const FX = "31.798233";

  it("美股部位以美元保留原值，另外換算台幣", () => {
    const voo = valuePortfolio(mixed, quotes, FX).items.find(
      (i) => i.symbol === "VOO",
    )!;

    expect(voo.currency).toBe("USD");
    expect(voo.value?.toFixed(2)).toBe("1405.22"); // 2 x 702.61 美元
    expect(voo.valueTwd?.toFixed(0)).toBe("44684"); // x 31.798233
    expect(voo.costTwd?.toFixed(2)).toBe("45364.63");
  });

  it("損益用原幣別計算，報酬率不受匯率影響", () => {
    const voo = valuePortfolio(mixed, quotes, FX).items.find(
      (i) => i.symbol === "VOO",
    )!;
    expect(voo.gain?.toFixed(2)).toBe("-21.42"); // 1405.22 - 1426.64 美元
    expect(voo.gainRatio).toBeCloseTo(-0.015, 3);
  });

  it("合計一律是台幣，台股與美股加總在一起", () => {
    const p = valuePortfolio(mixed, quotes, FX);
    expect(p.totalValue.toFixed(0)).toBe("2454684"); // 2,410,000 + 44,684
    expect(p.totalCost.toFixed(0)).toBe("2045365"); // 2,000,000 + 45,365
    expect(p.usdToTwd?.toFixed(6)).toBe("31.798233");
    expect(p.missingFx).toBe(0);
  });

  it("取不到匯率時，美股部位不併入台幣合計但也不會亂猜", () => {
    const p = valuePortfolio(mixed, quotes, null);

    expect(p.missingFx).toBe(1);
    // 只有台股計入合計，美元部位維持以美元顯示
    expect(p.totalValue.toFixed(0)).toBe("2410000");
    const voo = p.items.find((i) => i.symbol === "VOO")!;
    expect(voo.valueTwd).toBeNull();
    expect(voo.value?.toFixed(2)).toBe("1405.22"); // 原幣別的值仍在
  });

  it("純台股組合傳不傳匯率結果都一樣", () => {
    const twOnly = [mixed[0]];
    const withFx = valuePortfolio(twOnly, quotes, FX);
    const withoutFx = valuePortfolio(twOnly, quotes, null);

    expect(withFx.totalValue.toFixed(2)).toBe(withoutFx.totalValue.toFixed(2));
    expect(withoutFx.missingFx).toBe(0);
  });

  it("美股查不到報價時，以成本換算台幣計入", () => {
    const p = valuePortfolio(mixed, new Map([["2330", { price: "2410", date: "2026-08-21" }]]), FX);
    const voo = p.items.find((i) => i.symbol === "VOO")!;

    expect(voo.price).toBeNull();
    expect(voo.valueTwd?.toFixed(2)).toBe("45364.63"); // 退回成本換算
    expect(p.missingQuotes).toBe(1);
  });
});


describe("bufferFund — 緩衝／娛樂資金", () => {
  const base = {
    income: "50000",
    fixedSoFar: "18000", // 房租 15,000 + 水電網路 3,000
    variableSoFar: "6000",
    elapsedDays: 10,
    totalDays: 30,
  };

  it("日均只算變動消費，不含固定支出", () => {
    const b = bufferFund(base);
    // 6,000 / 10 天 = 600/天 × 30 = 18,000
    expect(b.variableProjected.toFixed(0)).toBe("18000");
    // 若把固定支出也混進日均：(18,000+6,000)/10 × 30 = 72,000，嚴重高估
    expect(b.variableProjected.toFixed(0)).not.toBe("72000");
  });

  it("緩衝 = 收入 − 固定支出 − 預估變動消費，固定支出只扣一次", () => {
    const b = bufferFund(base);
    // 50,000 − 18,000 − 18,000 = 14,000
    expect(b.buffer.toFixed(0)).toBe("14000");
    expect(b.bufferRatio).toBeCloseTo(0.28, 4);
  });

  it("本月還沒記到房租時，用歷史參考值推估固定支出", () => {
    const b = bufferFund({
      ...base,
      fixedSoFar: "3000", // 只記了水電，房租還沒扣
      historicalFixed: "18000",
    });

    expect(b.fixed.toFixed(0)).toBe("18000");
    expect(b.fixedEstimated).toBe(true);
    // 若只用已記錄的 3,000，緩衝會被高估成 29,000 —— 危險的方向
    expect(b.buffer.toFixed(0)).toBe("14000");
  });

  it("本月固定支出已超過歷史值時，以實際為準", () => {
    const b = bufferFund({ ...base, fixedSoFar: "20000", historicalFixed: "18000" });
    expect(b.fixed.toFixed(0)).toBe("20000");
    expect(b.fixedEstimated).toBe(false);
  });

  it("沒有歷史資料時就用本月已記錄的", () => {
    const b = bufferFund({ ...base, historicalFixed: null });
    expect(b.fixed.toFixed(0)).toBe("18000");
    expect(b.fixedEstimated).toBe(false);
  });

  it("月初第一天不會除以零", () => {
    const b = bufferFund({ ...base, elapsedDays: 1, variableSoFar: "500" });
    expect(b.variableProjected.toFixed(0)).toBe("15000");
  });

  it("未來的月份（還沒開始）預估變動為 0", () => {
    const b = bufferFund({ ...base, elapsedDays: 0, variableSoFar: "0" });
    expect(b.variableProjected.toFixed(0)).toBe("0");
    expect(b.buffer.toFixed(0)).toBe("32000");
  });

  it("花超過收入時緩衝為負，不會被 clamp", () => {
    const b = bufferFund({ ...base, variableSoFar: "20000" });
    // 20,000/10 × 30 = 60,000；50,000 − 18,000 − 60,000 = −28,000
    expect(b.buffer.toFixed(0)).toBe("-28000");
    expect(b.bufferRatio).toBeLessThan(0);
  });

  it("沒有收入時比例為 null，不會除以零", () => {
    expect(bufferFund({ ...base, income: "0" }).bufferRatio).toBeNull();
  });
});

describe("averageMonthlyFixed", () => {
  const history: MonthlyTotal[] = [
    { yearMonth: "2026-08", income: new Decimal(0), consumption: new Decimal(5000), fixed: new Decimal(3000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-07", income: new Decimal(0), consumption: new Decimal(30000), fixed: new Decimal(18000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-06", income: new Decimal(0), consumption: new Decimal(28000), fixed: new Decimal(18000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-05", income: new Decimal(0), consumption: new Decimal(26000), fixed: new Decimal(17000), savings: new Decimal(0), investment: new Decimal(0) },
  ];

  it("排除當月——當月的固定支出還沒發生完，拿來當參考會低估", () => {
    // 取 7、6、5 月 = (18000+18000+17000)/3 = 17,666.67，不含 8 月的 3,000
    expect(averageMonthlyFixed(history, "2026-08")?.toFixed(0)).toBe("17667");
  });

  it("只有當月資料時回傳 null（沒有可靠的參考值就不要推估）", () => {
    expect(averageMonthlyFixed([history[0]], "2026-08")).toBeNull();
  });

  it("完全沒資料時回傳 null", () => {
    expect(averageMonthlyFixed([], "2026-08")).toBeNull();
  });
});

describe("monthPace — 尚未支付的固定支出要先扣掉", () => {
  // 預算 24,630、房租 12,000 在 5 號扣、當月 30 天
  const base = {
    yearMonth: "2026-09" as const,
    totalDays: 30,
    budget: "24630",
  };

  it("房租還沒扣時，不先扣掉會高估一倍", () => {
    const naive = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
    });
    const correct = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
      upcomingFixed: "12000",
    });

    // (24630 − 900) / 28 = 847.5 → 848
    expect(naive.dailyAllowance?.toFixed(0)).toBe("848");
    // (24630 − 900 − 12000) / 28 = 419
    expect(correct.dailyAllowance?.toFixed(0)).toBe("419");
  });

  it("房租記進去之後，額度不會突然腰斬", () => {
    // 3 號：房租未付，先扣預估
    const before = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
      upcomingFixed: "12000",
    });
    // 6 號：房租已付並記錄，所以 upcomingFixed 歸零
    const after = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-06",
      consumptionSoFar: "12900",
      budget: base.budget,
      upcomingFixed: "0",
    });

    // 兩者應該接近（差別只來自這三天實際多花的錢與天數變化）
    expect(before.dailyAllowance?.toFixed(0)).toBe("419");
    expect(after.dailyAllowance?.toFixed(0)).toBe("469");
    // 修正前的落差是 848 → 469（腰斬），現在只有 419 → 469
    expect(
      Math.abs(
        Number(after.dailyAllowance!.toFixed(0)) -
          Number(before.dailyAllowance!.toFixed(0)),
      ),
    ).toBeLessThan(100);
  });

  it("budgetRemaining 仍是「預算還剩多少」，不含這個扣除", () => {
    const p = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
      upcomingFixed: "12000",
    });

    expect(p.budgetRemaining?.toFixed(0)).toBe("23730"); // 24,630 − 900
    expect(p.spendableRemaining?.toFixed(0)).toBe("11730"); // 再扣 12,000
    expect(p.upcomingFixed.toFixed(0)).toBe("12000");
  });

  it("沒有固定支出範本時，行為跟以前完全一樣", () => {
    const withZero = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
      upcomingFixed: "0",
    });
    const without = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "900",
      budget: base.budget,
    });

    expect(withZero.dailyAllowance?.toFixed(2)).toBe(
      without.dailyAllowance?.toFixed(2),
    );
  });

  it("固定支出超過預算剩餘時，可用額度為負（誠實呈現）", () => {
    const p = monthPace({
      yearMonth: base.yearMonth,
      today: "2026-09-03",
      consumptionSoFar: "20000",
      budget: base.budget,
      upcomingFixed: "12000",
    });
    expect(p.dailyAllowance?.isNegative()).toBe(true);
  });
});

describe("averageMonthlyIncome", () => {
  const history: MonthlyTotal[] = [
    { yearMonth: "2026-09", income: new Decimal(20000), consumption: new Decimal(7345), fixed: new Decimal(7000), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-08", income: new Decimal(35186), consumption: new Decimal(1004), fixed: new Decimal(0), savings: new Decimal(0), investment: new Decimal(0) },
    { yearMonth: "2026-07", income: new Decimal(33000), consumption: new Decimal(28000), fixed: new Decimal(9000), savings: new Decimal(0), investment: new Decimal(0) },
  ];

  it("排除當月——月初的收入還沒收完，拿來當參考會嚴重低估", () => {
    // 取 8、7 月 = (35186 + 33000) / 2 = 34,093，不含 9 月那筆 20,000
    expect(averageMonthlyIncome(history, "2026-09")?.toFixed(0)).toBe("34093");
  });

  it("只有當月資料時回傳 null（沒有可靠參考就不推估）", () => {
    expect(averageMonthlyIncome([history[0]], "2026-09")).toBeNull();
  });

  it("完全沒資料時回傳 null", () => {
    expect(averageMonthlyIncome([], "2026-09")).toBeNull();
  });
});

describe("預算的收入來源 — 9/1 的實際案例", () => {
  // 真實情境：9/1 只記了爸爸給的 20,000，薪水還沒入帳；8 月收入 35,186
  const thisMonthIncome = "20000";
  const historicalIncome = "35186";
  const targetRate = 35;

  it("直接用當月已記錄的收入，額度會荒謬地小", () => {
    const budget = budgetFromTarget(thisMonthIncome, targetRate)!;
    const pace = monthPace({
      yearMonth: "2026-09",
      today: "2026-09-01",
      consumptionSoFar: "7345", // 房租 7,000 + 午餐 345
      budget,
      upcomingFixed: "2857", // 範本 9,857 − 已付房租 7,000
    });

    expect(budget.toFixed(0)).toBe("13000"); // 20,000 x 65%
    expect(pace.dailyAllowance?.toFixed(0)).toBe("93"); // 使用者回報的數字
  });

  it("改用近期收入推估後就合理了", () => {
    const budget = budgetFromTarget(historicalIncome, targetRate)!;
    const pace = monthPace({
      yearMonth: "2026-09",
      today: "2026-09-01",
      consumptionSoFar: "7345",
      budget,
      upcomingFixed: "2857",
    });

    expect(budget.toFixed(0)).toBe("22871"); // 35,186 x 65%
    expect(pace.dailyAllowance?.toFixed(0)).toBe("422");
  });

  it("等實際收入超過歷史值，就會改用實際的", () => {
    // 薪水入帳後當月收入 40,000 > 歷史 35,186
    const actual = money("40000");
    const historical = money(historicalIncome);
    const expected = historical.greaterThan(actual) ? historical : actual;
    expect(expected.toFixed(0)).toBe("40000");
  });
});
