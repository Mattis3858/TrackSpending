import { describe, expect, it } from "vitest";
import {
  Decimal,
  MASKED_AMOUNT,
  MASKED_USD,
  amountFormatter,
  formatUSD,
  formatPercent,
  formatTWD,
  isPositiveAmount,
  money,
  sum,
  toAmountString,
  toDbAmount,
} from "./money";

describe("money / sum", () => {
  it("字串加總精確，不出現浮點誤差", () => {
    expect(sum(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(sum(["33.33", "33.33", "33.33"]).toString()).toBe("99.99");
  });

  it("空陣列回傳 0", () => {
    expect(sum([]).toString()).toBe("0");
  });

  it("接受任何有 toString 的物件（例如 Prisma 回傳的 Decimal）", () => {
    const prismaLike = { toString: () => "1234.56" };
    expect(money(prismaLike).toFixed(2)).toBe("1234.56");
  });

  it("非法輸入會拋錯", () => {
    expect(() => money("abc")).toThrow();
    expect(() => money(Number.NaN)).toThrow();
  });

  it("空字串拋出的是我們自己的清楚訊息，不是 DecimalError", () => {
    // decimal.js 對空字串會丟 [DecimalError] Invalid argument，訊息對呼叫端沒意義
    expect(() => money("")).toThrow(/Invalid amount/);
    expect(() => money("   ")).toThrow(/Invalid amount/);
  });
});

describe("isPositiveAmount", () => {
  it("SPEC 5.5：金額必須大於 0", () => {
    expect(isPositiveAmount("1")).toBe(true);
    expect(isPositiveAmount("0")).toBe(false);
    expect(isPositiveAmount("-5")).toBe(false);
    expect(isPositiveAmount("abc")).toBe(false);
    expect(isPositiveAmount("0.01")).toBe(true);
  });
});

describe("toDbAmount / toAmountString", () => {
  it("固定兩位小數", () => {
    expect(toDbAmount("100")).toBe("100.00");
    expect(toDbAmount("100.5")).toBe("100.50");
    expect(toAmountString(new Decimal("1234.5"))).toBe("1234.50");
  });

  it("四捨五入到分", () => {
    expect(toDbAmount("100.005")).toBe("100.01");
  });
});

describe("formatTWD", () => {
  it("整數不顯示小數，並加千分位", () => {
    expect(formatTWD("1234")).toBe("NT$ 1,234");
    expect(formatTWD("0")).toBe("NT$ 0");
    expect(formatTWD("1234567")).toBe("NT$ 1,234,567");
    expect(formatTWD("100")).toBe("NT$ 100");
  });

  it("有小數才顯示小數", () => {
    expect(formatTWD("1234.5")).toBe("NT$ 1,234.50");
    expect(formatTWD("0.99")).toBe("NT$ 0.99");
  });

  it("負數顯示在最前面", () => {
    expect(formatTWD("-1234")).toBe("-NT$ 1,234");
  });

  it("alwaysCents 強制顯示小數", () => {
    expect(formatTWD("1234", { alwaysCents: true })).toBe("NT$ 1,234.00");
  });

  it("大額不失真", () => {
    expect(formatTWD("99999999.99")).toBe("NT$ 99,999,999.99");
  });
});

describe("formatPercent", () => {
  it("SPEC 8.3：null 顯示破折號，不可顯示 0% 或 NaN", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("正常比率", () => {
    expect(formatPercent(0.4)).toBe("40%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("負儲蓄率照實顯示", () => {
    expect(formatPercent(-0.5)).toBe("-50%");
  });
});

describe("amountFormatter — 金額遮罩", () => {
  it("關閉遮罩時行為跟 formatTWD 完全一致", () => {
    const fmt = amountFormatter(false);
    expect(fmt("1234")).toBe(formatTWD("1234"));
    expect(fmt("1234.5")).toBe("NT$ 1,234.50");
    expect(fmt("-500")).toBe("-NT$ 500");
    expect(fmt("1234", { alwaysCents: true })).toBe("NT$ 1,234.00");
  });

  it("開啟遮罩時任何金額都變成同一個字串，不透露位數", () => {
    const fmt = amountFormatter(true);
    // 位數不能洩漏出來：7 位數跟 2 位數要長得一模一樣
    expect(fmt("857407")).toBe(MASKED_AMOUNT);
    expect(fmt("12")).toBe(MASKED_AMOUNT);
    expect(fmt("857407")).toBe(fmt("12"));
  });

  it("負數與零也一樣被遮住，不會露出負號", () => {
    const fmt = amountFormatter(true);
    expect(fmt("-15000")).toBe(MASKED_AMOUNT);
    expect(fmt("0")).toBe(MASKED_AMOUNT);
    expect(fmt("-15000")).not.toContain("-");
  });
});

describe("formatUSD", () => {
  it("一律顯示兩位小數並加千分位", () => {
    expect(formatUSD("1405.2")).toBe("US$ 1,405.20");
    expect(formatUSD("10.35")).toBe("US$ 10.35");
    expect(formatUSD("1426")).toBe("US$ 1,426.00");
    expect(formatUSD("1234567.891")).toBe("US$ 1,234,567.89");
  });

  it("負數", () => {
    expect(formatUSD("-21.42")).toBe("-US$ 21.42");
  });

  it("遮罩時美元用自己的字樣，不會顯示成 NT$", () => {
    const fmt = amountFormatter(true, "USD");
    expect(fmt("10.35")).toBe(MASKED_USD);
    expect(fmt("10.35")).not.toContain("NT$");
  });

  it("amountFormatter 預設仍是台幣，既有呼叫端不受影響", () => {
    expect(amountFormatter(false)("1234")).toBe("NT$ 1,234");
    expect(amountFormatter(false, "USD")("1234")).toBe("US$ 1,234.00");
  });
});
