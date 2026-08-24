import { describe, expect, it } from "vitest";
import { parseTpexRows, parseTwseRows, rocDateToYmd } from "./quotes";

/**
 * 樣本直接取自兩個 API 的真實回應（2026-08-24 抓的），
 * 這樣測試不必連網，也不會因為當天行情變動而不穩定。
 */
const TWSE_SAMPLE = [
  {
    Date: "1150821",
    Code: "2330",
    Name: "台積電",
    TradeVolume: "18922480",
    TradeValue: "45275662448",
    OpeningPrice: "2375.00",
    HighestPrice: "2410.00",
    LowestPrice: "2365.00",
    ClosingPrice: "2410.00",
    Change: "35.0000",
    Transaction: "59539",
  },
  {
    Date: "1150821",
    Code: "0050",
    Name: "元大台灣50",
    ClosingPrice: "104.65",
    Change: "-0.5000",
  },
  // 停牌／無成交：價格是 "--"，必須被略過而不是當成 0
  { Date: "1150821", Code: "9999", Name: "停牌股", ClosingPrice: "--", Change: "0" },
];

const TPEX_SAMPLE = [
  {
    Date: "1150824",
    SecuritiesCompanyCode: "00679B",
    CompanyName: "元大美債20年",
    Close: "25.83",
    Change: "-0.01",
    Open: "25.80",
  },
];

describe("rocDateToYmd", () => {
  it("民國轉西元", () => {
    expect(rocDateToYmd("1150821")).toBe("2026-08-21");
    expect(rocDateToYmd("1000101")).toBe("2011-01-01");
    expect(rocDateToYmd("1151231")).toBe("2026-12-31");
  });

  it("格式不對回傳 null 而不是拋錯（外部資料不能信）", () => {
    expect(rocDateToYmd("")).toBeNull();
    expect(rocDateToYmd("115082")).toBeNull();
    expect(rocDateToYmd("abcdefg")).toBeNull();
    expect(rocDateToYmd("1151321")).toBeNull(); // 13 月
    expect(rocDateToYmd("1150832")).toBeNull(); // 32 日
  });
});

describe("parseTwseRows（上市）", () => {
  it("解析真實樣本", () => {
    const quotes = parseTwseRows(TWSE_SAMPLE);
    const tsmc = quotes.find((q) => q.symbol === "2330");

    expect(tsmc?.name).toBe("台積電");
    expect(tsmc?.price.toFixed(2)).toBe("2410.00");
    expect(tsmc?.change.toFixed(2)).toBe("35.00");
    expect(tsmc?.date).toBe("2026-08-21");
    expect(tsmc?.market).toBe("TWSE");
  });

  it("ETF 也解析得到", () => {
    const etf = parseTwseRows(TWSE_SAMPLE).find((q) => q.symbol === "0050");
    expect(etf?.name).toBe("元大台灣50");
    expect(etf?.price.toFixed(2)).toBe("104.65");
    expect(etf?.change.isNegative()).toBe(true);
  });

  it("價格是 -- 的停牌股要被略過，不能當成 0 元", () => {
    const quotes = parseTwseRows(TWSE_SAMPLE);
    expect(quotes.find((q) => q.symbol === "9999")).toBeUndefined();
    expect(quotes).toHaveLength(2);
  });

  it("餵進非陣列或壞資料時回傳空陣列，不拋錯", () => {
    expect(parseTwseRows(null)).toEqual([]);
    expect(parseTwseRows({})).toEqual([]);
    expect(parseTwseRows("boom")).toEqual([]);
    expect(parseTwseRows([{}, { Code: "2330" }, null])).toEqual([]);
  });
});

describe("parseTpexRows（上櫃）", () => {
  it("欄位名稱跟證交所不同，一樣要解析得出來", () => {
    const [q] = parseTpexRows(TPEX_SAMPLE);
    expect(q.symbol).toBe("00679B");
    expect(q.name).toBe("元大美債20年");
    expect(q.price.toFixed(2)).toBe("25.83");
    expect(q.date).toBe("2026-08-24");
    expect(q.market).toBe("TPEX");
  });

  it("壞資料不拋錯", () => {
    expect(parseTpexRows(undefined)).toEqual([]);
    expect(parseTpexRows([{ SecuritiesCompanyCode: "1234" }])).toEqual([]);
  });
});
