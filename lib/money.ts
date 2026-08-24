/**
 * 金額工具 — 見 SPEC.md 5.5
 *
 * 規則：
 * 1. 金額全程用 Decimal 計算，不要用 JS number（浮點誤差會讓帳對不起來）。
 * 2. amount 永遠是正數，方向由 TransactionType 決定。退款記成 INCOME，不用負數。
 * 3. Prisma 的 Decimal 不能直接傳給 Client Component（會噴 "Only plain objects
 *    can be passed to Client Components"），要先用 toAmountString() 轉字串。
 * 4. 除了這個檔案，其他地方不應該出現 Number(amount)。
 */

import { Decimal } from "decimal.js";

export { Decimal };

/** 可以當金額用的輸入：Decimal、字串，或 Prisma 回傳的 Decimal（有 toString） */
export type MoneyInput = Decimal | string | number | { toString(): string };

const NUMERIC_RE = /^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$/;

export const ZERO = new Decimal(0);

export function money(value: MoneyInput): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${value}`);
    return new Decimal(value);
  }
  const s = (typeof value === "string" ? value : value.toString()).trim();
  // 先自己驗格式：直接把空字串或亂碼丟給 decimal.js 會拋 DecimalError，
  // 那個錯誤訊息對呼叫端沒有意義，也不好在表單層攔截。
  if (!NUMERIC_RE.test(s)) throw new Error(`Invalid amount: ${JSON.stringify(s)}`);
  const d = new Decimal(s);
  if (!d.isFinite()) throw new Error(`Invalid amount: ${s}`);
  return d;
}

export function sum(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), ZERO);
}

/** 交易金額必須 > 0 */
export function isPositiveAmount(value: MoneyInput): boolean {
  try {
    return money(value).greaterThan(0);
  } catch {
    return false;
  }
}

/** 寫進 DB 用：固定兩位小數的字串，Prisma 會轉成 Decimal(10,2) */
export function toDbAmount(value: MoneyInput): string {
  return money(value).toFixed(2, Decimal.ROUND_HALF_UP);
}

/** 傳給 Client Component 用：純字串，避免 Decimal 序列化錯誤 */
export function toAmountString(value: MoneyInput): string {
  return money(value).toFixed(2, Decimal.ROUND_HALF_UP);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * "NT$ 1,234"（整數）或 "NT$ 1,234.56"（有小數）
 * 不經過 JS number，避免大額或多小數位失真。
 */
export function formatTWD(
  value: MoneyInput,
  options: { alwaysCents?: boolean; sign?: boolean } = {},
): string {
  const d = money(value);
  const negative = d.isNegative();
  const abs = d.abs();
  const fixed = abs.toFixed(2, Decimal.ROUND_HALF_UP);
  const [int, cents] = fixed.split(".");
  const showCents = options.alwaysCents || cents !== "00";
  const body = showCents ? `${group(int)}.${cents}` : group(int);

  const prefix = negative ? "-" : options.sign && !abs.isZero() ? "+" : "";
  return `${prefix}NT$ ${body}`;
}

/**
 * 儲蓄率等比率的顯示。null 代表「無法計算」（例如當月沒有收入），
 * 必須顯示 "—"，不可以顯示 0%、NaN 或 Infinity。見 SPEC 8.3
 */
export function formatPercent(ratio: number | null, fractionDigits = 0): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** 金額遮罩後顯示的字樣。寬度固定，切換時版面不會大幅跳動。 */
export const MASKED_AMOUNT = "NT$ ••••••";

/**
 * 依「是否隱藏金額」產生格式化函式。
 * 頁面只要 `const fmt = amountFormatter(hidden)`，其餘寫法跟 formatTWD 一樣。
 * 只遮絕對金額，百分比、天數、分類名稱維持顯示 —— 被瞄到「儲蓄率 40%」沒關係，
 * 被瞄到「總資產 NT$ 857,407」才有關係。
 */
export function amountFormatter(hidden: boolean) {
  return (
    value: MoneyInput,
    options?: { alwaysCents?: boolean; sign?: boolean },
  ): string => (hidden ? MASKED_AMOUNT : formatTWD(value, options));
}
