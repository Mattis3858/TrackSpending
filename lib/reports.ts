/**
 * 報表計算 — 見 SPEC.md 第 8 節
 *
 * 這個檔案是純函式，不碰資料庫、不 import Prisma Client，
 * 目的是讓 lib/reports.test.ts 能完整覆蓋計算邏輯。
 *
 * 兩個最容易寫錯的規則：
 * 1. TRANSFER 完全不計入任何加總。
 * 2. 「儲蓄」是 EXPENSE 但不是消費，儲蓄率 = (總收入 − 消費支出) / 總收入。
 *    用 (收入 − 總支出) / 收入 會讓「有存錢」反而算出 0%，這是 v1 的錯誤。
 */

import { TransactionType } from "@/generated/prisma/enums";
import { Decimal, ZERO, money, sum, type MoneyInput } from "./money";
import { fromDbDate, yearMonthOf, type YearMonth, type Ymd } from "./date";
import type { CategoryKind } from "./category";

export type ReportCategory = {
  id: string;
  name: string;
  /** 儲蓄或投資，不計入消費支出 */
  isSavings: boolean;
  /** 細分性質。舊資料或測試沒帶時，只會少掉固定/變動與投資的拆分，主要加總不受影響 */
  kind?: CategoryKind;
  color?: string | null;
};

/** 報表只需要這幾個欄位，不必是完整的 Transaction */
export type TxForReport = {
  type: TransactionType;
  amount: MoneyInput;
  date: Ymd | Date;
  category?: ReportCategory | null;
};

export type MonthSummary = {
  /** 收入合計 */
  totalIncome: Decimal;
  /** 消費支出：EXPENSE 且 category.isSavings = false */
  consumptionExpense: Decimal;
  /** 存下來的支出：EXPENSE 且 category.isSavings = true（儲蓄 + 投資） */
  savingsExpense: Decimal;
  /** 其中投入投資的部分（kind = INVESTMENT）。這筆錢離開現金部位 */
  investmentExpense: Decimal;
  /** 其中仍是現金的儲蓄（savingsExpense − investmentExpense） */
  cashSavingsExpense: Decimal;
  /** 消費中的固定支出（kind = FIXED）：房租、保險等短期砍不掉的 */
  fixedExpense: Decimal;
  /** 消費中的變動支出：consumptionExpense − fixedExpense */
  variableExpense: Decimal;
  /** 總支出 = 消費 + 儲蓄 */
  totalExpense: Decimal;
  /** 結餘 = 總收入 − 總支出 */
  balance: Decimal;
  /** 實際存下 = 總收入 − 消費支出 = 結餘 + 儲蓄支出 */
  actualSaved: Decimal;
  /** 儲蓄率；沒有收入時為 null（不可以回傳 0 或 NaN） */
  savingsRate: number | null;
  /** 納入計算的交易筆數（不含 TRANSFER） */
  transactionCount: number;
};

export type CategoryBreakdownItem = {
  categoryId: string | null;
  name: string;
  color: string | null;
  amount: Decimal;
  /** 佔消費支出的比例，0~1 */
  ratio: number;
};

export const UNCATEGORIZED_LABEL = "未分類";

function ymdOf(tx: TxForReport): Ymd {
  return tx.date instanceof Date ? fromDbDate(tx.date) : tx.date;
}

/** 是否納入收支報表：TRANSFER 一律排除 */
function isCountable(tx: TxForReport): boolean {
  return tx.type !== TransactionType.TRANSFER;
}

function isSavingsExpense(tx: TxForReport): boolean {
  return tx.type === TransactionType.EXPENSE && tx.category?.isSavings === true;
}

function isConsumptionExpense(tx: TxForReport): boolean {
  return tx.type === TransactionType.EXPENSE && tx.category?.isSavings !== true;
}

/** 篩出屬於某月的交易（含當月 1 日與最後一日） */
export function filterMonth<T extends TxForReport>(
  txs: T[],
  ym: YearMonth,
): T[] {
  return txs.filter((tx) => yearMonthOf(ymdOf(tx)) === ym);
}

/**
 * 月報表加總。
 * 傳入 yearMonth 時會先篩月份；不傳則假設 txs 已經是該月的資料。
 */
export function summarizeMonth(
  txs: TxForReport[],
  yearMonth?: YearMonth,
): MonthSummary {
  const scoped = (yearMonth ? filterMonth(txs, yearMonth) : txs).filter(
    isCountable,
  );

  const totalIncome = sum(
    scoped
      .filter((tx) => tx.type === TransactionType.INCOME)
      .map((tx) => tx.amount),
  );
  const consumptionExpense = sum(
    scoped.filter(isConsumptionExpense).map((tx) => tx.amount),
  );
  const savingsExpense = sum(
    scoped.filter(isSavingsExpense).map((tx) => tx.amount),
  );
  const investmentExpense = sum(
    scoped
      .filter((tx) => isSavingsExpense(tx) && tx.category?.kind === "INVESTMENT")
      .map((tx) => tx.amount),
  );
  const fixedExpense = sum(
    scoped
      .filter((tx) => isConsumptionExpense(tx) && tx.category?.kind === "FIXED")
      .map((tx) => tx.amount),
  );

  const totalExpense = consumptionExpense.plus(savingsExpense);
  const balance = totalIncome.minus(totalExpense);
  const actualSaved = totalIncome.minus(consumptionExpense);

  const savingsRate = totalIncome.greaterThan(0)
    ? actualSaved.dividedBy(totalIncome).toNumber()
    : null;

  return {
    totalIncome,
    consumptionExpense,
    savingsExpense,
    investmentExpense,
    cashSavingsExpense: savingsExpense.minus(investmentExpense),
    fixedExpense,
    variableExpense: consumptionExpense.minus(fixedExpense),
    totalExpense,
    balance,
    actualSaved,
    savingsRate,
    transactionCount: scoped.length,
  };
}

/**
 * 分類圓餅圖資料：只取「消費支出」。
 * 儲蓄不放進圓餅圖，否則餐飲等日常分類的佔比會被稀釋到沒有意義。見 SPEC 8.3
 */
export function expenseByCategory(
  txs: TxForReport[],
  yearMonth?: YearMonth,
): CategoryBreakdownItem[] {
  const scoped = (yearMonth ? filterMonth(txs, yearMonth) : txs)
    .filter(isCountable)
    .filter(isConsumptionExpense);

  const buckets = new Map<
    string,
    { categoryId: string | null; name: string; color: string | null; amount: Decimal }
  >();

  for (const tx of scoped) {
    const key = tx.category?.id ?? "__uncategorized__";
    const existing = buckets.get(key);
    if (existing) {
      existing.amount = existing.amount.plus(money(tx.amount));
    } else {
      buckets.set(key, {
        categoryId: tx.category?.id ?? null,
        name: tx.category?.name ?? UNCATEGORIZED_LABEL,
        color: tx.category?.color ?? null,
        amount: money(tx.amount),
      });
    }
  }

  const total = sum([...buckets.values()].map((b) => b.amount));

  return [...buckets.values()]
    .map((b) => ({
      ...b,
      ratio: total.greaterThan(0) ? b.amount.dividedBy(total).toNumber() : 0,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));
}

/** 空報表，給「當月完全沒有交易」的情況用 */
export function emptySummary(): MonthSummary {
  return {
    totalIncome: ZERO,
    consumptionExpense: ZERO,
    savingsExpense: ZERO,
    investmentExpense: ZERO,
    cashSavingsExpense: ZERO,
    fixedExpense: ZERO,
    variableExpense: ZERO,
    totalExpense: ZERO,
    balance: ZERO,
    actualSaved: ZERO,
    savingsRate: null,
    transactionCount: 0,
  };
}
