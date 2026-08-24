/**
 * SPEC.md 8.4 規定的必測案例。
 * 這些測試全部通過才能進到下一個開發階段。
 */
import { describe, expect, it } from "vitest";
import { TransactionType } from "@/generated/prisma/enums";
import {
  emptySummary,
  expenseByCategory,
  filterMonth,
  summarizeMonth,
  UNCATEGORIZED_LABEL,
  type TxForReport,
} from "./reports";

const 餐飲 = { id: "c-food", name: "餐飲", isSavings: false, color: "#f59e0b" };
const 交通 = { id: "c-transit", name: "交通", isSavings: false, color: "#3b82f6" };
const 儲蓄 = { id: "c-saving", name: "儲蓄", isSavings: true, color: "#10b981" };
const 就業收入 = { id: "c-salary", name: "就業收入", isSavings: false, color: "#22c55e" };

function income(amount: string, date = "2026-09-05"): TxForReport {
  return { type: TransactionType.INCOME, amount, date, category: 就業收入 };
}
function expense(
  amount: string,
  category = 餐飲,
  date = "2026-09-10",
): TxForReport {
  return { type: TransactionType.EXPENSE, amount, date, category };
}
function transfer(amount: string, date = "2026-09-10"): TxForReport {
  return { type: TransactionType.TRANSFER, amount, date, category: null };
}

describe("summarizeMonth — SPEC 8.4 必測案例", () => {
  it("案例 1：收入 50,000／消費 30,000／儲蓄 20,000 → 實際存下 20,000、儲蓄率 40%、結餘 0", () => {
    const s = summarizeMonth([
      income("50000"),
      expense("30000", 餐飲),
      expense("20000", 儲蓄),
    ]);

    expect(s.totalIncome.toFixed(2)).toBe("50000.00");
    expect(s.consumptionExpense.toFixed(2)).toBe("30000.00");
    expect(s.savingsExpense.toFixed(2)).toBe("20000.00");
    expect(s.totalExpense.toFixed(2)).toBe("50000.00");
    expect(s.balance.toFixed(2)).toBe("0.00");
    expect(s.actualSaved.toFixed(2)).toBe("20000.00");
    expect(s.savingsRate).toBe(0.4);
  });

  it("案例 2：完全沒有收入只有支出 → 儲蓄率為 null（不是 0、不是 NaN）", () => {
    const s = summarizeMonth([expense("1200", 餐飲)]);

    expect(s.savingsRate).toBeNull();
    expect(s.savingsRate).not.toBe(0);
    expect(s.totalIncome.toFixed(2)).toBe("0.00");
    expect(s.balance.toFixed(2)).toBe("-1200.00");
  });

  it("案例 3：完全沒有任何交易 → 各項為 0、儲蓄率 null", () => {
    const s = summarizeMonth([]);

    expect(s.totalIncome.toFixed(2)).toBe("0.00");
    expect(s.totalExpense.toFixed(2)).toBe("0.00");
    expect(s.balance.toFixed(2)).toBe("0.00");
    expect(s.actualSaved.toFixed(2)).toBe("0.00");
    expect(s.savingsRate).toBeNull();
    expect(s.transactionCount).toBe(0);
    expect(emptySummary().savingsRate).toBeNull();
  });

  it("案例 4：含一筆 TRANSFER 10,000 → 收入、支出、儲蓄率完全不受影響", () => {
    const base = [income("50000"), expense("30000", 餐飲)];
    const withTransfer = [...base, transfer("10000")];

    const a = summarizeMonth(base);
    const b = summarizeMonth(withTransfer);

    expect(b.totalIncome.toFixed(2)).toBe(a.totalIncome.toFixed(2));
    expect(b.totalExpense.toFixed(2)).toBe(a.totalExpense.toFixed(2));
    expect(b.savingsRate).toBe(a.savingsRate);
    expect(b.transactionCount).toBe(2);
  });

  it("案例 5：支出大於收入 → 儲蓄率為負值（不可 clamp 到 0）", () => {
    const s = summarizeMonth([income("30000"), expense("45000", 餐飲)]);

    expect(s.savingsRate).toBeLessThan(0);
    expect(s.savingsRate).toBeCloseTo(-0.5, 10);
    expect(s.balance.toFixed(2)).toBe("-15000.00");
  });

  it("案例 6：只有儲蓄支出、沒有其他消費 → 儲蓄率 100%", () => {
    const s = summarizeMonth([income("40000"), expense("15000", 儲蓄)]);

    expect(s.consumptionExpense.toFixed(2)).toBe("0.00");
    expect(s.savingsRate).toBe(1);
    expect(s.actualSaved.toFixed(2)).toBe("40000.00");
  });

  it("案例 7：交易日期落在當月 1 日與最後一日 → 兩筆都要算進來", () => {
    const s = summarizeMonth(
      [expense("100", 餐飲, "2026-09-01"), expense("200", 餐飲, "2026-09-30")],
      "2026-09",
    );

    expect(s.consumptionExpense.toFixed(2)).toBe("300.00");
    expect(s.transactionCount).toBe(2);
  });

  it("案例 8：交易日期落在上月最後一日與次月 1 日 → 兩筆都不能算進來", () => {
    const s = summarizeMonth(
      [expense("100", 餐飲, "2026-08-31"), expense("200", 餐飲, "2026-10-01")],
      "2026-09",
    );

    expect(s.consumptionExpense.toFixed(2)).toBe("0.00");
    expect(s.transactionCount).toBe(0);
  });

  it("案例 9：帶小數的金額加總精確，不出現浮點誤差", () => {
    const s = summarizeMonth([
      expense("33.33", 餐飲),
      expense("33.33", 餐飲),
      expense("33.33", 餐飲),
    ]);

    expect(s.consumptionExpense.toFixed(2)).toBe("99.99");
    // 若用 JS number 相加會得到 99.99000000000001
    expect(s.consumptionExpense.toString()).toBe("99.99");
  });
});

describe("summarizeMonth — 其他邊界", () => {
  it("沒有分類的支出視為消費支出，不會被當成儲蓄", () => {
    const s = summarizeMonth([
      income("1000"),
      { type: TransactionType.EXPENSE, amount: "400", date: "2026-09-02" },
    ]);

    expect(s.consumptionExpense.toFixed(2)).toBe("400.00");
    expect(s.savingsExpense.toFixed(2)).toBe("0.00");
  });

  it("date 傳 Date 物件也能正確分月", () => {
    const s = summarizeMonth(
      [
        {
          type: TransactionType.EXPENSE,
          amount: "500",
          date: new Date("2026-09-15T00:00:00.000Z"),
          category: 餐飲,
        },
      ],
      "2026-09",
    );

    expect(s.consumptionExpense.toFixed(2)).toBe("500.00");
  });

  it("filterMonth 不會改動原陣列", () => {
    const txs = [expense("100", 餐飲, "2026-09-01"), expense("100", 餐飲, "2026-08-01")];
    const result = filterMonth(txs, "2026-09");

    expect(result).toHaveLength(1);
    expect(txs).toHaveLength(2);
  });
});

describe("expenseByCategory", () => {
  it("只取消費支出，排除儲蓄與 TRANSFER，並依金額由大到小排序", () => {
    const items = expenseByCategory([
      income("50000"),
      expense("3000", 餐飲),
      expense("1000", 交通),
      expense("20000", 儲蓄),
      transfer("5000"),
    ]);

    expect(items.map((i) => i.name)).toEqual(["餐飲", "交通"]);
    expect(items[0].amount.toFixed(2)).toBe("3000.00");
    expect(items[0].ratio).toBeCloseTo(0.75, 10);
    expect(items[1].ratio).toBeCloseTo(0.25, 10);
    expect(items[0].color).toBe("#f59e0b");
  });

  it("同分類的多筆交易會合併", () => {
    const items = expenseByCategory([
      expense("120", 餐飲),
      expense("80", 餐飲),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].amount.toFixed(2)).toBe("200.00");
    expect(items[0].ratio).toBe(1);
  });

  it("沒有分類的支出歸到「未分類」", () => {
    const items = expenseByCategory([
      { type: TransactionType.EXPENSE, amount: "50", date: "2026-09-01" },
    ]);

    expect(items[0].name).toBe(UNCATEGORIZED_LABEL);
    expect(items[0].categoryId).toBeNull();
  });

  it("沒有消費支出時回傳空陣列，不會除以零", () => {
    expect(expenseByCategory([income("1000")])).toEqual([]);
  });
});
