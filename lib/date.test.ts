import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampDayOfMonth,
  currentYearMonth,
  daysInMonth,
  formatDateLabel,
  formatYearMonthLabel,
  fromDbDate,
  isValidYearMonth,
  isValidYmd,
  monthRange,
  toDbDate,
  todayTaipei,
  yearMonthOf,
} from "./date";

describe("todayTaipei", () => {
  it("回傳 YYYY-MM-DD 格式", () => {
    expect(todayTaipei()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(currentYearMonth()).toMatch(/^\d{4}-\d{2}$/);
  });

  it("用台北時區，不是 UTC（UTC 早上 8 點前兩者會差一天）", () => {
    const utcDate = new Date().toISOString().slice(0, 10);
    const taipeiDate = todayTaipei();
    // 兩者只可能相同或相差一天，taipei 不會早於 utc
    expect(taipeiDate >= utcDate).toBe(true);
  });
});

describe("toDbDate / fromDbDate", () => {
  it("來回轉換不會掉一天", () => {
    for (const ymd of ["2026-01-01", "2026-02-28", "2026-08-18", "2026-12-31"]) {
      expect(fromDbDate(toDbDate(ymd))).toBe(ymd);
    }
  });

  it("存進去的是 UTC 午夜，不帶時刻", () => {
    expect(toDbDate("2026-08-18").toISOString()).toBe("2026-08-18T00:00:00.000Z");
  });

  it("格式不合法會拋錯", () => {
    expect(() => toDbDate("2026-13-01")).toThrow();
    expect(() => toDbDate("2026-02-30")).toThrow();
    expect(() => toDbDate("20260818")).toThrow();
  });
});

describe("monthRange", () => {
  it("區間是 [當月1日, 次月1日)", () => {
    const { gte, lt } = monthRange("2026-09");
    expect(gte.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("跨年正確", () => {
    const { gte, lt } = monthRange("2026-12");
    expect(gte.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("addMonths", () => {
  it("正常前後移動", () => {
    expect(addMonths("2026-08", 1)).toBe("2026-09");
    expect(addMonths("2026-08", -1)).toBe("2026-07");
  });

  it("跨年", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-01", -13)).toBe("2024-12");
  });
});

describe("daysInMonth / clampDayOfMonth", () => {
  it("平年二月 28 天、閏年 29 天", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-04")).toBe(30);
  });

  it("SPEC 5.6：dayOfMonth = 31 在二月要 clamp 到當月最後一天", () => {
    expect(clampDayOfMonth("2026-02", 31)).toBe("2026-02-28");
    expect(clampDayOfMonth("2028-02", 31)).toBe("2028-02-29");
    expect(clampDayOfMonth("2026-04", 31)).toBe("2026-04-30");
    expect(clampDayOfMonth("2026-01", 31)).toBe("2026-01-31");
  });

  it("dayOfMonth 小於 1 會被夾到 1", () => {
    expect(clampDayOfMonth("2026-05", 0)).toBe("2026-05-01");
    expect(clampDayOfMonth("2026-05", -5)).toBe("2026-05-01");
  });

  it("正常日期不受影響", () => {
    expect(clampDayOfMonth("2026-05", 5)).toBe("2026-05-05");
  });
});

describe("驗證與顯示", () => {
  it("isValidYmd / isValidYearMonth", () => {
    expect(isValidYmd("2026-08-18")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(isValidYmd("2026-00-10")).toBe(false);
    expect(isValidYearMonth("2026-08")).toBe(true);
    expect(isValidYearMonth("2026-13")).toBe(false);
  });

  it("yearMonthOf", () => {
    expect(yearMonthOf("2026-08-18")).toBe("2026-08");
  });

  it("formatYearMonthLabel 去掉月份前面的 0", () => {
    expect(formatYearMonthLabel("2026-08")).toBe("2026 年 8 月");
    expect(formatYearMonthLabel("2026-12")).toBe("2026 年 12 月");
  });

  it("formatDateLabel 顯示星期", () => {
    // 2026-08-18 是星期二
    expect(formatDateLabel("2026-08-18")).toBe("8/18（二）");
  });
});

describe("addDays", () => {
  it("一般加減", () => {
    expect(addDays("2026-08-18", 1)).toBe("2026-08-19");
    expect(addDays("2026-08-18", -1)).toBe("2026-08-17");
  });

  it("跨月", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("跨年", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("閏年二月", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
