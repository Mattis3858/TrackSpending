import { describe, expect, it } from "vitest";
import { describeDevice, isGoneStatus, urlBase64ToUint8Array } from "./push";

describe("urlBase64ToUint8Array", () => {
  it("轉換 base64url 並補上 padding", () => {
    // "hello" 的 base64 是 aGVsbG8=，base64url 去掉 padding 後是 aGVsbG8
    const bytes = urlBase64ToUint8Array("aGVsbG8");
    expect([...bytes]).toEqual([104, 101, 108, 108, 111]);
  });

  it("處理 base64url 專用的 - 與 _ 字元", () => {
    // base64 的 +/ 在 base64url 是 -_
    const withDash = urlBase64ToUint8Array("-_8");
    const withPlus = urlBase64ToUint8Array("+/8");
    expect([...withDash]).toEqual([...withPlus]);
  });

  it("真實長度的 VAPID 公鑰（87 字元）轉出 65 bytes", () => {
    const key = "B" + "A".repeat(86);
    expect(urlBase64ToUint8Array(key).length).toBe(65);
  });
});

describe("describeDevice", () => {
  it("辨認常見平台", () => {
    expect(describeDevice("Mozilla/5.0 (Linux; Android 13; CPH2371)")).toBe("Android");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("iOS");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64)")).toBe("Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("Mac");
  });

  it("認不出來時給一個中性名稱，不要空字串", () => {
    expect(describeDevice("something weird")).toBe("其他裝置");
    expect(describeDevice("")).toBe("其他裝置");
  });
});

describe("isGoneStatus", () => {
  it("404 / 410 代表訂閱失效，要從資料庫刪掉", () => {
    expect(isGoneStatus(404)).toBe(true);
    expect(isGoneStatus(410)).toBe(true);
  });

  it("其他狀態碼只是這次失敗，不該刪訂閱", () => {
    expect(isGoneStatus(500)).toBe(false);
    expect(isGoneStatus(429)).toBe(false);
    expect(isGoneStatus(undefined)).toBe(false);
  });
});
