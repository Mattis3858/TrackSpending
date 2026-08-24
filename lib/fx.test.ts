import { describe, expect, it } from "vitest";
import { parseFxResponse } from "./fx";

/** 真實回應（2026-08-24 擷取） */
const SAMPLE = {
  result: "success",
  time_last_update_utc: "Mon, 24 Aug 2026 00:02:31 +0000",
  rates: { TWD: 31.798233, JPY: 147.2, EUR: 0.86 },
};

describe("parseFxResponse", () => {
  it("取出美元兌台幣匯率與日期", () => {
    const fx = parseFxResponse(SAMPLE)!;
    expect(fx.usdToTwd.toFixed(6)).toBe("31.798233");
    expect(fx.date).toBe("2026-08-24");
  });

  it("換算金額用 Decimal 運算", () => {
    const fx = parseFxResponse(SAMPLE)!;
    // 1,426.64 USD x 31.798233 = 45,364.63 TWD
    expect(fx.usdToTwd.times("1426.64").toFixed(2)).toBe("45364.63");
  });

  it("result 不是 success 就回 null", () => {
    expect(parseFxResponse({ ...SAMPLE, result: "error" })).toBeNull();
  });

  it("沒有 TWD、或數值不合理時回 null，不會用 0 或猜的匯率", () => {
    expect(parseFxResponse({ result: "success", rates: { JPY: 147 } })).toBeNull();
    expect(parseFxResponse({ result: "success", rates: { TWD: 0 } })).toBeNull();
    expect(parseFxResponse({ result: "success", rates: { TWD: -5 } })).toBeNull();
    expect(parseFxResponse({ result: "success", rates: { TWD: "31.8" } })).toBeNull();
  });

  it("壞資料不拋錯", () => {
    expect(parseFxResponse(null)).toBeNull();
    expect(parseFxResponse("boom")).toBeNull();
    expect(parseFxResponse({})).toBeNull();
  });

  it("日期壞掉時仍回傳匯率，只是沒有日期", () => {
    const fx = parseFxResponse({ ...SAMPLE, time_last_update_utc: "not a date" })!;
    expect(fx.usdToTwd.toFixed(2)).toBe("31.80");
    expect(fx.date).toBeNull();
  });
});
