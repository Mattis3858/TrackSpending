/**
 * CategoryKind 的語意集中在這裡 — 見 SPEC 5.2 / 5.8
 *
 * 四種性質互斥：
 *   VARIABLE   變動消費：餐飲、交通、娛樂。日常可控的花費
 *   FIXED      固定消費：房租、水電瓦斯、保險。仍然是消費，但短期內砍不掉
 *   SAVINGS    儲蓄：錢存起來，仍然是現金，隨時可動用
 *   INVESTMENT 投資：錢投入股票 / ETF，離開現金部位
 *
 * VARIABLE + FIXED = 消費支出（會壓低儲蓄率）
 * SAVINGS + INVESTMENT = 存下來的錢（不算消費）
 * 只有 SAVINGS 算進緊急預備金；INVESTMENT 不算，因為真的失業時不該被迫在低點賣股。
 */

export const CATEGORY_KINDS = [
  "VARIABLE",
  "FIXED",
  "SAVINGS",
  "INVESTMENT",
] as const;

export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const KIND_LABEL: Record<CategoryKind, string> = {
  VARIABLE: "變動消費",
  FIXED: "固定支出",
  SAVINGS: "儲蓄",
  INVESTMENT: "投資",
};

export const KIND_HINT: Record<CategoryKind, string> = {
  VARIABLE: "日常可控的花費，例如餐飲、交通、娛樂",
  FIXED: "金額穩定、短期內砍不掉的花費，例如房租、保險",
  SAVINGS: "存起來但仍是現金，會計入緊急預備金",
  INVESTMENT: "投入股票 / ETF，不計入緊急預備金",
};

/** 不算消費（不壓低儲蓄率）：儲蓄與投資 */
export function isSetAsideKind(kind: CategoryKind): boolean {
  return kind === "SAVINGS" || kind === "INVESTMENT";
}

/** 算進消費支出：變動與固定 */
export function isConsumptionKind(kind: CategoryKind): boolean {
  return !isSetAsideKind(kind);
}

/** 只有 SAVINGS 是隨時可動用的現金 */
export function isCashKind(kind: CategoryKind): boolean {
  return kind === "SAVINGS";
}
