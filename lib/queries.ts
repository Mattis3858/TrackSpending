/**
 * 資料庫讀取層。
 *
 * 鐵則（SPEC 5.1 / 7.2）：每個查詢都必須帶 userId。
 * 另外所有回傳值都已經把 Decimal 轉成字串，可以安全傳給 Client Component（SPEC 5.5）。
 */
import { prisma } from "@/lib/prisma";
import { fromDbDate, monthRange, type YearMonth, type Ymd } from "@/lib/date";
import { ZERO, money, toAmountString } from "@/lib/money";
import type { TransactionType } from "@/generated/prisma/enums";
import { isSetAsideKind, type CategoryKind } from "@/lib/category";
import type { Market } from "@/generated/prisma/enums";
import type { MonthlyTotal } from "@/lib/analysis";

export type CategoryDTO = {
  id: string;
  name: string;
  type: TransactionType;
  kind: CategoryKind;
  /** 衍生自 kind：儲蓄與投資都不算消費。報表層只關心這個布林值 */
  isSavings: boolean;
  isDefault: boolean;
  color: string | null;
  sortOrder: number;
};

export type TransactionDTO = {
  id: string;
  date: Ymd;
  type: TransactionType;
  amount: string;
  note: string | null;
  category: {
    id: string;
    name: string;
    kind: CategoryKind;
    isSavings: boolean;
    color: string | null;
  } | null;
};

const categorySelect = {
  id: true,
  name: true,
  type: true,
  kind: true,
  isDefault: true,
  color: true,
  sortOrder: true,
} as const;

export async function getCategories(
  userId: string,
  options: { includeArchived?: boolean } = {},
): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    where: {
      userId,
      ...(options.includeArchived ? {} : { archived: false }),
    },
    select: categorySelect,
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ ...r, isSavings: isSetAsideKind(r.kind) }));
}

function toTransactionDTO(row: {
  id: string;
  date: Date;
  type: TransactionType;
  amount: unknown;
  note: string | null;
  category: {
    id: string;
    name: string;
    kind: CategoryKind;
    color: string | null;
  } | null;
}): TransactionDTO {
  return {
    id: row.id,
    date: fromDbDate(row.date),
    type: row.type,
    amount: toAmountString(row.amount as { toString(): string }),
    note: row.note,
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          kind: row.category.kind,
          isSavings: isSetAsideKind(row.category.kind),
          color: row.category.color,
        }
      : null,
  };
}

const transactionSelect = {
  id: true,
  date: true,
  type: true,
  amount: true,
  note: true,
  category: {
    select: { id: true, name: true, kind: true, color: true },
  },
} as const;

/** 某月的所有交易，日期新到舊 */
export async function getTransactionsForMonth(
  userId: string,
  ym: YearMonth,
): Promise<TransactionDTO[]> {
  const { gte, lt } = monthRange(ym);
  const rows = await prisma.transaction.findMany({
    where: { userId, date: { gte, lt } },
    select: transactionSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toTransactionDTO);
}

export async function getTransaction(
  userId: string,
  id: string,
): Promise<TransactionDTO | null> {
  const row = await prisma.transaction.findFirst({
    where: { id, userId },
    select: transactionSelect,
  });
  return row ? toTransactionDTO(row) : null;
}

/** 使用者最近一次使用的分類，用來當新增表單的預設值（SPEC 第 9 節 UX 要求） */
export async function getLastUsedCategoryId(
  userId: string,
): Promise<string | null> {
  const row = await prisma.transaction.findFirst({
    where: { userId, type: "EXPENSE", categoryId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { categoryId: true },
  });
  return row?.categoryId ?? null;
}

/** 有交易紀錄的月份清單，給月份切換器用 */
export async function getMonthsWithData(userId: string): Promise<YearMonth[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId },
    select: { date: true },
    orderBy: { date: "desc" },
  });
  return [...new Set(rows.map((r) => fromDbDate(r.date).slice(0, 7)))];
}

/**
 * 最近常用的支出分類（依使用次數排序），給快速記帳的大按鈕用。
 * 只看最近 90 天，讓「常用」會隨生活型態改變而變動。
 */
export async function getFrequentCategoryIds(
  userId: string,
  limit = 6,
): Promise<string[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "EXPENSE",
      categoryId: { not: null },
      date: { gte: since },
    },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: "desc" } },
    take: limit,
  });

  return rows
    .map((r) => r.categoryId)
    .filter((id): id is string => id !== null);
}

// ───────────────────────────── 月度歷史與全期累計

/**
 * 每個月的收入 / 消費 / 儲蓄 / 投資小計，新到舊。
 *
 * 用一支 SQL 一次算完（而不是把所有交易撈回來在 JS 裡分組），
 * 資料累積幾年後仍然是常數級的回傳量。
 * amount 用 ::text 轉字串再進 Decimal，避免經過 JS number 失去精度。
 */
export async function getMonthlyTotals(userId: string): Promise<MonthlyTotal[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      ym: string;
      income: string;
      consumption: string;
      savings: string;
      investment: string;
    }>
  >`
    select
      to_char(t."date", 'YYYY-MM') as ym,
      sum(case when t."type" = 'INCOME' then t."amount" else 0 end)::text as income,
      sum(case when t."type" = 'EXPENSE'
                and (c."kind" is null or c."kind" in ('VARIABLE', 'FIXED'))
               then t."amount" else 0 end)::text as consumption,
      sum(case when t."type" = 'EXPENSE' and c."kind" = 'SAVINGS'
               then t."amount" else 0 end)::text as savings,
      sum(case when t."type" = 'EXPENSE' and c."kind" = 'INVESTMENT'
               then t."amount" else 0 end)::text as investment
    from "Transaction" t
    left join "Category" c on c."id" = t."categoryId"
    where t."userId" = ${userId}
    group by 1
    order by 1 desc
  `;

  return rows.map((r) => ({
    yearMonth: r.ym,
    income: money(r.income),
    consumption: money(r.consumption),
    savings: money(r.savings),
    investment: money(r.investment),
  }));
}

/** 開始記帳以來的累計，直接由月度小計加總而來 */
export function sumMonthlyTotals(history: MonthlyTotal[]) {
  return history.reduce(
    (acc, h) => ({
      income: acc.income.plus(h.income),
      consumption: acc.consumption.plus(h.consumption),
      savings: acc.savings.plus(h.savings),
      investment: acc.investment.plus(h.investment),
    }),
    { income: ZERO, consumption: ZERO, savings: ZERO, investment: ZERO },
  );
}

// ───────────────────────────── 使用者設定

export type UserSettingDTO = {
  startingCash: string;
  cashUsd: string;
  monthlyBudget: string | null;
  targetSavingsRate: number | null;
  payday: number | null;
};

export const DEFAULT_USER_SETTING: UserSettingDTO = {
  startingCash: "0.00",
  cashUsd: "0.00",
  monthlyBudget: null,
  targetSavingsRate: null,
  payday: null,
};

export async function getUserSetting(userId: string): Promise<UserSettingDTO> {
  const row = await prisma.userSetting.findUnique({ where: { userId } });
  if (!row) return DEFAULT_USER_SETTING;

  return {
    startingCash: toAmountString(row.startingCash),
    cashUsd: toAmountString(row.cashUsd),
    monthlyBudget: row.monthlyBudget ? toAmountString(row.monthlyBudget) : null,
    targetSavingsRate: row.targetSavingsRate,
    payday: row.payday,
  };
}

// ───────────────────────────── 持股

export type HoldingDTO = {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  shares: string;
  cost: string;
  note: string | null;
};

export async function getHoldings(userId: string): Promise<HoldingDTO[]> {
  const rows = await prisma.holding.findMany({
    where: { userId, archived: false },
    select: {
      id: true,
      symbol: true,
      name: true,
      market: true,
      shares: true,
      cost: true,
      note: true,
    },
    orderBy: [{ sortOrder: "asc" }, { symbol: "asc" }],
  });

  return rows.map((r) => ({
    ...r,
    shares: r.shares.toString(),
    cost: toAmountString(r.cost),
  }));
}
