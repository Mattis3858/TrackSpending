/**
 * 資產對帳 — 見 SPEC 8.10
 *
 * 純函式，不碰資料庫。
 */

import { Decimal, ZERO, money, type MoneyInput } from "./money";

export type ReconcileResult = {
  /** 系統依據交易紀錄算出來的現金 */
  expected: Decimal;
  /** 使用者實際數出來的餘額 */
  actual: Decimal;
  /** 實際 − 系統。負數代表實際比較少（有漏記的支出） */
  difference: Decimal;
  /** 差額方向：要補一筆支出還是收入 */
  direction: "EXPENSE" | "INCOME" | "NONE";
  /** 需要調整的金額（絕對值） */
  amount: Decimal;
};

/** 對帳調整用的分類名稱。收入與支出兩個方向共用同一個名稱 */
export const ADJUSTMENT_CATEGORY = "差額調整";

/** 小於一元的差額不值得建立一筆交易 */
const THRESHOLD = "1";

export function reconcile(
  expected: MoneyInput,
  actual: MoneyInput,
): ReconcileResult {
  const e = money(expected);
  const a = money(actual);
  const difference = a.minus(e);
  const amount = difference.abs();

  let direction: ReconcileResult["direction"] = "NONE";
  if (amount.greaterThanOrEqualTo(THRESHOLD)) {
    // 實際比系統少 → 有花掉但沒記到的錢 → 補一筆支出
    direction = difference.isNegative() ? "EXPENSE" : "INCOME";
  }

  return {
    expected: e,
    actual: a,
    difference,
    direction,
    amount: direction === "NONE" ? ZERO : amount,
  };
}
