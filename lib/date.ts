/**
 * 日期工具 — 見 SPEC.md 5.3
 *
 * 規則：
 * 1. 應用層一律用 "YYYY-MM-DD" 字串傳遞日期，只在存進 DB 的邊界轉成 Date。
 * 2. 禁止用 `new Date().toISOString().slice(0,10)` 取「今天」，那是 UTC 日期，
 *    台北時間早上 8 點前會差一天。一律用 todayTaipei()。
 * 3. 這裡所有運算都用 UTC 方法（getUTCxxx 與 Date.UTC），避免伺服器時區（Vercel 是 UTC）
 *    與本機時區（UTC+8）算出不同結果。
 */

export const TZ = "Asia/Taipei";

/** "YYYY-MM-DD" */
export type Ymd = string;
/** "YYYY-MM" */
export type YearMonth = string;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;

export function isValidYmd(value: string): value is Ymd {
  if (!YMD_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonthOf(y, m);
}

export function isValidYearMonth(value: string): value is YearMonth {
  if (!YM_RE.test(value)) return false;
  const m = Number(value.slice(5, 7));
  return m >= 1 && m <= 12;
}

/** 台北時間的今天 */
export function todayTaipei(): Ymd {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 台北時間的當月 */
export function currentYearMonth(): YearMonth {
  return todayTaipei().slice(0, 7);
}

/** "2026-08-18" -> 存進 DB 用的 Date（@db.Date 只取日期部分） */
export function toDbDate(ymd: Ymd): Date {
  if (!isValidYmd(ymd)) throw new Error(`Invalid date: ${ymd}`);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** DB 讀出來的 Date -> "2026-08-18" */
export function fromDbDate(date: Date): Ymd {
  return date.toISOString().slice(0, 10);
}

/** 某月的查詢區間，右邊界用 < 不用 <= */
export function monthRange(ym: YearMonth): { gte: Date; lt: Date } {
  if (!isValidYearMonth(ym)) throw new Error(`Invalid year-month: ${ym}`);
  return { gte: toDbDate(`${ym}-01`), lt: toDbDate(`${addMonths(ym, 1)}-01`) };
}

/** 某日期字串屬於哪個月 */
export function yearMonthOf(ymd: Ymd): YearMonth {
  return ymd.slice(0, 7);
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  if (!isValidYearMonth(ym)) throw new Error(`Invalid year-month: ${ym}`);
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  const total = year * 12 + (month - 1) + delta;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

function daysInMonthOf(year: number, month: number): number {
  // Date.UTC 的 day=0 代表「上個月的最後一天」
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysInMonth(ym: YearMonth): number {
  if (!isValidYearMonth(ym)) throw new Error(`Invalid year-month: ${ym}`);
  return daysInMonthOf(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)));
}

/**
 * 固定收支範本用：把 dayOfMonth 夾到當月存在的日期。
 * 例：dayOfMonth = 31 在 2026-02 會落到 2026-02-28。見 SPEC 5.6
 */
export function clampDayOfMonth(ym: YearMonth, dayOfMonth: number): Ymd {
  const last = daysInMonth(ym);
  const day = Math.min(Math.max(Math.trunc(dayOfMonth), 1), last);
  return `${ym}-${String(day).padStart(2, "0")}`;
}

/** "2026-08" -> "2026 年 8 月" */
export function formatYearMonthLabel(ym: YearMonth): string {
  return `${ym.slice(0, 4)} 年 ${Number(ym.slice(5, 7))} 月`;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** "2026-08-18" -> "8/18（二）" */
export function formatDateLabel(ymd: Ymd): string {
  const d = toDbDate(ymd);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAYS[d.getUTCDay()]}）`;
}

/** 日期加減天數，跨月跨年都正確 */
export function addDays(ymd: Ymd, delta: number): Ymd {
  const d = toDbDate(ymd);
  d.setUTCDate(d.getUTCDate() + delta);
  return fromDbDate(d);
}
