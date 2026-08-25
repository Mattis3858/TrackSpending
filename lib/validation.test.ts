import { describe, expect, it } from "vitest";
import { holdingInputSchema, transactionInputSchema } from "./validation";

function parseAmount(amount: string) {
  return transactionInputSchema.safeParse({
    date: "2026-08-18",
    type: "EXPENSE",
    amount,
    categoryId: "cat-1",
  });
}

function messages(amount: string) {
  const r = parseAmount(amount);
  return r.success ? [] : r.error.issues.map((i) => i.message);
}

describe("金額驗證", () => {
  it("回歸測試：空字串只回報「請輸入金額」，不可以拋 DecimalError", () => {
    // 這是實際踩到的 bug：串接 .refine() 時，即使 .min(1) 失敗後面仍會執行，
    // 導致空字串被丟進 money() 而拋出 DecimalError，整個頁面炸掉。
    expect(() => parseAmount("")).not.toThrow();
    expect(messages("")).toEqual(["請輸入金額"]);
  });

  it("純空白也不會炸", () => {
    expect(() => parseAmount("   ")).not.toThrow();
    expect(messages("   ")).toEqual(["請輸入金額"]);
  });

  it("亂碼只回報格式錯誤，不會炸", () => {
    expect(() => parseAmount("abc")).not.toThrow();
    expect(messages("abc")).toEqual(["金額只能是數字，最多兩位小數"]);
  });

  it("每種錯誤只回報一則訊息（不會連鎖噴出多個）", () => {
    for (const bad of ["", "abc", "0", "12.345", "-5"]) {
      expect(messages(bad)).toHaveLength(1);
    }
  });

  it("SPEC 5.5：0 與負數不通過", () => {
    expect(messages("0")).toEqual(["金額必須大於 0"]);
    expect(messages("0.00")).toEqual(["金額必須大於 0"]);
    expect(messages("-5")).toEqual(["金額只能是數字，最多兩位小數"]);
  });

  it("超過兩位小數不通過", () => {
    expect(messages("12.345")).toEqual(["金額只能是數字，最多兩位小數"]);
  });

  it("超出 Decimal(10,2) 上限不通過", () => {
    expect(messages("100000000")).toEqual(["金額超出上限"]);
    expect(messages("99999999.99")).toEqual([]);
  });

  it("合法金額通過", () => {
    for (const good of ["1", "100", "33.33", "0.01", "99999999.99"]) {
      expect(messages(good)).toEqual([]);
    }
  });

  it("前後空白會被容忍", () => {
    expect(messages(" 100 ")).toEqual([]);
  });
});

describe("其他欄位", () => {
  it("日期空白或格式錯誤會被擋下", () => {
    const r = transactionInputSchema.safeParse({
      date: "",
      type: "EXPENSE",
      amount: "100",
      categoryId: "cat-1",
    });
    expect(r.success).toBe(false);
  });

  it("沒選分類會被擋下", () => {
    const r = transactionInputSchema.safeParse({
      date: "2026-08-18",
      type: "EXPENSE",
      amount: "100",
      categoryId: "",
    });
    expect(r.success).toBe(false);
  });

  it("Phase 1 不接受 TRANSFER", () => {
    const r = transactionInputSchema.safeParse({
      date: "2026-08-18",
      type: "TRANSFER",
      amount: "100",
      categoryId: "cat-1",
    });
    expect(r.success).toBe(false);
  });
});

describe("持股股數驗證", () => {
  const parse = (shares: string) =>
    holdingInputSchema.safeParse({ symbol: "VOO", shares, cost: "1000" });

  const messages = (shares: string) => {
    const r = parse(shares);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it("允許到小數第 5 位（複委託零股）", () => {
    expect(messages("1.23456")).toEqual([]);
    expect(messages("0.00001")).toEqual([]);
    expect(messages("1.7583")).toEqual([]);
    expect(messages("2400")).toEqual([]);
  });

  it("超過 5 位小數被擋下", () => {
    expect(messages("1.234567")).toEqual(["股數只能是數字，最多五位小數"]);
  });

  it("0 與負數不通過", () => {
    expect(messages("0")).toEqual(["股數必須大於 0"]);
    expect(messages("0.00000")).toEqual(["股數必須大於 0"]);
    expect(messages("-1.5")).toEqual(["股數只能是數字，最多五位小數"]);
  });

  it("空值與亂碼不會拋錯", () => {
    expect(() => parse("")).not.toThrow();
    expect(messages("")).toEqual(["請輸入股數"]);
    expect(messages("abc")).toEqual(["股數只能是數字，最多五位小數"]);
  });
});
