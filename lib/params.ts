import { currentYearMonth, isValidYearMonth, type YearMonth } from "./date";

/** 從 searchParams 讀月份，非法或未指定一律回退到當月 */
export function readYearMonth(value: string | string[] | undefined): YearMonth {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && isValidYearMonth(raw) ? raw : currentYearMonth();
}
